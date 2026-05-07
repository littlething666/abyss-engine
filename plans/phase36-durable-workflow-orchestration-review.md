# Phase 3.6 durable workflow orchestration — final review (resolved 2026-05-07)

**Date:** 2026-05-07
**Scope reviewed:** Staged Phase 3.6 diff against `plans/durable-workflow-orchestration.md`.
**Verdict:** **Phase 3.6 is complete.** All P0 and P1 blockers resolved.

## Resolved Blockers

### P0 — Retry planning is now consumed by workflows (resolved 2026-05-07)

- `resolveWantedStages()` in `topicContentWorkflow.ts` now prefers `snapshot.resume_from_stage` (set by the retry planner) over `snapshot.stage`.
- `subjectGraphWorkflow.ts` now honours `snapshot.retry_stage` — `'topics'` skips Stage B, `'edges'` skips Stage A (loading lattice IDs from the parent artifact).
- The retry route (`runs.ts`) copies parent `ready` stage checkpoints to the child run. Workflows query `stageCheckpoints.byRun(newRunId)` on startup, so copied checkpoints cause `resolveWantedStages` to naturally skip already-completed stages.
- `retry_of_job_id` is recorded on the snapshot for future job-scoped resume (the field is preserved for the backend to read when checkpoint-by-job support lands).

### P0 — Idempotency contention is now one-winner atomic (resolved 2026-05-07)

- Created `backend/migrations/0008_atomic_submit.sql` with the `atomic_submit_run` RPC.
- The RPC serialises on `(device_id, idempotency_key)` via `pg_advisory_xact_lock(hashtext(...))` — two concurrent calls with the same key execute sequentially.
- Inside the lock: checks idempotency (24h TTL), cleans expired records, reserves budget (`FOR UPDATE` on `usage_counters`), inserts the run row, and records the idempotency key — all in one PostgreSQL transaction.
- The losing concurrent caller finds the idempotency record inserted by the winner and returns that `runId` with zero duplicate budget reservation or run rows.
- `POST /v1/runs` route updated to call `atomic_submit_run` instead of separate `check_idempotency` → `reserve_run_budget` → `insertRun` → `record_idempotency_key` calls.
- Existing `check_idempotency`, `record_idempotency_key`, and `reserve_run_budget` RPCs preserved as lower-level primitives for non-submit paths (retry, stats, etc.).

### P1 — Subject Graph Stage B now fails loudly without Stage A context (resolved 2026-05-07)

- Checkpoint resume: when the Stage A artifact load fails, the workflow now throws `WorkflowFail('precondition:missing-topic', ...)` instead of logging `console.warn` and proceeding with `latticeTopicIds: []`.
- `retry_stage='edges'` with no parent Stage A checkpoint also throws `precondition:missing-topic`.
- `retry_stage='topics'` skips Stage B entirely (emits a `stage.progress` skip event).
- The `correctPrereqEdges` deterministic-repair exception (AGENTS.md) is explicitly preserved.

### P1 — Client event parsing now uses strict transport decoding (resolved 2026-05-07)

- `sseClient.ts` `rowToRunEvent()`:
  - Unknown event types → **throw** (not synthetic `run.status: queued`)
  - Missing `artifact.ready` required fields (`artifactId`, `kind`, `contentHash`, `inputHash`, `schemaVersion`) → **throw**
  - Missing `run.failed` `code` field → **throw**
  - Missing `run.status` `status` field → **throw**
  - `JSON.parse` failures are caught separately from transport-contract violations — malformed JSON is logged and skipped but contract violations propagate.
- `DurableGenerationRunRepository.ts` `mapWorkerJobStatus()`:
  - Unknown job statuses → **throw** (not `queued`)
- `openSseStream()` generator: `rowToRunEvent()` is now called outside the `JSON.parse` try/catch so transport contract errors propagate to callers.

## Test coverage (2026-05-07)

- `sseClient.test.ts`: 17 tests (6 new strict-decoding tests for unknown event types, missing artifact fields, missing failed code, missing status field)
- `DurableGenerationRunRepository.test.ts`: 2 tests (new — known status mapping + unknown status throw)
- Backend: 103 pass + 1 skip (unchanged)
- All existing `generationRunEventHandlers.test.ts` tests pass (18 tests)

## Previously confirmed fixes

- **Active run listing:** `GET /v1/runs?status=active` now excludes terminal `ready`.
- **Hydration selection:** The hydration hook filters recent runs to `ready` / `applied-local` and dedupes `active ∪ recent` by `runId`.
- **Durable cursor store:** Browser event cursors are persisted in Dexie via `runEventCursors`.
- **Status mapper location:** DB-to-transport status mapping moved to `backend/src/contracts/statusMapper.ts`; unknown backend statuses throw.
- **Frontend status validation:** `parseRunStatus()` rejects non-transport status literals.
- **Typed status event shape:** `run.status` no longer carries backend-only `stage` metadata.
- **SSE cleanup:** Poll interval comments/constants are aligned and stream `cancel()` clears the interval.
- **Idempotency index:** The volatile `WHERE expires_at < now()` partial-index design was replaced with a plain `expires_at` index.
- **Handler completion semantics:** `generationRunEventHandlers` now advances the durable cursor after successful event handling and emits legacy completion only when this observation applied at least one new artifact.
- **Hydration cleanup:** The no-op cursor pre-read loop was removed; `observeRun()` is the single place that reads the shared cursor store and passes `startSeq` to the client stream.
