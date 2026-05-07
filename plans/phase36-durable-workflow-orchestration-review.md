# Phase 3.6 durable workflow orchestration — current review

**Date:** 2026-05-07
**Scope reviewed:** Staged Phase 3.6 diff against `plans/durable-workflow-orchestration.md`.
**Verdict:** **Phase 3.6 remains open.** Several review fixes are staged, and the handler tests now reject duplicate completion / skipped-artifact behavior. Retry lineage, idempotency contention, Subject Graph Stage B failure semantics, and strict client event decoding still block a durable correctness claim.

## Compliance, Risk & Drift Assessment

- **Misalignment check:** Material contradictions remain with the durable orchestration plan. The staged plan says idempotency converges concurrent submissions on one run and retry fields are honored by workflows; current code does not prove either invariant. Client event decoding still contains defensive fallbacks that conflict with the fail-loud transport contract.
- **Architectural risk:** **High.** The affected seams own durable execution, budget reservation, artifact application, retry lineage, and browser hydration. If the remaining blockers ship as-is, duplicate budget reservations, opaque retry JSON, soft Stage B context failures, and transport fallback behavior can become stable behavior.
- **Prompt drift prevention:** Do not add compatibility shims for malformed durable events, unknown statuses, unknown artifact kinds, or unsupported retry fields. Invalid contracts should fail at the transport or workflow boundary, and idempotency contention should converge deterministically in Postgres.

## Confirmed Fixes

- **Active run listing:** `GET /v1/runs?status=active` now excludes terminal `ready`.
- **Hydration selection:** The hydration hook filters recent runs to `ready` / `applied-local` and dedupes `active ∪ recent` by `runId`.
- **Durable cursor store:** Browser event cursors are persisted in Dexie via `runEventCursors`.
- **Status mapper location:** DB-to-transport status mapping moved to `backend/src/contracts/statusMapper.ts`; unknown backend statuses throw.
- **Frontend status validation:** `parseRunStatus()` rejects non-transport status literals.
- **Typed status event shape:** `run.status` no longer carries backend-only `stage` metadata.
- **SSE cleanup:** Poll interval comments/constants are aligned and stream `cancel()` clears the interval.
- **Subject Graph Stage B context:** The workflow now passes `latticeTopicIds` into `subject-graph-edges` semantic validation on fresh Stage A output and attempts to load it on checkpoint resume.
- **Idempotency index:** The volatile `WHERE expires_at < now()` partial-index design was replaced with a plain `expires_at` index.
- **Handler completion semantics:** `generationRunEventHandlers` now advances the durable cursor after successful event handling and emits legacy completion only when this observation applied at least one new artifact.
- **Hydration cleanup:** The no-op cursor pre-read loop was removed; `observeRun()` is the single place that reads the shared cursor store and passes `startSeq` to the client stream.

## Real Blockers

### P0 — Retry planning is not consumed by workflows

`buildRetryRunSnapshot()` writes `resume_from_stage`, `retry_stage`, and `retry_of_job_id`. The Topic Content workflow reads `snapshot.stage`, not `resume_from_stage`; repo-wide usage does not show workflows consuming `retry_of_job_id`. A retry child run also receives no copied checkpoints, so it cannot skip already-ready parent stages.

**Required outcome:** Introduce a retry execution plan that covers both the run snapshot and checkpoint/job lineage. Either reject `jobId` with `400` until it drives a workflow-readable checkpoint/job row, or wire it into the same stage checkpoint path the worker actually reads.

### P0 — Idempotency contention is not one-winner atomic

The current flow is `check idempotency -> reserve budget -> insert run -> record idempotency`. Two concurrent misses can both reserve budget and create runs; the losing `record()` silently no-ops and the route still returns its duplicate run id.

**Required outcome:** Move idempotency reservation, budget reservation, run creation, and winner return behind one deterministic database seam, ideally a single RPC or transaction. The losing caller must return the winning `runId`, not a duplicate.

### P1 — Subject Graph Stage B should fail loudly without Stage A context

Checkpoint resume catches Stage A artifact load failure, logs `console.warn`, and proceeds with `latticeTopicIds: []`. Stage B requires the Topic Lattice topic IDs for semantic validation; an empty array is ambiguous and hides the missing contract input.

**Required outcome:** If Stage B cannot load lattice topic IDs, fail the workflow step with a structured error code. Also verify whether Stage B's input hash must be recomputed with the Stage A content hash in the active workflow, not only in client-built snapshots.

### P1 — Client event parsing still has transport fallbacks

`sseClient` validates statuses, but unknown event types become synthetic `run.status: queued`, missing `run.status` defaults to `queued`, and malformed `artifact.ready` payloads can become empty strings or `0`. `DurableGenerationRunRepository` also maps unknown job statuses to `queued`.

**Required outcome:** Replace fallback normalization with strict transport decoders. Unknown event types, missing required payload fields, and unknown job statuses should throw at the adapter boundary.

## Test Updates Required

- `generationRunEventHandlers.test.ts` now rejects completion after duplicate artifacts, unknown artifact kinds, artifact fetch failure, and missing Stage A application.
- Add hydration coverage proving a recent ready run with already-applied artifacts does not re-emit legacy completion.
- Add backend route/repo coverage for active status excluding `ready`.
- Add retry route + workflow tests proving stage-scoped retry uses the exact field the workflow reads and preserves/copies checkpoint lineage.
- Add idempotency contention tests proving two in-flight clients converge on one run and one budget reservation.
- Add status mapper and SSE decoder exhaustiveness tests for unknown statuses, unknown event types, and malformed payloads.
