<aside>
📌

**Scope.** Code-grounded implementation plan for Phase 2 of the Durable Workflow Orchestration program. Reflects the live `littlething666/abyss-engine` codebase as of `main@716b078` plus the stacked Phase 0 step 1–11 PR series and the planned Phase 0.5 / Phase 1 subpages. Phase 2 ports the three remaining pipelines — **Topic Content**, **Topic Expansion**, and **Subject Graph (Topic Lattice + Prerequisite Edges)** — onto Cloudflare Workflows + Supabase + server-side OpenRouter, behind `NEXT_PUBLIC_DURABLE_RUNS`. Each pipeline lands in its own PR. Crystal Trial (Phase 1 pilot) is **not** revisited.

**Flag.** `NEXT_PUBLIC_DURABLE_RUNS` stays the single feature flag. Phase 2 PRs flip individual pipeline kinds inside the `GenerationClient` factory (Phase 0.5 step 7) — never the global flag — so partial rollouts and rollbacks per pipeline are possible without regressing Crystal Trial.

</aside>

> **Current DB note (2026-05-07):** This phase is historical. The unreleased
> database workflow has been squashed into `backend/db/reset.sql` and
> `backend/db/init.sql` for hosted Supabase SQL-editor execution. Numbered
> migration references below document landed design history, not current setup
> instructions.

## 🔍 Compliance, Risk & Drift Assessment

