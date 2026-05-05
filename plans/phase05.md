<aside>
📌

**Scope:** File-level implementation plan for Phase 0.5, written against fork `littlething666/abyss-engine` @ `716b0780` (HEAD of stacked Phase 0 branch series). Phase 0.5 lands the `GenerationClient` facade, the `IGenerationRunRepository` contract, the `LocalGenerationRunRepository` adapter wrapping today's in-tab runners, the feature-owned `ArtifactApplier`s, and the durable-run composition root `src/infrastructure/generationRunEventHandlers.ts`. **No backend code is touched.**

**Flag:** `NEXT_PUBLIC_DURABLE_RUNS` (default `false`). With the flag off, the facade resolves to `LocalGenerationRunRepository` and behavior matches today bit-for-bit.

</aside>

## 📖 Overview

Phase 0.5 is a **pure refactor**. The player-visible behavior is unchanged. The goal is to land the seam so Phase 1 can flip a single pipeline to durable execution without touching call sites.

Three invariants must hold at the end of Phase 0.5:

1. **No code outside `LocalGenerationRunRepository.ts` may import any of these four legacy entry points:**
    - `@/features/contentGeneration/pipelines/runTopicGenerationPipeline` (`runTopicGenerationPipeline`)
    - `@/features/contentGeneration/jobs/runExpansionJob` (`runExpansionJob`)
    - `@/features/subjectGeneration` (`createSubjectGenerationOrchestrator`, `resolveSubjectGenerationStageBindings`)
    - `@/features/crystalTrial/generateTrialQuestions` (`generateTrialQuestions`)
2. **`ArtifactApplier`s are the only path that mutates `useContentGenerationStore`, `useCrystalTrialStore`, the deck Dexie via `deckWriter`, or the IndexedDB deck cache from generation results.**
3. **`generationRunEventHandlers.ts` is the only file that translates `RunEvent`s into legacy `appEventBus` notifications and into `handleMentorTrigger` / HUD / telemetry side-effects.**

