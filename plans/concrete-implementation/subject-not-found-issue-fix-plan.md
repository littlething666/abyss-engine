# Subject Graph `subject not found` Root-Cause Fix Plan

Last updated: 2026-05-08

Status: backend workflow/Learning Content publication path implemented on 2026-05-08, and the frontend durable-mode read/write authority mismatch has been fixed. The original backend missing-subject failure is fixed, and durable subject-graph artifacts are no longer applied to IndexedDB by the frontend. The plan remains open only for broader proof-matrix/runtime coverage and retry verification.

## Implementation Record

Completed work:

- Stage A Topic Lattice generation now persists/checkpoints artifacts only and no longer calls Learning Content application for `subject-graph-topics`.
- Stage A cache hits now load the cached lattice, mark artifact readiness/checkpoint state idempotently, and continue to Stage B instead of completing the run.
- Stage B input hashing includes the Stage A lattice content hash.
- `publishCompleteSubjectGraphToLearningContent()` now assembles and publishes the complete generated Subject, Subject Graph, and unavailable topic-detail stubs after both Stage A and Stage B artifacts are present.
- `ILearningContentRepo.publishGeneratedSubjectGraph()` batches generated Subject, Subject Graph, and topic stub writes behind one publication seam.
- Incremental `subject-graph-topics` / `subject-graph-edges` Learning Content appliers now fail loudly; subject graph artifacts must use the complete publisher.
- Workflow terminal failure handling now recognizes serialized `WorkflowFail` values and preserves structured codes/messages across workflow step boundaries.
- Updated/added tests around complete subject graph publication and serialized workflow failure detection.
- Frontend durable subject-graph `artifact.ready` handling is now progress-only: it does not fetch artifacts, does not apply `SubjectGraphApplier`, does not write IndexedDB graphs, and does not invalidate canonical content queries before backend publication.
- Frontend subject-graph `run.completed` now invokes a narrow backend-publication invalidation seam for manifest + graph query keys and emits `subject-graph:generated` independently of local artifact application.
- Legacy frontend `SubjectGraphApplier` and its tests were removed; subject-graph artifacts have no frontend/local Learning Content applier in the current unpublished app.

Validation performed:

```txt
pnpm --filter abyss-durable-orchestrator typecheck
pnpm --filter abyss-durable-orchestrator test
pnpm --filter abyss-durable-orchestrator test:runtime
```

Remaining before this plan can be deleted:

- Add explicit end-to-end/runtime tests for the full proof matrix: new subject publish, Stage A success + Stage B failure invisibility, regeneration failure preserving the old graph, Stage A cache hit continuing to Stage B, retry of the old missing-subject failure, WorkflowFail serialization, and device isolation.
- Verify retry planning for failed subject-graph runs replays the corrected lifecycle without requiring manual subject seeding, including parent/child lineage coverage.
- Decide whether stronger D1 transactional guarantees are needed beyond the current batched publication method.

## Decision Summary

Subject Graph Generation is a backend-owned create-and-publish workflow. A new subject is **not** available to the client until the backend has generated both the Stage A Topic Lattice and the Stage B Prerequisite Edges, validated them, and published a complete Subject + Subject Graph + topic stubs into the Learning Content Store.

Accepted answers locked into this plan:

1. **Subject Graph Generation creates the Subject.** The backend is the source of truth for generated learning content and for sync back to IndexedDB/read caches.
2. **No partial subject availability.** Stage A topics must not create a client-visible subject or a partial client-visible Subject Graph.
3. **Learning Content remains device-scoped.** All reads/writes remain filtered by `device_id`; later auth migration tightens the same boundary to user identity.
4. **Subject metadata is backend-published from the accepted generation input and final graph.** See [Subject metadata contract](#subject-metadata-contract).
5. **Retries must repair the missing-subject class by replaying the corrected lifecycle.** Retrying a failed run or submitting a new run must not require manual D1 seeding.
6. **`artifact.ready` is not Learning Content readiness for subject graphs.** In durable subject-graph runs, only `run.completed` implies manifest/graph routes may be refetched as published Learning Content.

## Root Cause

### Original backend root cause — fixed in the current implementation record

The durable `subject-graph` workflow persisted the Stage A `subject-graph-topics` artifact and then immediately called `applyArtifactToLearningContent()` for `subject-graph-topics`. That applier called `requireSubject()` before writing the graph.

For a new device and new subject id, no `subjects` row existed yet, so Stage A generation succeeded but materialization failed with:

```txt
WorkflowFail: Learning Content subject not found: game-theory
```

The row was then misclassified as `llm:upstream-5xx` because `WorkflowFail` was not reliably preserved across nested Workflow step boundaries.

### Remaining frontend read-model root cause — open

The backend now intentionally writes `subjects` + `subject_graphs` only in `publish:subject-graph:complete`, after both Stage A and Stage B artifacts are stored and after both `artifact.ready` events have been appended. Therefore `GET /v1/library/manifest` and `GET /v1/subjects/:subjectId/graph` are expected to return 404 / omit the subject until `publishCompleteSubjectGraphToLearningContent()` succeeds and `run.completed` is emitted.

Durable-mode frontend composition contradicts that lifecycle:

1. `createDeckRepository()` selects `BackendDeckRepository` when durable runs are enabled, so `useSubjectGraph()` reads the graph over HTTP from `/v1/subjects/:subjectId/graph`.
2. Before PR 7, `generationRunEventHandlers` treated subject-graph `artifact.ready` events as locally applicable content and called `SubjectGraphApplier`.
3. The removed `SubjectGraphApplier.applyTopics()` wrote partial graphs to IndexedDB through `deckWriter.upsertGraph()`.
4. `deckContentWriter.upsertGraph()` emitted `subject:updated`, and `pubSubClient` invalidated `['content', 'subject', subjectId, 'graph']`.
5. TanStack Query immediately refetched through `BackendDeckRepository`, before backend publication existed, and received the expected 404.
6. This is now fixed: durable subject-graph `artifact.ready` events are progress-only, frontend IndexedDB graph application has been removed, and manifest/graph invalidation happens only after subject-graph `run.completed`.

This was not a device-id issue and not evidence that D1 publication failed. It was a split-brain read/write model: subject-graph artifacts were being written to IndexedDB as if IndexedDB were the active read model, while canonical subject graph reads were already backend-owned.

## Non-Goals

- Do not add downstream fallback parsing or icon-name repair.
- Do not seed test/dev subjects manually as the fix.
- Do not make browser IndexedDB the source of truth for generated subjects.
- Do not expose a partially generated Subject Graph to Learning Content reads.
- Do not introduce Durable Objects as the orchestrator or source-of-truth database.

## Target Lifecycle

```txt
POST /v1/runs { kind: 'subject-graph', intent.stage: 'topics' }
  -> backend expands snapshot and creates run
  -> Stage A generates Topic Lattice artifact
  -> Stage A artifact is stored/checkpointed only; no Learning Content publication
  -> Stage B generates Prerequisite Edges from the authoritative Stage A artifact
  -> publish step assembles the complete Subject Graph
  -> publish step writes Subject + Subject Graph + topic detail stubs atomically/idempotently
  -> run.completed is emitted only after publication succeeds
  -> frontend invalidates/refetches manifest + graph queries
  -> manifest/graph/topic routes can now expose the subject
```

A Stage A cache hit must reuse the cached lattice and continue to Stage B; it must not mark the subject-graph run completed.

## Subject metadata contract

When publishing a generated subject, the backend writes a valid `subjects.metadata_json` manifest envelope:

```ts
{
  subject: {
    description: snapshot.strategy_brief.audience_brief,
    color: '#6366f1',
    geometry: { gridTile: 'box' },
    topicIds: finalGraph.nodes.map((node) => node.topicId),
    metadata: {
      checklist: snapshot.checklist,
      strategy: {
        graph: {
          totalTiers: snapshot.strategy_brief.total_tiers,
          topicsPerTier: snapshot.strategy_brief.topics_per_tier,
          audienceBrief: snapshot.strategy_brief.audience_brief,
          domainBrief: snapshot.strategy_brief.domain_brief,
          focusConstraints: snapshot.strategy_brief.focus_constraints,
        },
      },
      generation: {
        createdByRunId: runId,
        sourceArtifactKinds: ['subject-graph-topics', 'subject-graph-edges'],
        topicsContentHash,
        edgesContentHash,
      },
    },
  },
}
```

Rules:

- `title`/frontend `Subject.name` comes from `snapshot.checklist.topic_name`.
- Empty or malformed title/description/geometry is a hard boundary failure.
- `topicIds` is derived from the final graph, not from client input.
- `createdByRunId` is the publishing run id for initial generation.
- Regeneration of an existing ready subject must keep the old ready subject visible until the replacement graph publish step succeeds.

Follow-up option after this fix: move strategy resolution fully backend-side so `strategy_brief` is derived from the checklist instead of accepted from the client durable adapter. That is not required to repair this failure, but it better matches the backend-source-of-truth direction.

## Implementation Plan

### PR 1 — Lock reproduction and publication-boundary tests

Files to update/add:

```txt
backend/src/learningContent/artifactApplication.test.ts
backend/src/workflows/subjectGraphWorkflow.test.ts or backend/src/runtimeTests/subjectGraphWorkflow.runtime.test.ts
backend/src/routes/learningContent.test.ts
backend/src/runtimeTests/runsRoute.runtime.test.ts
```

Tests:

1. **New subject Stage A does not require an existing subject row**
   - Simulate a `subject-graph-topics` artifact for a device with no `subjects` row.
   - Assert Stage A persistence/checkpoint succeeds without calling `putSubjectGraph()`.

2. **Subject is not visible before complete publication**
   - During/after Stage A only, assert:
     - `GET /v1/library/manifest` does not include the new subject.
     - `GET /v1/subjects/:subjectId/graph` returns 404.
     - topic details/card routes for generated topics return 404.

3. **Complete publication exposes the subject**
   - After Stage A + Stage B + publish step, assert manifest includes the subject and graph has prerequisites.

4. **Stage A cache hit does not complete the run**
   - Seed a cached `subject-graph-topics` artifact.
   - Submit subject-graph topics intent.
   - Assert workflow continues to Stage B or queues Stage B work; it must not emit terminal `run.completed` from the cache hit alone.

5. **Regeneration keeps old graph visible until replacement publish succeeds**
   - Seed a ready subject and graph.
   - Run Stage A for regeneration and fail before Stage B publish.
   - Assert reads still return the old complete graph, not partial Stage A nodes.

### PR 2 — Replace Stage A Learning Content application with staged artifact use

Files:

```txt
backend/src/workflows/subjectGraphWorkflow.ts
backend/src/learningContent/artifactApplication.ts
backend/src/learningContent/artifactApplication.test.ts
```

Changes:

1. Stop calling `applyArtifactToLearningContent()` for `subject-graph-topics` inside the Stage A path.
2. Keep Stage A behavior limited to:
   - strict parse,
   - semantic validation,
   - artifact storage,
   - stage checkpoint `ready`,
   - lattice extraction for Stage B prompt/context,
   - optional `artifact.ready` event if the event is documented as artifact availability rather than Learning Content availability.
3. Replace `applySubjectGraphTopics()` / `applySubjectGraphEdges()` as the durable publication path with a new high-level function, for example:

```ts
publishCompleteSubjectGraphToLearningContent({
  learningContent,
  deviceId,
  runId,
  snapshot,
  topicsPayload,
  edgesPayload,
  topicsContentHash,
  edgesContentHash,
})
```

4. The publish function assembles the final graph from topics + edges in one place and writes:
   - subject row,
   - complete subject graph,
   - topic detail stubs with `status: 'unavailable'`,
   - any required topic-card initialization only if the repository supports empty decks without violating invariants.
5. Keep topic-content, topic-expansion, mini-game, and Crystal Trial appliers unchanged except for any shared helper extraction.

Design note: do not create a generic shallow pass-through applier. The complete subject-graph publisher should be a deep module that owns the lifecycle invariant: no visible subject without a complete graph.

### PR 3 — Add repository publication support and read gating if needed

Preferred implementation avoids visible partial writes by not writing subject/graph rows until final publish. If code simplicity or idempotent retry behavior requires staged rows, add explicit publication state.

Files if publication state is needed:

```txt
backend/d1/init.sql
backend/d1/reset.sql
backend/src/learningContent/types.ts
backend/src/learningContent/learningContentRepo.ts
backend/src/routes/learningContent.ts
backend/src/learningContent/learningContentRepo.test.ts
backend/src/routes/learningContent.test.ts
```

Rules if adding state:

- Add `subjects.publication_status` with allowed values such as `'staging' | 'ready'`.
- Manifest route returns only `ready` subjects.
- Graph/details/cards/trials routes return 404 for non-ready subjects.
- Existing ready subjects remain ready until replacement publication succeeds.
- Do not expose an `includeStaging` option to the frontend repository.

Because this app is unreleased, update the canonical D1 schema/reset files directly rather than adding numbered migrations.

### PR 4 — Correct subject-graph cache behavior

Files:

```txt
backend/src/workflows/subjectGraphWorkflow.ts
backend/src/runtimeTests/runsRoute.runtime.test.ts
backend/src/runtimeTests/subjectGraphWorkflow.runtime.test.ts
```

Changes:

1. Remove the current Stage A cache branch that applies topics and marks the run ready.
2. On cached Stage A lattice:
   - load the cached artifact payload,
   - extract `latticeTopics` and `latticeTopicIds`,
   - set `latticeArtifactContentHash`,
   - emit/cache-mark the Stage A artifact-ready/checkpoint state idempotently,
   - continue to Stage B.
3. Ensure Stage B input hash includes the Stage A lattice `content_hash` if the existing hash model does not already do so.
4. Only complete the run after `publishCompleteSubjectGraphToLearningContent()` succeeds.

### PR 5 — Preserve structured workflow failure codes across step boundaries

Files:

```txt
backend/src/lib/workflowErrors.ts
backend/src/workflows/shared/workflowFailureClassification.ts
backend/src/workflows/subjectGraphWorkflow.ts
backend/src/workflows/topicContentWorkflow.ts
backend/src/workflows/topicExpansionWorkflow.ts
backend/src/workflows/crystalTrialWorkflow.ts
backend/src/lib/workflowErrors.test.ts
```

Changes:

1. Add structural detection for serialized workflow failures:

```ts
isWorkflowFailLike(err): err is { name?: string; code: string; message: string }
```

2. Add a classifier:

```ts
classifyWorkflowTerminalError(err): { code: GenerationFailureCode | string; message: string; runtimeError: Error }
```

3. Use the classifier in every workflow catch block.
4. Only classify errors from LLM call boundaries as `llm:*`.
5. For known `WorkflowFail`/serialized `WorkflowFail`, write the original code/message to the run row and failed event.
6. For non-LLM unexpected errors, use `config:invalid` or introduce an explicit `state:unexpected-workflow-error` after updating the shared failure-code contract and all consumers.

Expected result for the traced failure class if the invariant is ever broken again:

```txt
error_code = precondition:missing-topic
error_message = Learning Content subject not found: game-theory
```

### PR 6 — Retry behavior for previously failed runs

Files:

```txt
backend/src/routes/retryPlanning.ts
backend/src/routes/runs.ts
backend/src/runtimeTests/runsRoute.runtime.test.ts
backend/src/routes/runs.retry.test.ts
```

Rules:

1. Retrying a failed subject-graph run should create a child run using the same subject id and checklist/strategy snapshot lineage.
2. The child run must use the new lifecycle:
   - Stage A artifact may be reused from checkpoint/cache,
   - Stage A does not publish partial content,
   - Stage B and final publish are required before completion.
3. If the failed parent already has a valid Stage A artifact, retry may resume from Stage B, but final publish must still use both Stage A and Stage B artifacts.
4. If the parent failure was the old `Learning Content subject not found` issue, the retry should succeed without manual subject seeding.
5. Do not mutate the parent run row; keep lineage through `parent_run_id`.

### PR 7 — Fix durable-mode frontend read/write authority mismatch

Root-cause decision: when durable subject-graph generation is enabled, the backend Learning Content Store is the only canonical read/write model for generated subjects. Browser IndexedDB may cache backend-published content later, but it must not become an implicit staging store for subject-graph artifacts and must not invalidate canonical content queries before `run.completed`.

Status: implemented. Durable subject-graph artifacts are not frontend-applied; the legacy `SubjectGraphApplier` was removed.

Files changed:

```txt
src/infrastructure/generationRunEventHandlers.ts
src/infrastructure/generationRunEventHandlers.test.ts
src/infrastructure/pubsub.ts
src/infrastructure/pubsub.test.ts
src/infrastructure/wireGenerationClient.ts
src/features/generationContracts/artifacts/applier.ts
src/features/subjectGeneration/index.ts
```

Implementation notes:

1. **Durable subject-graph artifact application to IndexedDB is removed.**
   - `generationRunEventHandlers` treats `subject-graph-topics` and `subject-graph-edges` `artifact.ready` events as progress/artifact availability only.
   - Those events still advance the durable event cursor so SSE replay remains idempotent.
   - Topic-content, topic-expansion, mini-game, and Crystal Trial artifact application remain unchanged while those pipelines still rely on local artifact materialization.

2. **Subject-graph content invalidation moved to `run.completed`.**
   - On subject-graph `run.completed`, `PubSubClient.publishBackendSubjectGraph(subjectId)` invalidates backend-published content:
     - `['content', 'subjects']` / manifest keys;
     - `['content', 'subject', subjectId, 'graph']`;
     - `['content', 'subject', 'graphs']`.
   - This invalidation occurs after the terminal event because the backend workflow emits `run.completed` only after `publish:subject-graph:complete` succeeds.
   - Graph queries are not invalidated by subject-graph Stage A/B `artifact.ready`.

3. **Product completion events no longer depend on local subject-graph artifact writes.**
   - Subject-graph `run.completed` emits `subject-graph:generated` even though no local subject-graph artifact was applied.
   - Replay idempotency is keyed by the durable cursor / terminal event seq.

4. **`SubjectGraphApplier` is deleted.**
   - No frontend/local applier exists for subject-graph artifacts in the current unpublished app.
   - The fix explicitly does not make any frontend applier read IndexedDB while `BackendDeckRepository` reads HTTP.

5. **Do not add 404 backoff/retry as the primary fix.**
   - A 404 before publication is correct backend behavior.
   - Query retry/backoff would only hide the artifact-ready invalidation bug and normalize probabilistic recovery.
   - If a UI needs to show generation progress, read the run/SSE state or artifact metadata, not the Learning Content graph route.

6. **Do not implement local-first graph reads for this lifecycle unless the product decision changes.**
   - Local-first reads would expose partial Stage A content and contradict the locked “No partial subject availability” decision.
   - If partial preview is later desired, build a separate preview model/key/surface that is explicitly not Learning Content and cannot satisfy `useSubjectGraph()`.

7. **`buildApplyContext()` no longer carries subject-graph Stage A state.**
   - `subjectGraphLatticeContentHash` was removed from the frontend artifact apply context because Stage B artifacts are no longer locally applied.
   - Regression coverage asserts Stage A + Stage B `artifact.ready` events do not call `getSubjectGraph()` before `run.completed`, and backend content refresh occurs only after completion.

8. **Rehydrate only publication-complete subject graphs.**
   - `useContentGenerationHydration` may observe active durable subject-graph runs for progress/failure events, but it must not replay subject-graph artifact application into IndexedDB.
   - Recently completed runs may trigger the same `run.completed` content invalidation if their terminal seq was not yet processed.

Tests:

1. Implemented: `generationRunEventHandlers` proves subject-graph `artifact.ready` does not call `client.getArtifact()`, does not apply a graph artifact, does not call `deckRepository.getSubjectGraph()`, and does not publish/invalidate backend content.
2. Implemented: `generationRunEventHandlers` proves subject-graph `run.completed` invalidates/publishes backend graph readiness and emits `subject-graph:generated` once across replay.
3. Implemented: `generationRunEventHandlers` proves Stage A + Stage B artifact-ready progress does not call `getSubjectGraph()` before completion.
4. Implemented: `pubsub` proves backend-published subject graph invalidation uses `subject-graph:published`, not generic local `subject:updated` semantics.
5. Remaining: hydration-specific coverage for active and recently completed durable subject-graph runs.
6. Remaining: E2E/runtime browser-path proof that no frontend `GET /v1/subjects/:subjectId/graph` is triggered by Stage A artifact readiness and the first intended graph refetch occurs after `run.completed`.

## Runtime Proof Matrix

| Scenario | Required proof |
| --- | --- |
| New device creates `game-theory` | Run completes and manifest shows one complete subject after completion. |
| Stage A succeeds, Stage B fails | Manifest and graph routes do not expose the new subject. |
| Existing subject regeneration fails after Stage A | Old complete subject remains visible; no partial graph leaks. |
| Stage A artifact cache hit | Run continues to Stage B/final publish; no Stage-A-only completion. |
| Retry old missing-subject failure | Child run publishes without manual subject seed. |
| WorkflowFail across `step.do` | Run row keeps original structured failure code. |
| Device isolation | Same `subjectId` under another `deviceId` is neither read nor mutated. |
| Durable frontend mid-run | Stage A/Stage B `artifact.ready` events do not invalidate or refetch canonical graph queries; backend graph refetch occurs after `run.completed` and returns 200. |

## Rollout Order

1. Land tests that describe the desired lifecycle and reproduce the current failure.
2. Refactor Subject Graph workflow to stage Stage A and publish only after Stage B.
3. Add publication-state gating only if final-only writes are insufficient.
4. Fix Stage A cache behavior.
5. Add workflow failure classification across all workflows.
6. Prove retry behavior for failed subject-graph runs.
7. Done: fix durable frontend subject-graph event handling so `artifact.ready` is progress-only and only `run.completed` invalidates backend Learning Content reads.

## Compliance, Risk & Drift Assessment

### Misalignment Check

The original backend contradiction was Stage A publication into the Learning Content Store before prerequisite wiring. The frontend contradiction, where durable subject-graph `artifact.ready` drove local IndexedDB graph writes and canonical query invalidation before backend publication, is now fixed. No requested decision contradicts `AGENTS.md`; the updated fix strengthens backend source-of-truth, feature/infrastructure boundaries, and fail-loud semantics.

### Architectural Risk

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Stage A no longer updates Learning Content, so Stage B must reliably load lattice artifacts. | Medium | Keep Stage A artifacts/checkpoints mandatory and fail loudly if missing. Add runtime tests for resume/cache paths. |
| Final publication touches multiple LCS tables. | High | Put publication in one named idempotent workflow step and use D1 transaction/batch semantics where possible. |
| Regeneration can overwrite ready content with partial content. | High | Do not write visible graph rows until complete replacement publish; gate reads if staging rows are introduced. |
| Cache-hit semantics currently complete Stage A-only runs. | High | Rewrite subject-graph cache path to continue to Stage B. |
| Failure-code classifier could mask unexpected errors if too broad. | Medium | Preserve explicit `WorkflowFail` only by class/shape; classify unknowns separately from LLM provider failures. |
| Durable frontend previously wrote partial subject graphs to IndexedDB while reading canonical graphs over HTTP. | Mitigated | Subject-graph artifact application was removed from durable frontend handling; backend manifest/graph keys invalidate only after `run.completed`. |
| Completion events previously depended on `newArtifactsApplied`; removing local subject-graph artifact application could suppress product events. | Mitigated | Subject-graph completion now has a publication-complete path keyed to `run.completed` + durable cursor idempotency. |

### Prompt Drift Prevention

This plan must not normalize:

- partial Subject Graph publication;
- subject seeding as a manual/dev workaround;
- frontend subject creation fallback;
- icon-name repair maps;
- probabilistic recovery after malformed artifacts;
- generic `llm:upstream-5xx` classification for non-LLM preconditions;
- cross-device subject lookup to compensate for missing local device rows;
- query retry/backoff or local-first reads as a substitute for fixing subject-graph artifact-ready invalidation;
- using IndexedDB partial Stage A graphs to satisfy canonical durable `useSubjectGraph()` reads.
