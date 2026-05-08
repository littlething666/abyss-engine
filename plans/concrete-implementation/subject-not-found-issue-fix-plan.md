# Subject Graph `subject not found` Root-Cause Fix Plan

Last updated: 2026-05-08

## Decision Summary

Subject Graph Generation is a backend-owned create-and-publish workflow. A new subject is **not** available to the client until the backend has generated both the Stage A Topic Lattice and the Stage B Prerequisite Edges, validated them, and published a complete Subject + Subject Graph + topic stubs into the Learning Content Store.

Accepted answers locked into this plan:

1. **Subject Graph Generation creates the Subject.** The backend is the source of truth for generated learning content and for sync back to IndexedDB/read caches.
2. **No partial subject availability.** Stage A topics must not create a client-visible subject or a partial client-visible Subject Graph.
3. **Learning Content remains device-scoped.** All reads/writes remain filtered by `device_id`; later auth migration tightens the same boundary to user identity.
4. **Subject metadata is backend-published from the accepted generation input and final graph.** See [Subject metadata contract](#subject-metadata-contract).
5. **Retries must repair the missing-subject class by replaying the corrected lifecycle.** Retrying a failed run or submitting a new run must not require manual D1 seeding.

## Root Cause

The durable `subject-graph` workflow persists the Stage A `subject-graph-topics` artifact and then immediately calls `applyArtifactToLearningContent()` for `subject-graph-topics`. That applier calls `requireSubject()` before writing the graph.

For a new device and new subject id, no `subjects` row exists yet, so Stage A generation succeeds but materialization fails with:

```txt
WorkflowFail: Learning Content subject not found: game-theory
```

The row is then misclassified as `llm:upstream-5xx` because `WorkflowFail` is not reliably preserved across nested Workflow step boundaries.

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

### PR 7 — Frontend sync/read posture

Files:

```txt
src/infrastructure/repositories/BackendDeckRepository.ts
src/features/contentGeneration/generationClient.ts
src/infrastructure/generationRunEventHandlers.ts
src/hooks/useContentGenerationHydration.ts
```

Checks:

1. The client treats run progress/SSE as progress only, not as proof that Learning Content is readable.
2. Subject manifest refresh occurs after `run.completed`, not after Stage A `artifact.ready`.
3. Local IndexedDB, if still present as a temporary read cache, syncs only backend-published complete subjects.
4. No frontend fallback creates the subject locally when backend reads 404 during generation.

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

## Rollout Order

1. Land tests that describe the desired lifecycle and reproduce the current failure.
2. Refactor Subject Graph workflow to stage Stage A and publish only after Stage B.
3. Add publication-state gating only if final-only writes are insufficient.
4. Fix Stage A cache behavior.
5. Add workflow failure classification across all workflows.
6. Prove retry behavior for failed subject-graph runs.
7. Update frontend refresh/sync behavior to rely on `run.completed` for Learning Content reads.

## Compliance, Risk & Drift Assessment

### Misalignment Check

Current code contradicts the locked domain decision by applying Stage A topics to the Learning Content Store before prerequisite wiring and by requiring a pre-existing subject for a workflow that is supposed to create one. No requested decision contradicts `AGENTS.md`; the fix strengthens backend source-of-truth and fail-loud boundaries.

### Architectural Risk

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Stage A no longer updates Learning Content, so Stage B must reliably load lattice artifacts. | Medium | Keep Stage A artifacts/checkpoints mandatory and fail loudly if missing. Add runtime tests for resume/cache paths. |
| Final publication touches multiple LCS tables. | High | Put publication in one named idempotent workflow step and use D1 transaction/batch semantics where possible. |
| Regeneration can overwrite ready content with partial content. | High | Do not write visible graph rows until complete replacement publish; gate reads if staging rows are introduced. |
| Cache-hit semantics currently complete Stage A-only runs. | High | Rewrite subject-graph cache path to continue to Stage B. |
| Failure-code classifier could mask unexpected errors if too broad. | Medium | Preserve explicit `WorkflowFail` only by class/shape; classify unknowns separately from LLM provider failures. |

### Prompt Drift Prevention

This plan must not normalize:

- partial Subject Graph publication;
- subject seeding as a manual/dev workaround;
- frontend subject creation fallback;
- icon-name repair maps;
- probabilistic recovery after malformed artifacts;
- generic `llm:upstream-5xx` classification for non-LLM preconditions;
- cross-device subject lookup to compensate for missing local device rows.