The Phase 0 step 11 `Eval Gate` workflow (PR #51) does not gate this refactor — Phase 0.5 changes neither prompts, schemas, nor model bindings — but the existing `pr-unit-tests.yml` full Vitest run remains the required check.

## 🧱 Step 1 — `IGenerationRunRepository` contract

**File:** `src/types/repository.ts` (extend; current file exports `IDeckRepository`, `IDeckContentWriter`, `IStudyHistoryRepository`)

### 1.1 Add the contract

```tsx
import type { ArtifactEnvelope, ArtifactKind, RunEvent, RunStatus } from '@/features/generationContracts';
import type { RunInputSnapshot } from '@/features/generationContracts';

export type PipelineKind =
	| 'topic-content'
	| 'topic-expansion'
	| 'subject-graph'
	| 'crystal-trial';

export type CancelReason = 'user' | 'superseded';

export type RunInput =
	| { pipelineKind: 'topic-content'; snapshot: TopicContentRunInputSnapshot; subjectId: string; topicId: string }
	| { pipelineKind: 'topic-expansion'; snapshot: TopicExpansionRunInputSnapshot; subjectId: string; topicId: string; nextLevel: 1 | 2 | 3 }
	| { pipelineKind: 'subject-graph'; snapshot: SubjectGraphTopicsRunInputSnapshot | SubjectGraphEdgesRunInputSnapshot; subjectId: string; stage: 'topics' | 'edges' }
	| { pipelineKind: 'crystal-trial'; snapshot: CrystalTrialRunInputSnapshot; subjectId: string; topicId: string; currentLevel: number };

export interface JobSnapshot {
	jobId: string;
	kind: string; // matches `ContentGenerationJobKind`
	stage: string;
	status: 'queued' | 'streaming' | 'completed' | 'failed' | 'aborted';
	retryOf?: string;
	inputHash: string;
	model: string;
	metadata?: Record<string, unknown>;
	startedAt?: number;
	finishedAt?: number;
	errorCode?: string;
	errorMessage?: string;
}

export interface RunSnapshot {
	runId: string;
	deviceId: string;
	kind: PipelineKind;
	status: RunStatus; // re-exported from generationContracts
	inputHash: string;
	parentRunId?: string;
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
	errorCode?: string;
	errorMessage?: string;
	snapshotJson: RunInputSnapshot;
	jobs: JobSnapshot[];
}

export interface RunListQuery {
	status?: 'active' | 'recent' | 'all';
	limit?: number;
	kind?: PipelineKind;
	subjectId?: string;
	topicId?: string;
}

export interface IGenerationRunRepository {
	submitRun(input: RunInput, idempotencyKey: string): Promise<{ runId: string }>;
	getRun(runId: string): Promise<RunSnapshot>;
	streamRunEvents(runId: string, lastSeq?: number): AsyncIterable<RunEvent>;
	cancelRun(runId: string, reason: CancelReason): Promise<void>;
	retryRun(runId: string, opts?: { stage?: string; jobId?: string }): Promise<{ runId: string }>;
	listRuns(query: RunListQuery): Promise<RunSnapshot[]>;
	getArtifact(artifactId: string): Promise<ArtifactEnvelope>;
}
```

### 1.2 Re-exports already in place

`@/features/generationContracts` already exports `RunEvent`, `RunStatus`, `ArtifactEnvelope`, `ArtifactKind`, plus all seven `RunInputSnapshot` builders and types — no new generationContracts code is needed in step 1.

### 1.3 Boundaries enforced in the contract file

- `src/types/repository.ts` may import only from `@/features/generationContracts` and `@/types/*`.
- It must not import any in-tab runner, store, or hook.
- New boundary test `src/types/repository.boundary.test.ts` walks the file's import list (matches the `lucideImportBoundary.test.ts` / `legacyParserBoundary.test.ts` pattern landed in PRs #43 and #44) and asserts no `src/features/contentGeneration/pipelines/*`, `src/features/contentGeneration/jobs/*`, or `src/features/subjectGeneration/orchestrator/*` import.

## 🧱 Step 2 — `LocalGenerationRunRepository`

**File:** `src/infrastructure/repositories/LocalGenerationRunRepository.ts` (NEW; sibling of existing `ApiDeckRepository.ts`, `IndexedDbDeckRepository.ts`, `HttpChatCompletionsRepository.ts`, `contentGenerationLogRepository.ts`, `studyHistoryRepository.ts`)

This adapter wraps the existing in-tab runners and synthesizes `RunEvent`s with monotonic per-run `seq`. It is the **only** file (after this phase) allowed to import the four legacy entry points listed in the Phase 0.5 invariants.

### 2.1 Internal state

```tsx
type LocalRunRecord = {
	runId: string;
	kind: PipelineKind;
	status: RunStatus;
	inputHash: string;
	snapshotJson: RunInputSnapshot;
	jobs: JobSnapshot[];
	eventBuffer: RunEvent[]; // bounded ring buffer (~200/run)
	nextSeq: number;
	cancelRequestedAt?: number;
	cancelReason?: CancelReason;
	abortController: AbortController; // forwarded to legacy runner's `signal`
	subscribers: Set<(event: RunEvent) => void>;
	terminalPromise: Promise<void>;
};
```

- Records live in a `Map<string, LocalRunRecord>` keyed by `runId`.
- Idempotency-Key map: `Map<string, { runId: string; expiresAt: number }>`, 24-hour TTL, lazy sweep on each `submitRun`.
- Records are NOT persisted to Dexie. Active in-flight runs already exist as the live `Object.values(useContentGenerationStore.getState().pipelines)` set; Dexie `abyss-content-generation-logs` (15-record cap from `MAX_PERSISTED_LOGS` in `contentGenerationStore.ts`) remains the terminal-log read-cache.

### 2.2 `submitRun` algorithm

1. Sweep expired idempotency entries.
2. If `idempotencyKey` is in the map and the record exists, return `{ runId }` for the existing record.
3. Compute `inputHash` via `inputHash(input.snapshot)` from `@/features/generationContracts`.
4. Mint `runId = crypto.randomUUID()`.
5. Construct `LocalRunRecord` with `status = 'queued'`.
6. Synthesize and emit `{ type: 'run.queued', seq: 1, ... }` then `{ type: 'run.status', status: 'planning', seq: 2, ... }`.
7. Dispatch to the kind-specific runner adapter (see 2.3).
8. Return `{ runId }`.

### 2.3 Runner adapters (one per `PipelineKind`)

All four adapters live as private methods on `LocalGenerationRunRepository`. They are the **only** allowed call sites for the legacy runners.

- **`topic-content`** wraps `runTopicGenerationPipeline` from `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts`. Streams `topic-theory` then `topic-study-cards` then `topic-mini-games` jobs through `runContentGenerationJob`. The runner currently emits `topic-content:generation-completed` / `:generation-failed` itself; the adapter must intercept those terminal emissions so the new composition root in step 6 owns them — either by wrapping the runner or by extracting its terminal emit into a shared helper consumed by both the legacy and adapter paths.
- **`topic-expansion`** wraps `runExpansionJob` from `src/features/contentGeneration/jobs/runExpansionJob.ts`. Today triggered from the `crystal:leveled` handler with `expansionSupersededAbortReason = { kind: 'superseded', source: 'expansion-replaced' }`. The supersession `Map<string, AbortController>` keyed by `topicRefKey(...)` lives in `eventBusHandlers.ts` today; in Phase 0.5 it moves into the adapter so the legacy handler can call `client.startTopicExpansion(...)` without owning supersession bookkeeping.
- **`subject-graph`** wraps `createSubjectGenerationOrchestrator` plus `resolveSubjectGenerationStageBindings` from `@/features/subjectGeneration` (`orchestrator/subjectGenerationOrchestrator.ts`). Two-stage: `topics` then `edges`. The adapter emits a single `RunEvent` stream sharing one `runId` with `stage.progress` deltas between stages — Phase 1's durable Worker workflow uses the same stage-checkpoint contract.
- **`crystal-trial`** wraps `generateTrialQuestions` from `src/features/crystalTrial/generateTrialQuestions.ts`. Three current callers in `eventBusHandlers.ts`: (1) `crystal-trial:pregeneration-requested`; (2) the cooldown-complete branch in the `card:reviewed` handler; (3) the `pubSubClient.on('topic-cards:updated', ...)` card-pool invalidation branch. All three migrate to `client.startCrystalTrial(...)` with distinct idempotency keys.

Each adapter:

1. Subscribes to the legacy runner's progress callback, abort signal, and terminal resolve/reject.
2. Maps progress callbacks into `{ type: 'stage.progress', body: { stage, progress? } }` events.
3. On terminal success, emits `{ type: 'artifact.ready', body: { artifactId, kind, contentHash, schemaVersion, inputHash, subjectId?, topicId? } }` carrying the canonical `ArtifactEnvelope` (the runner's existing final write payload — **no store mutation here; that is the applier's job in step 5**), then `{ type: 'run.completed' }`.
4. On terminal failure, maps the legacy error into a structured `GenerationFailureCode` (already exported from `@/features/generationContracts`) and emits `{ type: 'run.failed', code, message }`.
5. On cancel, emits `{ type: 'run.cancel-acknowledged', reason }` immediately, then `{ type: 'run.cancelled', reason }` once the legacy runner's abort settles. The two-event split honors the Plan v3 Q16 "`cancel_acknowledged` ≠ terminal `cancelled`" rule and matches the discriminated union in `generationContracts/runEvents.ts`.

### 2.4 `streamRunEvents`

Returns an `AsyncIterable<RunEvent>` backed by a ring buffer plus a subscriber callback. If `lastSeq` is provided, replays buffered events with `seq > lastSeq` first, then yields live events until terminal. Multiple concurrent streams per run are supported (HUD + history list + tests).

### 2.5 `cancelRun`

Sets `cancelRequestedAt`, `cancelReason`. Calls `abortController.abort(reason)` where `reason` mirrors today's `ContentGenerationAbortReason` shape so legacy runners' existing abort handling continues to work. Emits `run.cancel-acknowledged` immediately; the adapter emits the terminal `run.cancelled` once the legacy runner promise settles.

### 2.6 `retryRun`

Loads the original record's `snapshotJson`, mints a new `runId` with `parentRunId = originalRunId`. For stage/job-scoped retries, the adapter slices the snapshot (Topic Content stage retry per `JOB_KIND_TO_STAGE` mapping in `retryContentGeneration.ts`; Subject Graph stage retry resolved through `resolveSubjectGraphRetryContextFromJob`). Returns `{ runId: newRunId }`.

### 2.7 `getArtifact`

In-memory `Map<string, ArtifactEnvelope>` populated when adapters emit `artifact.ready`. Phase 0.5 does not persist artifacts; appliers run synchronously via `generationRunEventHandlers.ts` so the read-cache UX is preserved.

### 2.8 Tests

`src/infrastructure/repositories/LocalGenerationRunRepository.test.ts`:

- Idempotency-Key returns same `runId` within window; new `runId` after expiry.
- `streamRunEvents` replays from `lastSeq`, then yields live events, then closes after terminal.
- Adapter coverage per pipeline kind: synthesized event sequence matches the legacy runner's progress emissions.
- Cancel-before-start: terminal `run.cancelled`, no LLM call invoked.
- Cancel-mid-stage: `run.cancel-acknowledged` then terminal `run.cancelled` after boundary.
- Cancel-after-completion: no-op; record stays terminal `run.completed`.
- Retry preserves `parentRunId` and resolves stage slicing for topic-content + subject-graph.
- **Boundary test** `src/infrastructure/repositories/legacyRunnerBoundary.test.ts`: walks `src/**/*.{ts,tsx}` excluding test files and `LocalGenerationRunRepository.ts`, asserts no other file imports any of the four legacy entry points.

## 🧱 Step 3 — `GenerationClient` facade

**File:** `src/features/contentGeneration/generationClient.ts` (NEW; exported from `src/features/contentGeneration/index.ts` alongside the existing `runTopicGenerationPipeline` re-export — that re-export is REMOVED in step 4)

### 3.1 Public API

```tsx
import type { CancelReason, IGenerationRunRepository, RunSnapshot } from '@/types/repository';
import type { RunEvent } from '@/features/generationContracts';

export interface GenerationClient {
	startTopicContent(input: TopicContentStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
	startTopicExpansion(input: TopicExpansionStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
	startSubjectGraph(input: SubjectGraphStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
	startCrystalTrial(input: CrystalTrialStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
	cancel(runId: string, reason: CancelReason): Promise<void>;
	retry(runId: string, opts?: { stage?: string; jobId?: string }): Promise<{ runId: string }>;
	observe(runId: string, lastSeq?: number): AsyncIterable<RunEvent>;
	listActive(): Promise<RunSnapshot[]>;
	listRecent(limit: number): Promise<RunSnapshot[]>;
}

export function createGenerationClient(deps: {
	deviceId: string;
	now: () => number;
	flags: { durableRuns: boolean };
	localRepo: IGenerationRunRepository;
	durableRepo: IGenerationRunRepository;
}): GenerationClient;

/** Module-level singleton, lazily registered by app-boot wiring (step 7). */
export function getGenerationClient(): GenerationClient;
export function registerGenerationClient(client: GenerationClient): void;
```

Each `Start*Input` carries the resolved domain inputs the snapshot builders need (subject manifest entry, topic node, checklist, current crystal level, card pool) — never raw store handles, so the facade itself stays free of zustand reads.

### 3.2 Snapshot construction

Each `start*` method delegates to the corresponding builder from `@/features/generationContracts`:

- `startTopicContent` → `buildTopicTheorySnapshot` / `buildTopicStudyCardsSnapshot` / `buildTopicMiniGameCardsSnapshot` depending on stage.
- `startTopicExpansion` → `buildTopicExpansionSnapshot`.
- `startSubjectGraph` → `buildSubjectGraphTopicsSnapshot` / `buildSubjectGraphEdgesSnapshot`.
- `startCrystalTrial` → `buildCrystalTrialSnapshot`.

The facade is the single place snapshots are built so call sites remain ignorant of `inputHash` / `canonicalJson`.

### 3.3 Default Idempotency-Key

When `opts.idempotencyKey` is omitted:

- `topic-content`: `tc:${subjectId}:${topicId}:${stage ?? 'full'}:${snapshotInputHash}` — collapses duplicate dispatches when `topic-content:generation-requested` re-fires (today the runner is invoked unconditionally; that becomes a problem only once the durable repo enforces server-side `(device_id, idempotency_key)` uniqueness, but parity is cheaper to land now).
- `topic-expansion`: `te:${subjectId}:${topicId}:${nextLevel}:${snapshotInputHash}`.
- `subject-graph`: `sg:${subjectId}:${stage}:${snapshotInputHash}`.
- `crystal-trial`: `ct:${subjectId}:${topicId}:${currentLevel}:${snapshotInputHash}`.

User-initiated retries pass an explicit `retry:${originalRunId}:${attempt}` key to bypass dedupe (matches today's `retryFailedJob` / `retryFailedPipeline` semantics in `retryContentGeneration.ts`).

### 3.4 Tests

`src/features/contentGeneration/generationClient.test.ts`:

- Each `start*` builds the correct snapshot shape and forwards to `repo.submitRun` with the expected `idempotencyKey`.
- `cancel` / `retry` / `observe` are pure delegations.
- Flag flip selects the durable repo (mocked in Phase 0.5).

## 🧱 Step 4 — Route every entry path through `GenerationClient`

### 4.1 `src/infrastructure/eventBusHandlers.ts`

This is the largest migration target. Today the file directly imports `runTopicGenerationPipeline`, `runExpansionJob`, `createSubjectGenerationOrchestrator`, and `generateTrialQuestions`. The migration removes all four imports and replaces every direct invocation with `getGenerationClient().start*(...)`. The HMR `disposers` pattern and `__abyssEventBusHandlersRegistered` global gate remain unchanged.

Migration map (every bullet removes a direct legacy-runner call):

- **`appEventBus.on('topic-content:generation-requested', …)`** → `client.startTopicContent({ subjectId, topicId, stage, enableReasoning, forceRegenerate })`. The runner's terminal `topic-content:generation-completed` / `:generation-failed` emissions move OUT of the runner and into `generationRunEventHandlers.ts`.
- **`appEventBus.on('subject-graph:generation-requested', …)`** → `client.startSubjectGraph({ subjectId, checklist, stage: 'topics' })`. The `recordFirstSubjectGenerationEnqueued(subjectId)` mentor-milestone side-effect and the `handleMentorTrigger('subject:generation-started', …)` dispatch STAY in the handler — the milestone is enqueue-time, not run-completion-time, and must fire whether or not the run reaches the LLM. The orchestrator's own `subject-graph:generated` / `:generation-failed` / `:validation-failed` emissions move into `generationRunEventHandlers.ts`.
- **`appEventBus.on('crystal-trial:pregeneration-requested', …)`** → the `busMayStartTrialPregeneration(status)` precondition check stays. `trialStore.startPregeneration({...})` stays. The direct `generateTrialQuestions(...)` call becomes `client.startCrystalTrial({ subjectId, topicId, currentLevel })`.
- **`appEventBus.on('crystal:leveled', …)`** — expansion branch when `e.to >= 1 && e.to <= 3`. The `activeExpansionJobs: Map<string, AbortController>` supersession map MOVES into `LocalGenerationRunRepository.ts` (the adapter's natural home). The handler shrinks to a single `client.startTopicExpansion(...)` call with the supersedes key `te-supersedes:<topicRefKey>`. The repo recognizes the supersedes key and cancels the prior run with `reason: 'superseded'` before starting the new one.
- **`appEventBus.on('card:reviewed', …)`** — cooldown-complete branch. The `trialStore.recordCooldownCardReview` / `isCooldownComplete` / `clearCooldown` sequence stays. The direct `generateTrialQuestions(...)` becomes `client.startCrystalTrial({ subjectId, topicId, currentLevel })`.
- **`pubSubClient.on('topic-cards:updated', …)`** — card-pool invalidation branch. `trialStore.invalidateAndRegenerate(...)` stays. The direct `generateTrialQuestions(...)` becomes `client.startCrystalTrial({...})`. NOTE: this is a `pubSubClient` (BroadcastChannel) listener, NOT an `appEventBus` listener — keep the existing comment explaining why the registration is not pushed onto `disposers`.

Every terminal-event listener (`topic-content:generation-completed`, `topic-content:generation-failed`, `topic-expansion:generation-failed`, `subject-graph:generated`, `subject-graph:generation-failed`, `subject-graph:validation-failed`, `crystal-trial:generation-failed`, `content-generation:retry-failed`, plus the player-assessment `crystal-trial:completed`) STAYS in `eventBusHandlers.ts`. Their handlers are unchanged because `generationRunEventHandlers.ts` will keep emitting those exact events. The mentor partial-stage suppression (`if (e.stage !== 'full') return;`) on `topic-content:generation-completed` likewise stays.

### 4.2 `src/features/contentGeneration/retryContentGeneration.ts`

Replace direct runner invocations with `getGenerationClient().retry(...)`:

- `retryFailedJob`: passes `{ stage: JOB_KIND_TO_STAGE[job.kind], jobId: job.id }` for topic-content; `{ jobId: job.id }` for crystal-trial / topic-expansion / subject-graph.
- `retryFailedPipeline`: passes `{ stage: JOB_KIND_TO_STAGE[failedJob.kind], pipelineId }` (the repo resolves the pipeline-scoped retry).

The `emitRetryFailed(...)` helper (which writes to `useContentGenerationStore.registerSessionRetryRoutingFailure` and emits `content-generation:retry-failed`) STAYS — it owns retry-routing collapses, not run failures.

### 4.3 `src/hooks/useContentGenerationLifecycle.ts`

Current body iterates `s.pipelineAbortControllers` and `s.abortControllers` and aborts each with `{ kind: 'navigation', source: 'beforeunload' }`. After Phase 0.5:

- For runs whose `runId` is registered in the local repo, call `client.cancel(runId, 'user')` with reason `'navigation'` preserved on the abort controller (the local repo forwards the reason to the legacy runner's existing abort handling).
- For runs whose `runId` is registered in the durable repo (Phase 1+ only), this hook becomes a no-op: closing the tab must NOT cancel a backend run.
- The `ContentGenerationAbortReason` union keeps `kind: 'navigation'` until Phase 4 (Plan v3 Q13).

### 4.4 `src/hooks/useContentGenerationHydration.ts`

Current body calls `loadPersistedLogs()` from `contentGenerationLogRepository.ts` and `useContentGenerationStore.getState().hydrateFromPersisted(jobs, pipelines)`. After Phase 0.5:

- When the durable flag is OFF: behavior is unchanged (Dexie hydrates terminal logs into the store).
- When the durable flag is ON: the hook ALSO calls `client.listActive()` and `client.listRecent(15)` and reopens SSE streams via `client.observe(runId, lastSeq)` for each active run. The terminal Dexie hydration path remains as the UI read-cache for closed runs.
- `MAX_PERSISTED_LOGS = 15` from `contentGenerationStore.ts` stays as the hygiene cap.

### 4.5 Boundary test

**File:** `src/infrastructure/legacyRunnerBoundary.test.ts` (NEW; mirrors PR #44's `legacyParserBoundary.test.ts`)

Walks `src/**/*.{ts,tsx}` (excluding test files and `LocalGenerationRunRepository.ts`) and asserts no file imports any of:

- `@/features/contentGeneration/pipelines/runTopicGenerationPipeline`
- `@/features/contentGeneration/jobs/runExpansionJob`
- `@/features/subjectGeneration` re-exports `createSubjectGenerationOrchestrator` / `resolveSubjectGenerationStageBindings`
- `@/features/crystalTrial/generateTrialQuestions`

The `@/features/contentGeneration/index.ts` re-export of `runTopicGenerationPipeline` and `runExpansionJob` is REMOVED in this PR; same for `triggerTopicGenerationPipeline` (only used inside the contentGeneration feature today, but its public export disappears).

## 🧱 Step 5 — Feature-owned `ArtifactApplier`s

### 5.1 Shared type

**File:** `src/features/generationContracts/artifacts/applier.ts` (NEW; sibling of existing `artifacts/types.ts`)

```tsx
import type { Artifact, ArtifactEnvelope, ArtifactKind } from './types';

export type AppliedArtifactRecordScope =
	| { variant: 'topic-expansion'; subjectId: string; topicId: string; targetLevel: number };

export interface ArtifactApplyContext {
	runId: string;
	deviceId: string;
	now: () => number;
	dedupeStore: AppliedArtifactsStore;
	subjectId?: string;
	topicId?: string;
	/** Run snapshot `next_level` — required for topic-expansion supersession. */
	topicExpansionTargetLevel?: number;
	/** Stage A lattice `contentHash` for subject-graph Stage B. */
	subjectGraphLatticeContentHash?: string;
}

export interface AppliedArtifactsStore {
	has(contentHash: string): Promise<boolean>;
	record(
		contentHash: string,
		kind: ArtifactKind,
		appliedAt: number,
		scope?: AppliedArtifactRecordScope,
	): Promise<void>;
	getLatestTopicExpansionScope(
		subjectId: string,
		topicId: string,
	): Promise<{ contentHash: string; targetLevel: number; appliedAt: number } | null>;
}

export interface ArtifactApplier<K extends ArtifactKind = ArtifactKind> {
	kind: K;
	apply(
		artifact: ArtifactEnvelope<K>,
		context: ArtifactApplyContext,
	): Promise<{ applied: boolean; reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid' }>;
}
```

Re-exported from `@/features/generationContracts/index.ts` alongside the existing `Artifact` / `ArtifactEnvelope` / `ArtifactKind` exports.

### 5.2 Topic Content applier

**File:** `src/features/contentGeneration/appliers/topicContentApplier.ts` (NEW)

Owns the writes that today happen at the tail of `runTopicGenerationPipeline.ts` for the three `ArtifactKind`s: `topic-theory`, `topic-study-cards`, and the three `topic-mini-game-*` variants.

- Mutates `useContentGenerationStore` ONLY through exported store actions (`registerJob` / `finishJob` / `mergeJobMetadata` etc. — never direct `setState`).
- Mutates the deck Dexie through `deckWriter.upsertTopicDetails` / `upsertTopicCards` / `appendTopicCards` (the existing `IDeckContentWriter` surface).
- Returns `{ applied: true }` on success so `generationRunEventHandlers.ts` can fire the legacy `topic-content:generation-completed` event with the right `stage` field.
- Idempotent by `contentHash` via `AppliedArtifactsStore`.

### 5.3 Topic Expansion applier

**File:** `src/features/contentGeneration/appliers/topicExpansionApplier.ts` (NEW)

Owns the tail writes from `runExpansionJob.ts` for the `topic-expansion-cards` artifact kind.

- Calls `deckWriter.appendTopicCards(...)` (NOT `upsertTopicCards`) per the Phase 0 expansion semantics.
- Supersession: when `context.topicExpansionTargetLevel` is set (from the run snapshot’s `next_level`), the applier compares against `dedupeStore.getLatestTopicExpansionScope(subjectId, topicId)` (backed by scoped rows in `applied_artifacts`). If a **stale** run’s artifact arrives after a winning run for the same target level (or an older level after a newer level was already applied), it returns `{ applied: false, reason: 'superseded' }` and `generationRunEventHandlers.ts` swallows the event without firing player-facing failure copy. Legitimate later level-ups (higher `next_level`) still apply. Each successful apply calls `record(..., scope: { variant: 'topic-expansion', subjectId, topicId, targetLevel })` when the target level is known.

### 5.4 Subject Graph applier

**File:** `src/features/subjectGeneration/appliers/subjectGraphApplier.ts` (NEW)

Applies `subject-graph-topics` (Stage A) then `subject-graph-edges` (Stage B). Today the `subjectGenerationOrchestrator.ts` writes both via `deckWriter.upsertGraph(...)` / `upsertSubject(...)` directly; that final-write block moves into the applier.

- Stage B requires the Stage A lattice `contentHash` for **this** run to already be present in the dedupe store. The composition root passes `context.subjectGraphLatticeContentHash` (equals `SubjectGraphEdgesRunInputSnapshot.lattice_artifact_content_hash` and the Stage A artifact’s `contentHash`). If missing or not `has(...)` in the store, returns `{ applied: false, reason: 'missing-stage-a' }` so the handler can retry after Stage A applies or replays (including the case where Stage A is a deduped no-op but the hash remains recorded).
- The Subject Graph Stage B `correctPrereqEdges` deterministic-correction (the narrow [AGENTS.md](http://AGENTS.md) curriculum-prerequisite-edges exception preserved by PR #44) STAYS inside `parseTopicLatticeResponse.ts` — the applier consumes the corrected lattice without re-running the correction.

### 5.5 Crystal Trial applier

**File:** `src/features/crystalTrial/appliers/crystalTrialApplier.ts` (NEW)

Applies the `crystal-trial` artifact: writes the prepared `CrystalTrialScenarioQuestion[]` into `useCrystalTrialStore` via the existing `startPregeneration` / question-attach actions (refactored if needed to expose a single applier-friendly entry point).

- **MUST NOT emit `crystal-trial:completed`** (Plan v3 Q21). That event is exclusively a player-assessment surface fired by `submitTrial(...)` — the `eventBusHandlers.ts` listener for it ALREADY scopes the celebration to assessment results, never to question generation.
- Once questions are attached, the existing `recomputeTrialAvailability()` watcher in `eventBusHandlers.ts` (subscribed to both `useCrystalTrialStore` and `useCrystalGardenStore` after both stores finish persist hydration) catches the false→true transition and fires `handleMentorTrigger('crystal-trial:available-for-player', ...)` — that path stays unchanged.

### 5.6 Dedupe store

**File:** `src/infrastructure/repositories/appliedArtifactsStore.ts` (NEW)

Dexie database `abyss-applied-artifacts`, table keyed by `contentHash`, value `{ contentHash, kind, appliedAt }` plus optional `topicScopeKey` / `expansionTargetLevel` for scoped topic-expansion rows. **v2** schema adds `topicScopeKey` index for `getLatestTopicExpansionScope` queries. Bounded by hygiene cap (separate from `MAX_PERSISTED_LOGS`); pruning policy lives in this file.

### 5.7 Tests

One test file per applier (`src/features/*/appliers/*.test.ts`):

- Idempotency by `contentHash` (re-applying same artifact returns `{ applied: false, reason: 'duplicate' }`).
- Each applier mutates ONLY the documented stores (assertion on which `useContentGenerationStore` actions and which `deckWriter` methods were called).
- Crystal Trial applier never emits `crystal-trial:completed`.
- Topic Expansion applier respects supersession.
- Subject Graph Stage B retries until Stage A is applied.

## 🧱 Step 6 — `generationRunEventHandlers.ts` composition root

**File:** `src/infrastructure/generationRunEventHandlers.ts` (NEW; the sanctioned durable-run composition root per the locked architecture amendment)

### 6.1 Public API

```tsx
import type { GenerationClient } from '@/features/contentGeneration/generationClient';
import type { ArtifactApplier } from '@/features/generationContracts';
import type { AppEventBus } from './eventBus';

export function startGenerationRunEventHandlers(deps: {
	client: GenerationClient;
	appliers: {
		topicContent: ArtifactApplier; // composite applier dispatching on kind
		topicExpansion: ArtifactApplier<'topic-expansion-cards'>;
		subjectGraph: ArtifactApplier; // dispatches `subject-graph-topics` and `subject-graph-edges`
		crystalTrial: ArtifactApplier<'crystal-trial'>;
	};
	eventBus: AppEventBus;
	telemetry: typeof import('@/features/telemetry').telemetry;
	deckWriter: import('@/types/repository').IDeckContentWriter;
}): { stop: () => void };
```

### 6.2 Behavior — typed `RunEvent → AppEventMap` adapter

1. The composition root subscribes to every active run via `client.observe(runId, lastSeq)`. It tracks observed run kinds via `RunSnapshot.kind` so the adapter knows which `AppEventMap` slot a `RunEvent` maps to.
2. For each `RunEvent`, runs the typed adapter:
    - **`run.queued`** and the first **`run.status: 'planning'`** → no legacy emission today; HUD progress only.
    - **`stage.progress`** → HUD progress update only. `useContentGenerationStore` sees the stage transition through the runner's existing job lifecycle hooks.
    - **`artifact.ready`** (kind `topic-theory` / `topic-study-cards` / `topic-mini-game-*`) → calls `appliers.topicContent.apply(...)`. On `applied: true` AND when the run's final stage is reached, emits `appEventBus.emit('topic-content:generation-completed', { subjectId, topicId, topicLabel, pipelineId, stage })` matching the existing payload in `eventBus.ts`.
    - **`artifact.ready`** (kind `topic-expansion-cards`) → calls `appliers.topicExpansion.apply(...)`. On `applied: true`, emits `appEventBus.emit('topic-expansion:generation-completed', { subjectId, topicId, topicLabel, level })`. On `applied: false, reason: 'superseded'`, emits NOTHING (player must not see failure copy for a superseded expansion).
    - **`artifact.ready`** (kind `subject-graph-topics` / `subject-graph-edges`) → calls `appliers.subjectGraph.apply(...)`. After Stage B applies, emits `appEventBus.emit('subject-graph:generated', { subjectId, boundModel, stageADurationMs, stageBDurationMs, retryCount, lattice, prereqEdgesCorrection?, … })` with the same payload shape today's orchestrator emits.
    - **`artifact.ready`** (kind `crystal-trial`) → calls `appliers.crystalTrial.apply(...)`. **NEVER** emits `crystal-trial:completed`. The existing trial-availability watcher in `eventBusHandlers.ts` picks up the store change and fires the mentor trigger.
    - **`run.failed`** (kind `topic-content`) → `appEventBus.emit('topic-content:generation-failed', { subjectId, topicId, topicLabel, pipelineId, stage, errorMessage, jobId?, failureKey?, partialCompletion? })`. The `errorMessage` is derived from the structured `GenerationFailureCode` so user-facing copy stays consistent.
    - **`run.failed`** (kind `topic-expansion`) → `appEventBus.emit('topic-expansion:generation-failed', { subjectId, topicId, topicLabel, level, errorMessage, jobId?, failureKey? })`.
    - **`run.failed`** (kind `subject-graph`) → if `code` starts with `validation:semantic-subject-graph`, emit `subject-graph:validation-failed`. Otherwise emit `subject-graph:generation-failed`. Both payloads match the existing shapes in `eventBus.ts`.
    - **`run.failed`** (kind `crystal-trial`) → `appEventBus.emit('crystal-trial:generation-failed', { subjectId, topicId, topicLabel, level, errorMessage, jobId?, failureKey? })`.
    - **`run.cancelled`** with `reason: 'superseded'` (kind `topic-expansion`) → **no** player-facing emission. HUD-only update.
    - **`run.cancelled`** with `reason: 'user'` → HUD update + telemetry; no mentor trigger.
    - **`run.cancel-acknowledged`** → HUD optimistic update only.
3. Telemetry payload mirrors the existing `telemetry.log(...)` shapes already emitted by the legacy runners and orchestrator (search for `telemetry.log(` in `eventBusHandlers.ts`, `runTopicGenerationPipeline.ts`, `runExpansionJob.ts`, `subjectGenerationOrchestrator.ts`, `generateTrialQuestions.ts`).

### 6.3 Boundary rules

- Imports allowed: `@/features/*` public barrels (NOT internals), `@/types/*`, `@/infrastructure/eventBus`, `@/features/telemetry`.
- Imports forbidden: any feature internal (e.g. `@/features/contentGeneration/pipelines/*`), any direct store `setState`, any LLM/remote-I/O.
- Boundary test `src/infrastructure/generationRunEventHandlers.boundary.test.ts` walks the file's import graph.

### 6.4 Tests

`src/infrastructure/generationRunEventHandlers.test.ts`:

- Adapter coverage: every legacy `AppEventMap` event still fires after migration when semantically correct (one happy-path test per pipeline kind).
- `crystal-trial:completed` is **never** emitted from question-generation success (drift-prevention pin).
- Superseded expansion: NO `topic-expansion:generation-failed` event.
- HUD progress matches today's behavior on stage transitions.
- Mentor triggers (via the existing `eventBusHandlers.ts` listeners, NOT this file directly) fire after applier returns `{ applied: true }`, not before.
- Duplicate `RunEvent` (same `seq`, replayed) does not double-apply the artifact.
- Subject-graph Stage B without Stage A applied → applier returns `missing-stage-a`, no event emitted, retry on next event lands the application.

## 🧱 Step 7 — Feature flag and app-boot wiring

### 7.1 Flag

- Add `NEXT_PUBLIC_DURABLE_RUNS` to `.env.example` (and document in README) with default `false`.
- Read once at module load in `generationClient.ts`. The flag is OFF for all developers in Phase 0.5.

### 7.2 App-boot wiring

**File:** `src/app/_bootstrap/wireGeneration.ts` (NEW; called from existing app bootstrap — locate by searching for `useContentGenerationHydration` consumers).

```tsx
export function wireGeneration(): void {
	const deviceId = ensureDeviceId();
	const localRepo = new LocalGenerationRunRepository({ deviceId, now: Date.now });
	const durableRepo = new DurableGenerationRunRepositoryStub({ deviceId }); // Phase 1 implements
	const client = createGenerationClient({
		deviceId,
		now: Date.now,
		flags: { durableRuns: process.env.NEXT_PUBLIC_DURABLE_RUNS === 'true' },
		localRepo,
		durableRepo,
	});
	registerGenerationClient(client);
	startGenerationRunEventHandlers({
		client,
		appliers: {
			topicContent: createTopicContentApplier({ deckWriter }),
			topicExpansion: createTopicExpansionApplier({ deckWriter }),
			subjectGraph: createSubjectGraphApplier({ deckWriter }),
			crystalTrial: createCrystalTrialApplier(),
		},
		eventBus: appEventBus,
		telemetry,
		deckWriter,
	});
}
```

The stub `DurableGenerationRunRepositoryStub` returns synthetic `run.failed` events with `code: 'config:missing-model-binding'` for every submission so the app boots cleanly with the flag flipped on but no Worker present. Phase 1 replaces this stub with the real `DurableGenerationRunRepository`.

### 7.3 Device id

**File:** `src/infrastructure/identity/deviceId.ts` (NEW)

- Mints `crypto.randomUUID()` on first load, persists to `localStorage` as `abyss.deviceId`.
- Phase 0.5 uses the device id only so synthesized `RunEvent`s carry parity with Phase 1 SSE events; nothing else reads it yet.

## ✅ Exit criteria checklist

- [ ]  `IGenerationRunRepository` defined in `src/types/repository.ts`; boundary test green.
- [ ]  `LocalGenerationRunRepository` implemented; **the only file** importing the four legacy entry points.
- [ ]  `legacyRunnerBoundary.test.ts` green; `@/features/contentGeneration/index.ts` no longer re-exports `runTopicGenerationPipeline` / `runExpansionJob` / `triggerTopicGenerationPipeline`.
- [ ]  `GenerationClient` facade landed; all four `start*` methods covered by tests.
- [ ]  All event-bus paths in `eventBusHandlers.ts`, plus `pubSubClient.on('topic-cards:updated', ...)`, plus the `card:reviewed` cooldown branch, plus `crystal:leveled` expansion branch, plus the retry surface in `retryContentGeneration.ts`, route through `GenerationClient`.
- [ ]  Four feature-owned `ArtifactApplier`s landed; **the only path** mutating `useContentGenerationStore` / `useCrystalTrialStore` / `deckWriter` from generation results.
- [ ]  `generationRunEventHandlers.ts` composes appliers and fires legacy `appEventBus` events; boundary test green.
- [ ]  Adapter tests prove legacy event semantics, including no false `crystal-trial:completed` on question generation, partial-stage suppression in mentor handler, and superseded-expansion silence.
- [ ]  `NEXT_PUBLIC_DURABLE_RUNS` flag wired and documented; default `false`. Stub durable repo registered.
- [ ]  `useContentGenerationLifecycle.ts` is a no-op for durable runs; still cancels local runs with `'navigation'`.
- [ ]  `contentGenerationLogRepository.ts` documented as UI read-cache only; `MAX_PERSISTED_LOGS = 15` cap preserved.

## 🧪 Manual verification before merge

1. Start a topic content generation; confirm HUD progress matches today and `topic-content:generation-completed` fires for `stage === 'full'` only.
2. Trigger a Crystal Trial pre-generation by gaining XP toward a level boundary; confirm questions appear and **no** `crystal-trial:completed` fires from question success (verify via a temporary `appEventBus.on('crystal-trial:completed', console.log)` tap).
3. Level up a crystal at L1/L2/L3; confirm topic-expansion runs and supersession works (level up twice in quick succession). The first expansion run cancels with reason `superseded`; the player sees no failure copy.
4. Cancel an in-flight subject-graph Stage B; confirm `run.cancel-acknowledged` is immediate and terminal `run.cancelled` follows at the boundary.
5. Force a parse failure (vitest fixture from PR #50's eval harness as a test seed) and confirm `*:generation-failed` carries the structured `GenerationFailureCode` end-to-end.
6. Toggle `pubSubClient` `topic-cards:updated` (e.g., via a manual `deckWriter.persistTopicContentBundle(...)` call) on a topic with `awaiting_player` trial status — confirm trial regen runs through `client.startCrystalTrial`.
7. Flip `NEXT_PUBLIC_DURABLE_RUNS=true` and verify the app boots: every submitted run terminates with the synthetic `config:missing-model-binding` failure, but `GenerationClient` and `generationRunEventHandlers.ts` load cleanly.

## 🔭 Phase 1 hand-off notes

When Phase 1 begins, only the following changes are required to flip Crystal Trial to durable execution:

1. Replace `DurableGenerationRunRepositoryStub` with the real `DurableGenerationRunRepository` against the Hono Worker.
2. Set `NEXT_PUBLIC_DURABLE_RUNS=true` in the dev environment.
3. Extend `useContentGenerationHydration.ts` to call `client.listActive()` / `listRecent(N)` and reopen SSE streams from `lastSeq`.
4. Wire the Phase 0 step 6 `assertPipelineSurfaceConfigValid(surfaceId)` invocation into `generationRunEventHandlers.ts` (the architecture amendment explicitly defers this from Phase 0).
5. No call site, no applier, and no event mapping needs to change. That is the contract Phase 0.5 buys.