*(mandated by repo-root [AGENTS.md](http://AGENTS.md) § "Mandatory Collaboration Output". Every Phase 2 PR description must reproduce this assessment.)*

### Misalignment check

- **Layered architecture.** New Workflow classes live under `backend/src/workflows/` (peers of Phase 1's `crystalTrialWorkflow.ts`). All three new `IGenerationRunRepository`-backed paths flow through the **existing** `DurableGenerationRunRepository` and `apiClient` in `src/infrastructure/`. No file under `src/features/**` or `src/components/**` gains a `fetch` import.
- **Repository pattern preserved.** `IGenerationRunRepository` (added in Phase 0.5 step 1) gains no new public methods. Each of the three pipelines stays addressable by `client.startTopicContent / startTopicExpansion / startSubjectGraph(...)` exactly as Phase 0.5 step 3 specified.
- **`eventBusHandlers` exception preserved.** All `RunEvent → AppEventMap` mapping continues through `src/infrastructure/generationRunEventHandlers.ts`. Phase 2 only widens the dispatch table on `artifact.ready` and `run.failed` to cover the new artifact kinds; no new infrastructure→features composition root is introduced.
- **Analytics SDK isolation.** No new `posthog-js` import outside `src/infrastructure/posthog/*`. Worker-side tracing remains server-only and never enters the browser bundle. Mentor / HUD / telemetry side-effects stay derivative of `RunEvent`s, never of direct LLM I/O.
- **No magic strings.** New Workflow steps, schema versions, and failure codes are imported from `@/features/generationContracts/runEvents` and `@/features/generationContracts/failureCodes`. The seven `ArtifactKind` literals (`topic-theory`, `topic-study-cards`, `topic-mini-game-category-sort`, `topic-mini-game-sequence-build`, `topic-mini-game-match-pairs`, `topic-expansion-cards`, `subject-graph-topics`, `subject-graph-edges`) come from `@contracts/artifacts/types.ts`.
- **Strategic over tactical.** Strict JSON Schema, exact-JSON parse, single semantic-validation pass, hard-fail at boundary — same gate as Phase 1. No `extractJsonString()`, no permissive parser fallback, no `json_object` second pass. OpenRouter `response-healing` stays as provider-side structured-output assistance.
- **No legacy burden.** Once a pipeline's PR lands, its `LocalGenerationRunRepository` adapter (Phase 0.5 step 2.3) keeps working when the flag is OFF. The legacy in-tab runners (`runTopicGenerationPipeline.ts`, `runExpansionJob.ts`, `subjectGenerationOrchestrator.ts`) stay untouched in Phase 2 — they are deleted in Phase 4.
- **Curriculum prerequisite-edge exception preserved.** Phase 2 ships Subject Graph durably; the narrow [AGENTS.md](http://AGENTS.md) deterministic-repair exception in `prerequisiteEdgeRules.ts` (`createPrerequisiteEdgeRules(...).acceptModelResponse(raw).observation`) is the **only** correction allowed and lives **inside** the parse step (server-side), exactly as it lives in `subjectGenerationOrchestrator.ts.parseOutput` today. The applier consumes the corrected lattice without re-running the correction.
- **Mobile-first / WebGPU strictness.** No UI surface, renderer, or shader code is touched in Phase 2.

### Architectural risk

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Topic Content's three-stage Workflow checkpoints (theory → study-cards → mini-games) silently re-bill OpenRouter on resume after a Worker eviction at the mini-game stage. | High | Per-stage `stage_checkpoints` row carries `artifact_id` once persisted; resume gates on `select stage, artifact_id from stage_checkpoints where run_id = ?` and skips any stage whose `artifact_id is not null`. Workflow `step.do('generate-mini-games:<gameType>', { retries: { limit: 2 } }, …)` is the **only** retried step; `parse` and `validate` carry no automatic retries. |
| Topic Expansion supersession (level-up twice in quick succession) emits a player-facing `topic-expansion:generation-failed` for the cancelled run. | High | Server enforces supersession via the `supersedes_key = te-supersedes:<topicRefKey>` request header. The runs table grows a partial unique index on `(device_id, supersedes_key) where status not in ('failed_final','cancelled','applied_local')`; conflicting submission updates the prior run with `cancel_reason = 'superseded'` before creating the new run. The composition root (Phase 0.5 step 6.2) already maps `run.cancelled / reason: 'superseded'` to NO `appEventBus` emission for `topic-expansion`, so the gate is end-to-end. |
| Subject Graph Stage B `correctPrereqEdges` deterministic repair runs in two places (server parse step + client applier), drifting on schema bumps. | Medium | The repair lives **only** server-side in `parseSubjectGraphEdges.ts`. The client applier consumes the corrected `SubjectGraph` artifact verbatim. A boundary test asserts `createPrerequisiteEdgeRules` is imported only by `backend/src/workflows/steps/parse.subjectGraphEdges.ts` and `src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.ts` (legacy, deleted in Phase 4) — never by an applier or a hook. |
| Subject Graph Stage B's `input_hash` does not include the Stage A artifact `content_hash`, so re-runs of Stage A produce duplicate Stage B runs that reuse a stale lattice. | Medium | `buildSubjectGraphEdgesRunInputSnapshot(...)` (Phase 0 step 2 contract module) MUST embed `latticeContentHash` so `inputHash(snapshot)` covers it. Tests in `@contracts/snapshots/subjectGraphSnapshots.test.ts` already pin this; Phase 2 adds a Workflow-side test that mutates the lattice and asserts a fresh `input_hash`. |
| Topic Content stage retries (`retryFailedJob` / `retryFailedPipeline`) lose `JOB_KIND_TO_STAGE` resolution after migration. | Low | `retryContentGeneration.ts` was already refactored in Phase 0.5 step 4.2 to call `client.retry(runId, { stage, jobId })`. Phase 2 only verifies the durable repo's `retryRun` honors `{ stage }` by minting a child run whose `snapshot_json.resumeFromStage = stage` and reusing the parent run's already-persisted earlier-stage `stage_checkpoints` rows. |

### Prompt-drift prevention

- Every Phase 2 PR description must call out: *no `json_object` fallback, no permissive parser, no inline `posthog-js` import outside `src/infrastructure/posthog/*`, no direct` fetch `outside` src/infrastructure/`, no magic-string status / event / failure-code / artifact-kind literals, no client-side` correctPrereqEdges`, no` extractJsonString` reintroduction*.
- Phase 1's `durableGenerationBoundary.test.ts` is extended (not duplicated): the file walk continues to forbid imports of `DurableGenerationRunRepository`, `apiClient`, and `sseClient` outside `src/infrastructure/`. Phase 2 adds a sibling `subjectGraphCorrectionBoundary.test.ts` that pins `createPrerequisiteEdgeRules` to the legacy orchestrator + the new server-side parse step.

## 🎯 Phase 2 goals (reaffirmed from Plan v3)

- Migrate all three remaining pipelines onto the durable substrate landed in Phase 1.
- Each pipeline lands in its own PR behind `NEXT_PUBLIC_DURABLE_RUNS`, with an isolated rollback per `PipelineKind`.
- Topic Content workflow exposes stage-level checkpoints (`theory`, `study-cards`, `mini-games`) so retries resume from the failed stage without re-billing earlier stages.
- Topic Expansion implements **superseded** cancellation: a newer level-up cancels in-flight expansion with `cancel_reason='superseded'`; the composition root suppresses the player-facing failure copy.
- Subject Graph workflow runs Stage A (Topic Lattice) then Stage B (Prerequisite Edges) with the Stage B `input_hash` covering the Stage A artifact `content_hash`. The narrow `correctPrereqEdges` deterministic repair stays server-side, inside the parse step.
- Snapshot determinism, strict schema/semantic validation, artifact apply idempotency, legacy App Event Bus compatibility, and retry lineage are proven per pipeline by the acceptance test matrices below.

## 🧱 Repository layout additions (relative to Phase 1 layout)

```
backend/                                          # extended
├── src/
│   ├── env.ts                                    # adds TOPIC_CONTENT_WORKFLOW, TOPIC_EXPANSION_WORKFLOW, SUBJECT_GRAPH_WORKFLOW bindings
│   ├── routes/
│   │   ├── runs.ts                               # widens kind discriminator to topic-content | topic-expansion | subject-graph
│   │   └── runEvents.ts                          # unchanged
│   ├── workflows/
│   │   ├── topicContentWorkflow.ts               # NEW — three stages with stage_checkpoints persistence
│   │   ├── topicExpansionWorkflow.ts             # NEW — single stage; supersedes_key support
│   │   ├── subjectGraphWorkflow.ts               # NEW — Stage A then Stage B; lattice content-hash threaded into Stage B input_hash
│   │   └── steps/
│   │       ├── plan.topicContent.ts              # snapshot-vs-input_hash drift check + cache-hit per stage
│   │       ├── plan.topicExpansion.ts            # snapshot-vs-input_hash drift check + supersession handshake
│   │       ├── plan.subjectGraph.ts              # Stage A vs Stage B branch
│   │       ├── generate.topicContent.ts          # one per stage; reuses openrouterClient.callTopicContent
│   │       ├── generate.topicExpansion.ts
│   │       ├── generate.subjectGraph.ts          # Stage A and Stage B variants
│   │       ├── parse.topicContent.ts             # exact-JSON Zod parse per stage
│   │       ├── parse.topicExpansion.ts
│   │       ├── parse.subjectGraphTopics.ts
│   │       ├── parse.subjectGraphEdges.ts        # invokes createPrerequisiteEdgeRules(...).acceptModelResponse(raw)
│   │       ├── validate.topicContent.ts          # validateTopicLattice equivalents per stage
│   │       ├── validate.topicExpansion.ts        # buildExistingConceptRegistry server-side replay
│   │       ├── validate.subjectGraphTopics.ts    # validateTopicLattice
│   │       ├── validate.subjectGraphEdges.ts     # validateGraph
│   │       ├── persist.topicContent.ts           # storage put + artifacts row + stage_checkpoints row
│   │       ├── persist.topicExpansion.ts
│   │       ├── persist.subjectGraph.ts           # one helper used by Stage A + Stage B
│   │       └── emit.ts                           # unchanged from Phase 1
│   ├── llm/
│   │   └── openrouterClient.ts                   # adds callTopicContent / callTopicExpansion / callSubjectGraph; same body-shape lockstep test as Phase 1
│   └── budget/
│       └── budgetGuard.ts                        # extends per-kind caps; defaults documented in @contracts/budgets.ts
└── migrations/
    ├── 0003_stage_checkpoints.sql                # NEW — see schema section
    └── 0004_supersedes_key.sql                   # NEW — partial unique index on runs(device_id, supersedes_key)

src/                                              # extended
├── infrastructure/
│   ├── generationRunEventHandlers.ts             # widens RunEvent → AppEventMap dispatch on artifact.ready / run.failed for the three new kinds
│   └── http/
│       └── apiClient.ts                          # adds Idempotency-Key / Supersedes-Key passthrough (latter is topic-expansion only)
├── features/
│   ├── contentGeneration/appliers/
│   │   ├── topicContentApplier.ts                # Phase 0.5 step 5.2 — extended for partial-stage application semantics
│   │   └── topicExpansionApplier.ts              # Phase 0.5 step 5.3 — supersession-aware
│   └── subjectGeneration/appliers/
│       └── subjectGraphApplier.ts                # Phase 0.5 step 5.4 — Stage A then Stage B gating preserved
└── features/contentGeneration/generationClient.ts
   # The factory's pipelineKindToRepo map flips kinds individually behind NEXT_PUBLIC_DURABLE_RUNS_KINDS env-derived allow-list.
```

## 🗄️ Supabase migrations

### `0003_stage_checkpoints.sql`

Stage-level checkpoint persistence. Required for Topic Content's three-stage resume and used (single-stage) for Topic Expansion / Subject Graph for symmetry.

```sql
create table stage_checkpoints (
  run_id uuid not null references runs(id) on delete cascade,
  stage text not null,                  -- 'theory' | 'study-cards' | 'mini-games' | 'topics' | 'edges' | 'expansion-cards'
  status text not null check (status in ('pending','generating','parsing','validating','persisting','ready','failed')),
  artifact_id uuid null references artifacts(id),
  job_id uuid null references jobs(id),
  input_hash text not null,             -- per-stage canonical hash; mini-games carries the gameType in its snapshot slice
  attempt integer not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null,
  primary key (run_id, stage)
);
create index idx_stage_checkpoints_run on stage_checkpoints(run_id);
```

Resume rule (server-side, in each Workflow's `plan.*` step): if `(run_id, stage)` exists with `artifact_id is not null`, the stage is **skipped** and the prior `artifact_id` is consumed for the next stage's input.

### `0004_supersedes_key.sql`

Server-side supersession for Topic Expansion. The browser passes `Supersedes-Key: te-supersedes:<topicRefKey>` on `POST /v1/runs` for `kind = 'topic-expansion'`.

```sql
alter table runs add column supersedes_key text null;
create unique index idx_runs_active_supersedes
  on runs(device_id, supersedes_key)
  where supersedes_key is not null
   and status not in ('failed_final','cancelled','applied_local');
```

The `POST /v1/runs` handler runs the supersession transaction in a single `BEGIN ... COMMIT`:

```sql
-- inside a transaction
update runs set cancel_requested_at = now(), cancel_reason = 'superseded'
where device_id = :deviceId
  and supersedes_key = :supersedesKey
  and status not in ('failed_final','cancelled','applied_local');

insert into runs (id, device_id, kind, status, input_hash, idempotency_key, supersedes_key, snapshot_json)
values (:newRunId, :deviceId, 'topic-expansion', 'queued', :inputHash, :idempotencyKey, :supersedesKey, :snapshotJson);
```

The Workflow's first cancel-checkpoint then writes the terminal `cancelled` event for the prior run with `boundary: 'before-plan'`, `reason: 'superseded'`.

## ⚙️ `topicContentWorkflow.ts` — three-stage durable pipeline

Mirrors `runTopicGenerationPipeline.ts`'s ordering: **theory → study-cards → mini-games (×3 in parallel)**. The `stage` parameter (`'theory' | 'study-cards' | 'mini-games' | 'full'`) and `resumeFromStage` are carried in the snapshot, matching the legacy `RunTopicGenerationPipelineParams` shape.

```tsx
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import {
  buildTopicTheorySnapshot,
  buildTopicStudyCardsSnapshot,
  buildTopicMiniGameCardsSnapshot,
  strictParseArtifact,
  semanticValidateArtifact,
  canonicalHash,
  type TopicContentRunInputSnapshot,
} from '@contracts';
import { WorkflowAbort, WorkflowFail } from '../lib/workflowErrors';
import { openrouterClient } from '../llm/openrouterClient';
import { makeRepos } from '../repositories';

type Params = { runId: string; deviceId: string };
const MINI_GAME_TYPES = ['CATEGORY_SORT','SEQUENCE_BUILD','MATCH_PAIRS'] as const;

export class TopicContentWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { runId, deviceId } = event.payload;
    const repos = makeRepos(this.env);
    const checkCancel = makeCancelChecker(repos, runId, deviceId);

    // ---- PLAN: load snapshot, resolve resume mask, drift-check ----
    await checkCancel('before-plan');
    const plan = await step.do('plan', async () => {
      const run = await repos.runs.load(runId);
      const snap = run.snapshot_json as TopicContentRunInputSnapshot;
      if (canonicalHash.inputHash(snap) !== run.input_hash) {
        throw new WorkflowFail('parse:zod-shape', 'topic-content snapshot drift between submit and run');
      }
      const checkpoints = await repos.stageCheckpoints.byRun(runId);
      const resumeFrom = snap.resumeFromStage ?? 'theory';
      const wantedStages = stagesForRequest(snap.stage, resumeFrom);
      return { snap, checkpoints, wantedStages };
    });

    // ---- THEORY ----
    let theoryArtifactId: string | undefined =
      plan.checkpoints.find(c => c.stage === 'theory' && c.artifact_id)?.artifact_id;
    if (plan.wantedStages.includes('theory') && !theoryArtifactId) {
      await checkCancel('before-theory');
      theoryArtifactId = await runStage(step, repos, runId, deviceId, 'theory', plan.snap, async () => {
        const raw = await openrouterClient.callTopicContent({ stage: 'theory', snapshot: plan.snap, env: this.env });
        const parsed = strictParseArtifact('topic-theory', raw.text);
        if (!parsed.ok) throw new WorkflowFail(parsed.code, parsed.message);
        const sem = semanticValidateArtifact('topic-theory', parsed.value, {
          subjectId: plan.snap.subjectId, topicId: plan.snap.topicId,
        });
        if (!sem.ok) throw new WorkflowFail(sem.code, sem.message);
        return { kind: 'topic-theory' as const, payload: parsed.value, usage: raw.usage };
      });
    }

    // ---- STUDY CARDS ----
    let studyArtifactId: string | undefined =
      plan.checkpoints.find(c => c.stage === 'study-cards' && c.artifact_id)?.artifact_id;
    if (plan.wantedStages.includes('study-cards') && !studyArtifactId) {
      await checkCancel('before-study-cards');
      // study-cards consumes the persisted theory artifact (no re-LLM)
      const theory = await repos.artifacts.load<'topic-theory'>(theoryArtifactId!);
      studyArtifactId = await runStage(step, repos, runId, deviceId, 'study-cards', plan.snap, async () => {
        const raw = await openrouterClient.callTopicContent({ stage: 'study-cards', snapshot: plan.snap, theory: theory.payload, env: this.env });
        const parsed = strictParseArtifact('topic-study-cards', raw.text);
        if (!parsed.ok) throw new WorkflowFail(parsed.code, parsed.message);
        const sem = semanticValidateArtifact('topic-study-cards', parsed.value, {
          groundingSources: theory.payload.groundingSources,
        });
        if (!sem.ok) throw new WorkflowFail(sem.code, sem.message);
        return { kind: 'topic-study-cards' as const, payload: parsed.value, usage: raw.usage };
      });
    }

    // ---- MINI-GAMES (three in parallel) ----
    if (plan.wantedStages.includes('mini-games')) {
      await checkCancel('before-mini-games');
      const theory = await repos.artifacts.load<'topic-theory'>(theoryArtifactId!);
      // Each gameType is its own checkpoint; resume skips already-persisted ones.
      const persisted = new Set(
        plan.checkpoints
          .filter(c => c.stage.startsWith('mini-games:') && c.artifact_id)
          .map(c => c.stage.split(':')[1] as typeof MINI_GAME_TYPES[number]),
      );
      const pending = MINI_GAME_TYPES.filter(g => !persisted.has(g));
      const miniArtifactIds = await Promise.all(
        pending.map(gameType =>
          runStage(step, repos, runId, deviceId, `mini-games:${gameType}`, plan.snap, async () => {
            const raw = await openrouterClient.callTopicContent({ stage: 'mini-games', gameType, snapshot: plan.snap, theory: theory.payload, env: this.env });
            const artifactKind = `topic-mini-game-${gameType.toLowerCase().replaceAll('_','-')}` as const;
            const parsed = strictParseArtifact(artifactKind, raw.text);
            if (!parsed.ok) throw new WorkflowFail(parsed.code, parsed.message);
            const sem = semanticValidateArtifact(artifactKind, parsed.value, { gameType, groundingSources: theory.payload.groundingSources });
            if (!sem.ok) throw new WorkflowFail(sem.code, sem.message);
            return { kind: artifactKind, payload: parsed.value, usage: raw.usage };
          }),
        ),
      );
      // Cross-bucket dedupe (matches the existing in-tab `extractConceptTarget` / `isDuplicateConceptTarget` pass).
      await step.do('mini-games:cross-dedupe', async () => {
        const allCards = await repos.artifacts.loadMiniGameUnion(runId);
        const offending = findDuplicateConceptTarget(allCards);
        if (offending) throw new WorkflowFail('validation:semantic-duplicate-concept', offending.message);
      });
      // Apply-side stitch: composition root reads the union artifact via getArtifact for each gameType.
      void miniArtifactIds; // ids already persisted into stage_checkpoints by runStage.
    }

    await repos.runs.markReady(runId);
    await repos.events.append(runId, deviceId, 'completed', { stage: plan.snap.stage });
  }
}
```

`runStage(...)` is a helper in `backend/src/workflows/lib/runStage.ts`:

```tsx
export async function runStage(
  step: WorkflowStep, repos: Repos, runId: string, deviceId: string,
  stage: string, snap: TopicContentRunInputSnapshot,
  exec: () => Promise<{ kind: ArtifactKind; payload: unknown; usage: OpenRouterUsage | null }>,
): Promise<string /* artifactId */> {
  await repos.events.append(runId, deviceId, 'stage_started', { stage });
  await repos.stageCheckpoints.upsert({ runId, stage, status: 'generating', inputHash: canonicalHash.stageInputHash(snap, stage), attempt: 0, startedAt: new Date() });
  const result = await step.do(`generate:${stage}`, { retries: { limit: 2, delay: '5s', backoff: 'exponential' } }, exec);
  const contentHash = canonicalHash.contentHash(result.payload);
  const storageKey = `${deviceId}/${result.kind}/${canonicalHash.inputHash(snap)}/${stage}.json`;
  await repos.artifacts.putStorage(storageKey, result.payload);
  const artifactId = await repos.artifacts.upsertRow({
    deviceId, runId, kind: result.kind, inputHash: canonicalHash.stageInputHash(snap, stage),
    storageKey, contentHash, schemaVersion: snap.schemaVersion,
  });
  await repos.stageCheckpoints.markReady({ runId, stage, artifactId });
  if (result.usage) await repos.usage.recordTokens(deviceId, result.usage);
  await repos.events.append(runId, deviceId, 'artifact_ready', { stage, artifactId, contentHash, kind: result.kind });
  return artifactId;
}
```

The composition root (`generationRunEventHandlers.ts`) maps each `artifact.ready` event for a topic-content run into the correct `appEventBus.emit('topic-content:generation-completed', { stage, … })` only after the run's terminal `completed` event arrives — partial-stage completion already had its mentor suppression rule in Phase 0.5 step 6.2 (`if (e.stage !== 'full') return;`).

## ⚙️ `topicExpansionWorkflow.ts` — single-stage durable pipeline with supersession

Mirrors `runExpansionJob.ts` directly: one LLM call, one parse, one validate, one persist. Difficulty bucketing (`nextLevel + 1`) and `existingConceptRegistry` derivation are reproduced server-side from snapshot fields populated by `buildTopicExpansionSnapshot(...)` in the contracts module — the snapshot already carries `existingConceptStems` and `existingMiniGameItemLabels` (Phase 0 step 2 contract).

```tsx
export class TopicExpansionWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { runId, deviceId } = event.payload;
    const repos = makeRepos(this.env);
    const checkCancel = makeCancelChecker(repos, runId, deviceId);

    await checkCancel('before-plan');     // catches supersession that already cancelled this run pre-start
    const plan = await step.do('plan', async () => {
      const run = await repos.runs.load(runId);
      const snap = run.snapshot_json as TopicExpansionRunInputSnapshot;
      if (canonicalHash.inputHash(snap) !== run.input_hash) {
        throw new WorkflowFail('parse:zod-shape', 'topic-expansion snapshot drift');
      }
      // Cache-hit short-circuit (same level-up params replayed).
      const cached = await repos.artifacts.findCacheHit(deviceId, 'topic-expansion-cards', run.input_hash);
      return { snap, cached };
    });
    if (plan.cached) {
      await repos.events.append(runId, deviceId, 'artifact_ready', { kind: 'topic-expansion-cards', artifactId: plan.cached.id, contentHash: plan.cached.content_hash, fromCache: true });
      await repos.runs.markReady(runId);
      await repos.events.append(runId, deviceId, 'completed', { fromCache: true });
      return;
    }

    await checkCancel('before-generate');
    const raw = await step.do('generate', { retries: { limit: 2, delay: '5s', backoff: 'exponential' } }, () =>
      openrouterClient.callTopicExpansion({ snapshot: plan.snap, env: this.env }),
    );

    await checkCancel('before-parse');
    const parsed = await step.do('parse', () => {
      const r = strictParseArtifact('topic-expansion-cards', raw.text);
      if (!r.ok) throw new WorkflowFail(r.code, r.message);
      return Promise.resolve(r.value);
    });

    await checkCancel('before-validate');
    await step.do('validate', () => {
      const sem = semanticValidateArtifact('topic-expansion-cards', parsed, {
        existingConceptStems: plan.snap.existingConceptStems,
        existingMiniGameItemLabels: plan.snap.existingMiniGameItemLabels,
        difficulty: plan.snap.nextLevel + 1,
      });
      if (!sem.ok) throw new WorkflowFail(sem.code, sem.message);
      return Promise.resolve();
    });

    await checkCancel('before-persist');
    const persisted = await step.do('persist', async () => {
      const contentHash = canonicalHash.contentHash(parsed);
      const storageKey = `${deviceId}/topic-expansion-cards/${plan.snap.subjectId}/${plan.snap.topicId}/${plan.snap.nextLevel}.json`;
      await repos.artifacts.putStorage(storageKey, parsed);
      const id = await repos.artifacts.upsertRow({ deviceId, runId, kind: 'topic-expansion-cards', inputHash: canonicalHash.inputHash(plan.snap), storageKey, contentHash, schemaVersion: plan.snap.schemaVersion });
      await repos.usage.recordTokens(deviceId, raw.usage);
      return { id, contentHash };
    });

    await repos.runs.markReady(runId);
    await repos.events.append(runId, deviceId, 'artifact_ready', { kind: 'topic-expansion-cards', artifactId: persisted.id, contentHash: persisted.contentHash });
    await repos.events.append(runId, deviceId, 'completed', {});
  }
}
```

**Supersession contract:**

1. Browser-side: `client.startTopicExpansion(...)` reads the supersedes key from the input (`te-supersedes:<topicRefKey>`) and forwards it as `Supersedes-Key` on the HTTP request. The default Idempotency-Key from Phase 0.5 step 3.3 is preserved (`te:${subjectId}:${topicId}:${nextLevel}:${snapshotInputHash}`); supersession is orthogonal to idempotency.
2. Server-side: `POST /v1/runs` runs the supersession transaction (see `0004_supersedes_key.sql`). The newly-cancelled prior run's running Workflow polls `runs.cancel_requested_at`/`cancel_reason` at its next checkpoint and writes the terminal `cancelled` event with `reason: 'superseded'`.
3. Composition root: `generationRunEventHandlers.ts` already maps `run.cancelled` with `reason: 'superseded'` for `kind = 'topic-expansion'` to **no** `appEventBus.emit('topic-expansion:generation-failed')` (Phase 0.5 step 6.2). Player sees no failure copy. HUD-only update.

## ⚙️ `subjectGraphWorkflow.ts` — Stage A (Topic Lattice) + Stage B (Prerequisite Edges)

Mirrors `subjectGenerationOrchestrator.ts` exactly, but moves Stage B's `createPrerequisiteEdgeRules(...).acceptModelResponse(raw)` deterministic repair into the server-side `parse.subjectGraphEdges.ts` step. The existing client-side orchestrator stays untouched (Phase 4 deletes it).

```tsx
export class SubjectGraphWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { runId, deviceId } = event.payload;
    const repos = makeRepos(this.env);
    const checkCancel = makeCancelChecker(repos, runId, deviceId);

    await checkCancel('before-plan');
    const plan = await step.do('plan', async () => {
      const run = await repos.runs.load(runId);
      const snap = run.snapshot_json as SubjectGraphRunInputSnapshot;
      if (canonicalHash.inputHash(snap) !== run.input_hash) {
        throw new WorkflowFail('parse:zod-shape', 'subject-graph snapshot drift');
      }
      const checkpoints = await repos.stageCheckpoints.byRun(runId);
      return { snap, checkpoints };
    });

    // ---- STAGE A: TOPIC LATTICE ----
    const topicsCheckpoint = plan.checkpoints.find(c => c.stage === 'topics');
    let latticeArtifactId = topicsCheckpoint?.artifact_id ?? undefined;
    if (!latticeArtifactId) {
      latticeArtifactId = await runStage(step, repos, runId, deviceId, 'topics', plan.snap, async () => {
        const raw = await openrouterClient.callSubjectGraph({ stage: 'topics', snapshot: plan.snap, env: this.env });
        const parsed = strictParseArtifact('subject-graph-topics', raw.text);
        if (!parsed.ok) throw new WorkflowFail(parsed.code, parsed.message);
        const sem = semanticValidateArtifact('subject-graph-topics', parsed.value, {
          maxTier: plan.snap.strategy.totalTiers,
          topicsPerTier: plan.snap.strategy.topicsPerTier,
        });
        if (!sem.ok) throw new WorkflowFail(sem.code, sem.message);
        return { kind: 'subject-graph-topics' as const, payload: parsed.value, usage: raw.usage };
      });
    }

    // ---- STAGE B: PREREQUISITE EDGES ----
    // Stage B input includes the Stage A artifact's content_hash (locked into the snapshot via
    // buildSubjectGraphEdgesRunInputSnapshot — see Phase 0 step 2 contracts).
    const lattice = await repos.artifacts.load<'subject-graph-topics'>(latticeArtifactId);
    const edgesCheckpoint = plan.checkpoints.find(c => c.stage === 'edges');
    if (!edgesCheckpoint?.artifact_id) {
      await checkCancel('before-edges');
      await runStage(step, repos, runId, deviceId, 'edges', plan.snap, async () => {
        const raw = await openrouterClient.callSubjectGraph({
          stage: 'edges',
          snapshot: plan.snap,
          lattice: lattice.payload,
          env: this.env,
          temperature: 0.1,    // matches STAGE_B_FIRST_TEMPERATURE in subjectGenerationOrchestrator
        });
        // parse.subjectGraphEdges.ts owns the narrow correctPrereqEdges deterministic repair.
        const acceptance = createPrerequisiteEdgeRules(lattice.payload).acceptModelResponse(raw.text);
        if (!acceptance.ok) throw new WorkflowFail('validation:semantic-subject-graph-edges', acceptance.error);
        const graph = assembleSubjectGraph(lattice.payload, acceptance.edges, plan.snap.subjectId, plan.snap.subjectName);
        const val = validateGraph(graph, {
          subjectId: plan.snap.subjectId,
          themeId: plan.snap.subjectId,
          topicCount: plan.snap.strategy.totalTiers * plan.snap.strategy.topicsPerTier,
          maxTier: plan.snap.strategy.totalTiers,
          topicsPerTier: plan.snap.strategy.topicsPerTier,
        });
        if (!val.ok) throw new WorkflowFail('validation:semantic-subject-graph-edges', val.error);
        return {
          kind: 'subject-graph-edges' as const,
          payload: { graph, prereqEdgesCorrection: acceptance.observation?.eventFields ?? null },
          usage: raw.usage,
        };
      });
    }

    await repos.runs.markReady(runId);
    await repos.events.append(runId, deviceId, 'completed', {});
  }
}
```

**Subject Graph applier behavior (Phase 0.5 step 5.4 reaffirmed):** Stage B requires Stage A applied first. The client applier loads both `subject-graph-topics` and `subject-graph-edges` artifacts and writes them as a single `applyGraphToStorage(...)` call. The legacy `subject-graph:generated` event is emitted by `generationRunEventHandlers.ts` after Stage B applies, with `lattice`, `boundModel`, `stageADurationMs`, `stageBDurationMs`, `retryCount`, and `prereqEdgesCorrection?` payload fields preserved.

## 🔌 Hono Worker — route widening

`POST /v1/runs` body discriminator widens:

```tsx
type SubmitRunBody =
  | { kind: 'crystal-trial'; snapshot: CrystalTrialRunInputSnapshot }
  | { kind: 'topic-content'; snapshot: TopicContentRunInputSnapshot }
  | { kind: 'topic-expansion'; snapshot: TopicExpansionRunInputSnapshot; supersedesKey?: string }
  | { kind: 'subject-graph'; snapshot: SubjectGraphRunInputSnapshot };
```

- The handler dispatches on `kind` to the correct Workflow binding (`env.TOPIC_CONTENT_WORKFLOW.create({ id: runId, params: { runId, deviceId } })` etc.).
- `Supersedes-Key` header is **only** honored for `kind = 'topic-expansion'`; the route returns `400 { code: 'config:unexpected-supersedes-key' }` if any other kind ships it.
- Cache-hit short-circuit (Phase 1 § `POST /v1/runs` step 6) is reused per kind. For Topic Content, cache hits are only possible for `stage = 'full'` runs whose `input_hash` already has all three stage artifacts; partial-stage replay loads the persisted `stage_checkpoints` rows in the Workflow's `plan` step instead.

## 🌐 Server-side `openrouterClient` extensions

`backend/src/llm/openrouterClient.ts` gains four new methods:

- `callTopicContent({ stage, snapshot, theory?, gameType?, env })` — uses `buildTopicTheoryMessages` / `buildTopicStudyCardsMessages` / `buildTopicMiniGameCardsMessages` from `@contracts`. The `tools` list (`buildOpenRouterWebSearchTools(FIRECRAWL_TOPIC_GROUNDING_POLICY)`) is forwarded only for the `theory` stage, exactly as `runTopicGenerationPipeline.ts` does today.
- `callTopicExpansion({ snapshot, env })` — uses `buildTopicExpansionCardsMessages`.
- `callSubjectGraph({ stage, snapshot, lattice?, env, temperature? })` — uses `buildTopicLatticeMessages` (Stage A) and `prereqRules.buildMessages(...)` (Stage B).
- All four reuse the same OpenRouter request-shape builder shared with `HttpChatCompletionsRepository`. Phase 1's drift-prevention test is extended: snapshot the body produced by `openrouterClient.call*` and compare against `HttpChatCompletionsRepository` bodies for identical surface configurations across all four pipeline kinds.

## 💸 Per-kind budget caps

`@contracts/budgets.ts` exports the four caps (single source of truth, no magic numbers):

```tsx
export const CRYSTAL_TRIAL_DAILY_RUN_CAP = 50;
export const CRYSTAL_TRIAL_DAILY_TOKEN_CAP = 1_500_000;
export const TOPIC_CONTENT_DAILY_RUN_CAP = 30;        // a full pipeline counts as 1 run; partial-stage retries don't increment
export const TOPIC_CONTENT_DAILY_TOKEN_CAP = 4_000_000;
export const TOPIC_EXPANSION_DAILY_RUN_CAP = 60;
export const TOPIC_EXPANSION_DAILY_TOKEN_CAP = 1_500_000;
export const SUBJECT_GRAPH_DAILY_RUN_CAP = 8;          // Stage A + Stage B = 1 run for budget purposes
export const SUBJECT_GRAPH_DAILY_TOKEN_CAP = 800_000;
```

`budgetGuard.assertBelowDailyCap(...)` (Phase 1) is parameterized on `kind` so each pipeline checks its own cap. The cache-hit short-circuit increments `usage_counters.runs_started` for the kind only (token columns untouched), preserving Phase 1's accounting rule.

## 🧭 Frontend wiring deltas

### `generationClient.ts` factory

The Phase 0.5 factory's flag selection becomes per-kind:

```tsx
function selectRepoFor(kind: PipelineKind, flags: { durableRuns: boolean; durableKinds: Set<PipelineKind> }): IGenerationRunRepository {
  return flags.durableRuns && flags.durableKinds.has(kind) ? durableRepo : localRepo;
}
```

- `durableKinds` is derived from `process.env.NEXT_PUBLIC_DURABLE_RUNS_KINDS` (comma-separated list). Default in Phase 2 PR-A is `crystal-trial`. Each subsequent PR adds one more kind to the default.
- `LocalGenerationRunRepository` (Phase 0.5) keeps working unchanged for any kind not listed — the `localRepo`'s four runner adapters still resolve.

### `generationRunEventHandlers.ts` dispatch widening

No new file. The existing `RunEvent → AppEventMap` adapter (Phase 0.5 step 6.2) already covers all three Phase 2 pipelines symbolically. Phase 2 only adds tests proving the adapter's behavior holds end-to-end with the durable repo:

- Topic Content: `topic-content:generation-completed` fires only after the run's terminal `completed` event, with `stage` field threaded from the run snapshot.
- Topic Expansion: superseded run never fires `topic-expansion:generation-failed`.
- Subject Graph: `subject-graph:generated` payload includes `lattice`, `prereqEdgesCorrection?`, `boundModel`, `stageADurationMs`, `stageBDurationMs`, `retryCount`.

### Appliers (Phase 0.5 step 5 reaffirmed)

No new appliers in Phase 2. The four `ArtifactApplier`s landed in Phase 0.5 are the only mutators of `useContentGenerationStore`, `useCrystalTrialStore`, and `deckWriter` for generation results. Phase 2 widens applier tests:

- **Topic Content applier:** dedupe across the three stage artifacts; partial-stage application is allowed (e.g. theory-only retry applies only the theory artifact, leaving prior study-card / mini-game state intact).
- **Topic Expansion applier:** confirm `appendTopicCards` (NOT `upsertTopicCards`); confirm supersession returns `{ applied: false, reason: 'superseded' }` when a newer expansion `contentHash` for the same `(subjectId, topicId)` is already recorded.
- **Subject Graph applier:** Stage B applies `applyGraphToStorage(...)` only after Stage A is recorded; missing Stage A returns `{ applied: false, reason: 'missing-stage-a' }`.

## ✅ Per-pipeline acceptance test matrix

### Topic Content

| Suite | Scenarios |
| --- | --- |
| **Snapshot determinism** | `buildTopicTheorySnapshot` / `buildTopicStudyCardsSnapshot` / `buildTopicMiniGameCardsSnapshot` produce identical `inputHash` for identical inputs across runs and OS string ordering. Mini-games snapshot includes `gameType` so each of the three mini-game-card kinds gets a distinct stage `input_hash`. |
| **Strict schema / semantic validation** | Invalid theory (missing `coreConcept`) → `parse:zod-shape`. Study-cards over-cap → `validation:semantic-study-cards-count`. Mini-game cross-bucket duplicate concept → `validation:semantic-duplicate-concept`. No `extractJsonString` reintroduction (boundary test). |
| **Stage-level resume** | Workflow Worker eviction at the mini-games stage: resume re-loads `stage_checkpoints` and skips `theory` and `study-cards`; only mini-games re-LLM. Single mini-game gameType failure resumes only that gameType. |
| **Artifact apply idempotency** | Applier re-receiving the same `topic-theory` artifact (same `contentHash`) returns `{ applied: false, reason: 'duplicate' }`; no double `upsertTopicDetails` call. Same for study-cards and each mini-game gameType. |
| **Legacy App Event Bus compatibility** | `topic-content:generation-completed` fires with `stage = 'full'` for full pipelines, `stage = 'theory'` / `'study-cards'` / `'mini-games'` for stage-scoped runs. Mentor partial-stage suppression (`if (e.stage !== 'full') return;`) holds. `topic-content:generation-failed` carries `partialCompletion` for `stage = 'full'` failures only. |
| **Retry lineage** | `retryFailedJob` for a failed `topic-study-cards` job mints a child run with `parent_run_id`, `snapshot_json.resumeFromStage = 'study-cards'`, and a fresh job whose `retry_of` references the original. The parent run's `theory` artifact is reused (same `contentHash`). |

### Topic Expansion

| Suite | Scenarios |
| --- | --- |
| **Snapshot determinism** | `buildTopicExpansionSnapshot` includes `existingConceptStems` (sorted), `existingMiniGameItemLabels` (sorted), and `nextLevel`. Reordering existing-card input arrays produces identical `inputHash`. |
| **Strict schema / semantic validation** | Duplicate-concept ratio threshold (matches `runExpansionJob.ts`'s `existingCards.length >= 10 ? 0.1 : undefined`) enforced server-side. Difficulty-mismatch (returned cards don't carry `difficulty = nextLevel + 1`) → `validation:semantic-difficulty-mismatch`. |
| **Superseded cancellation** | Two level-ups within 500 ms for the same `(subjectId, topicId)`: server cancels run #1 with `cancel_reason='superseded'`. Run #1 emits terminal `cancelled` event with `reason: 'superseded'`. Composition root suppresses `topic-expansion:generation-failed`. Run #2 completes normally and emits `topic-expansion:generation-completed`. |
| **Artifact apply idempotency** | Same `contentHash` re-delivered → `{ applied: false, reason: 'duplicate' }`. `appendTopicCards` (NOT `upsertTopicCards`) called exactly once. |
| **Legacy App Event Bus compatibility** | `topic-expansion:generation-completed` fires with `level = nextLevel`. `topic-expansion:generation-failed` payload includes `level`, `errorMessage`, `jobId`, `failureKey` for non-superseded failures. |
| **Retry lineage** | User-initiated retry passes `retry:${originalRunId}:${attempt}` Idempotency-Key (Phase 0.5 step 3.3); `parent_run_id` is set; `Supersedes-Key` is **omitted** on retry (otherwise the retry would cancel itself). |

### Subject Graph

| Suite | Scenarios |
| --- | --- |
| **Snapshot determinism** | `buildSubjectGraphTopicsSnapshot` over `(subjectId, checklist, strategy)` produces identical `inputHash`. `buildSubjectGraphEdgesSnapshot` includes `latticeContentHash`; mutating Stage A's lattice produces a fresh Stage B `inputHash`. |
| **Strict schema / semantic validation** | Stage A: `validateTopicLattice` rejects wrong `maxTier` / `topicsPerTier`; emits `subject-graph:validation-failed` with `offendingTopicIds` extracted from the error message. Stage B: `validateGraph` enforces `topicCount = totalTiers × topicsPerTier`; the deterministic `correctPrereqEdges` repair runs **once** server-side, observation captured in the artifact's `prereqEdgesCorrection` field. |
| **Stage A → B gating** | Stage B Workflow step refuses to run unless `stage_checkpoints.stage='topics'.artifact_id is not null`. Worker eviction between stages: resume skips Stage A, runs Stage B with the persisted lattice. |
| **Artifact apply idempotency** | Applier consumes `subject-graph-topics` then `subject-graph-edges`. Out-of-order delivery (Stage B before Stage A) returns `{ applied: false, reason: 'missing-stage-a' }`; next event of either kind retries the apply. Same `contentHash` re-delivered → `duplicate`. |
| **Legacy App Event Bus compatibility** | `recordFirstSubjectGenerationEnqueued(subjectId)` and `handleMentorTrigger('subject:generation-started', …)` still fire at enqueue-time, never at run-completion-time (preserved in `eventBusHandlers.ts`). `subject-graph:generated` payload includes `lattice`, `prereqEdgesCorrection?`, `boundModel`, `stageADurationMs`, `stageBDurationMs`, `retryCount`. `subject-graph:validation-failed` distinguishes `stage: 'topics' | 'edges'`. |
| **Retry lineage** | Stage B-only retry mints a child run whose `snapshot_json` reuses the parent's `latticeContentHash`; the durable repo does not re-LLM Stage A. `subject-graph:generated` event includes `retryCount = countManualRetryDepth(originalRunId, …)` matching the legacy orchestrator's `retryDepth`. |

### Cross-cutting suites (added once, asserted across all three pipelines)

- **Cancel race tests**: before-start, mid-stage, after-completion, plus superseded for `topic-expansion`.
- **SSE resume**: `Last-Event-ID` replays only events with `seq > lastSeq`; no duplicate `artifact.ready`.
- **Boundary tests**: `durableGenerationBoundary.test.ts` (Phase 1) covers the new `kind`s; `subjectGraphCorrectionBoundary.test.ts` (NEW) pins `createPrerequisiteEdgeRules` import to legacy + Worker only.
- **OpenRouter request-shape lockstep**: extended for all four pipelines.

## 🧪 Test infrastructure (matches Phase 1)

- **Worker unit tests:** Vitest 4 + `@cloudflare/vitest-pool-workers`. New fixtures per pipeline kind (canned strict-JSON-Schema responses, 429/5xx, parse failures, semantic-validation failures, duplicate-concept synthesis).
- **Workflow tests:** Cloudflare Workflows test harness drives each Workflow class. One test per `checkCancel` boundary per Workflow.
- **Stage-checkpoint tests:** simulate Worker eviction by aborting the harness mid-step; reopen and assert resume reads `stage_checkpoints` and skips persisted stages.
- **Frontend unit tests:** Vitest 4 with `fake-indexeddb` for applier idempotency and partial-stage application.
- **End-to-end:** Playwright through `node scripts/run-playwright.mjs --project=chromium-headless-ci`. Per-pipeline E2E: tab-close mid-run, reopen, applier-once. Two-tab supersession test for Topic Expansion.
- **Eval gate (Phase 0 step 11):** re-runs only when prompts / schemas / model bindings change. Phase 2 PRs do not touch any of those, so the eval gate is observed but not regenerated.

## 🔐 Security & deployment notes

- `wrangler.toml` declares the three new Workflow bindings (`TOPIC_CONTENT_WORKFLOW`, `TOPIC_EXPANSION_WORKFLOW`, `SUBJECT_GRAPH_WORKFLOW`) and reuses the Phase 1 `RunEventBus` Durable Object.
- Secrets unchanged (Supabase service role + OpenRouter API key). The browser bundle still never holds them.
- CORS unchanged from Phase 1.
- `NEXT_PUBLIC_DURABLE_RUNS=false` keeps every kind on `LocalGenerationRunRepository` (Phase 0.5 default). With `NEXT_PUBLIC_DURABLE_RUNS=true` and `NEXT_PUBLIC_DURABLE_RUNS_KINDS` empty, no kind flips — operators must opt in per kind.
- Static export (`output: 'export'`) remains. Next.js build is unaffected by the new Workflow classes; only client-side env vars expand by one (`NEXT_PUBLIC_DURABLE_RUNS_KINDS`).

## 📦 PR sequencing (stacked, each on top of the previous)

1. **PR-2A — Migrations.** `0003_stage_checkpoints.sql`, `0004_supersedes_key.sql`. Worker-side `repos/stageCheckpointsRepo.ts`, `repos/runsRepo.ts` widening for `supersedes_key`. CI smoke test of `assertBelowDailyCap` per kind (no Workflows yet).
2. **PR-2B — Topic Expansion Workflow.** Single-stage; smallest of the three pipelines; first to flip behind `NEXT_PUBLIC_DURABLE_RUNS_KINDS=topic-expansion`. Adds supersession transaction, server-side `existingConceptRegistry` validation, applier supersession test, two-tab E2E.
3. **PR-2C — Subject Graph Workflow.** Stage A + Stage B; `parse.subjectGraphEdges.ts` owns `correctPrereqEdges`. `subjectGraphCorrectionBoundary.test.ts` lands here. Flag flip: `NEXT_PUBLIC_DURABLE_RUNS_KINDS=topic-expansion,subject-graph`.
4. **PR-2D — Topic Content Workflow.** Three stages with stage-level checkpoints; cross-bucket dedupe step; partial-stage retry support in `retryRun`. Final flag flip: `NEXT_PUBLIC_DURABLE_RUNS_KINDS=topic-expansion,subject-graph,topic-content`.
5. **PR-2E — Hardening.** Cross-pipeline E2E suite (cancel race × 4 pipelines × 4 boundaries), SSE resume tests for the three new pipelines, OpenRouter request-shape lockstep test extended to four call sites, durable-repo `retryRun` tests covering `{ stage }` + `{ jobId }` per kind. No production code in this PR.

## 🚪 Phase 2 exit checklist

- [x] All three Phase 2 pipelines' Workflow classes are implemented and wired to route handlers.
- [ ] Topic Content stage-level resume is proven by Worker-eviction harness tests at every stage boundary, including each of the three mini-game gameTypes. (Requires Cloudflare Workflows test harness — deferred to Phase 3 observability infrastructure work.)
- [x] Topic Expansion superseded cancellation transaction is wired server-side; `Supersedes-Key` header passthrough from frontend is implemented.
- [x] Subject Graph Stage B `input_hash` covers Stage A's `content_hash` (snapshot builder includes `latticeContentHash`); deterministic `correctPrereqEdges` repair runs server-side in `parse.subjectGraphEdges`.
- [x] `NEXT_PUBLIC_DURABLE_RUNS_KINDS` operator allow-list works per kind; rolling back a kind to `LocalGenerationRunRepository` requires only a flag flip.
- [x] Per-kind budget caps reject over-cap submissions with `429 { code: 'budget:over-cap' }` BEFORE Workflow creation.
- [x] All cancel race tests green per pipeline: before-start, mid-stage, after-completion — parametric coverage for all four kinds in `runs.cancel.test.ts` (24 new tests in PR-2E).
- [x] SSE resume with `Last-Event-ID` replays only missed events — parametric coverage for all four pipeline kinds in `runEvents.sse.test.ts` (12 new tests in PR-2E).
- [x] Legacy `appEventBus` payload compatibility holds for `topic-content:generation-{completed,failed}`, `topic-expansion:generation-{completed,failed}`, `subject-graph:generated`, `subject-graph:validation-failed`, `subject-graph:generation-failed`. Mentor partial-stage suppression and enqueue-time milestone preserved.
- [ ] Boundary tests green: `durableGenerationBoundary.test.ts` covers all four kinds; `subjectGraphCorrectionBoundary.test.ts` pins `createPrerequisiteEdgeRules` to legacy + Worker only; `legacyRunnerBoundary.test.ts` (Phase 0.5) still green. (The `legacyRunnerBoundary.test.ts` was deferred in Phase 0.5 step 4 and remains deferred; `subjectGraphCorrectionBoundary.test.ts` not yet created.)
- [x] OpenRouter request-shape lockstep test green across all four pipeline kinds (`crystal-trial`, `topic-content`, `topic-expansion`, `subject-graph`) — 15 new assertions in PR-2E.
- [x] Durable-repo retry tests covering `{ stage }` + `{ jobId }` per kind — 22 new test cases across parametric matrix in `generationClient.test.ts` (PR-2E).
- [x] No new `posthog-js` import outside `src/infrastructure/posthog/*`. No new `fetch` outside `src/infrastructure/`. No new magic-string status / event / failure-code / artifact-kind literals in any added file.

## 🔭 Phase 3 hand-off notes

When Phase 3 begins, the substrate is fully migrated. Phase 3 work focuses on:

1. **Server-side telemetry tracing** (Langfuse-or-equivalent) at the Workflow step boundary — never enters the browser bundle.
2. **Cost dashboards & guardrails** that read `usage_counters` and `events.payload_json` server-side; the budget caps in `@contracts/budgets.ts` become user-tunable per device.
3. **Schema-version migrations** when prompt or schema changes ship — the `schema_version` column on `artifacts` is the canonical join key.

No call site, no applier, and no event mapping needs to change between Phase 2 and Phase 3. That is the contract Phase 2 buys.
