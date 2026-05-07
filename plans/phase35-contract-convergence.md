<aside>

**Status:** Immediate corrective gate. Created 2026-05-06 after codebase review of `plans/durable-workflow-orchestration.md` against the backend Worker and frontend durable seams. Updated 2026-05-06 with event-contract, JSON Schema, cache, supersession, enqueue, and retry corrections from the follow-up plan review.

**Scope:** Phase 3.5 closes the gap between the durable-orchestration plan and the live backend implementation before Phase 4 productionization or destructive cleanup begins. This phase is a hard merge gate: Phase 4 must not begin until every exit criterion below is met.

**Prerequisite:** Backend compile errors are fixed and `pnpm --filter abyss-durable-orchestrator typecheck` is green.

</aside>

> **Current DB note (2026-05-07):** This phase is historical. Current
> development databases are rebuilt from `backend/db/reset.sql` and
> `backend/db/init.sql`; any numbered migration references below are design
> history only.

## Overview

Phase 3.5 is a contract-convergence and correctness phase.

The durable plan already declares `src/features/generationContracts/` as the source of truth for snapshots, hashes, schemas, strict parsers, semantic validators, failure codes, run events, and prompt builders. The backend must now consume that source directly instead of carrying local approximations.

Phase 4 must not begin until Phase 3.5 is complete. Productionization before this gate would normalize duplicated contract logic, random artifact hashes, incomplete run events, and non-authoritative backend behavior.

## Compliance, Risk & Drift Assessment

### Misalignment check

- **Generation contract source of truth:** Backend workflows must use `@contracts` exports for `inputHash`, `contentHash`, JSON Schema response formats, strict parsing, semantic validation, and run-event construction. Local Worker hashers, inline response schemas, ad hoc `JSON.parse` validation, and random content hashes contradict the plan.
- **Repository pattern:** Durable HTTP and storage access still belongs in backend repositories and infrastructure adapters. Feature/client code must not bypass `GenerationClient` or repository contracts.
- **Budget enforcement:** A separate read-then-increment budget check is not full enforcement. Full daily budgets require an atomic reservation boundary.
- **RunEvent compatibility:** Backend events must match the typed `RunEvent` contract, because the frontend applier and legacy App Event Bus adapter depend on complete payloads.
- **Artifact cache semantics:** Artifact dedupe is keyed by artifact kind plus canonical input hash. Pipeline-kind cache checks are insufficient for multi-artifact pipelines such as Topic Content Pipeline and Subject Graph Generation.
- **Workflow enqueue correctness:** A queued run is not durable unless the Workflow creation is guaranteed or recoverable. Insert-then-log-on-failed-create leaves stranded queued runs.
- **Supersession correctness:** Topic Expansion supersession must treat server-terminal `ready` as terminal and must cancel the previous active run plus insert the new run atomically.
- **Retry API contract:** `POST /v1/runs/:id/retry` must return `{ runId }` after creating and dispatching the retry run.
- **Stats visibility:** Pre-auth `deviceId` is not a security boundary. Operator-wide failure stats need an explicit admin protection decision; otherwise stats should be scoped per device.

### Architectural risk

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Backend workflows keep local schemas/parsers and drift from `generationContracts`. | High | Add a Worker-safe contract adapter and delete local parser/schema/hash copies from all workflows. |
| Random `contentHash` values cause duplicate artifact application and break cache semantics. | High | Compute every artifact hash with `contentHash(parsedPayload)` before storage and event emission. |
| Inline Worker JSON Schemas drift from Zod schemas and eval fixtures. | High | Add a feature-owned JSON Schema response-format API in `generationContracts`; backend consumes it through the Worker adapter. |
| Pipeline-kind cache checks return incomplete cache hits for multi-artifact pipelines. | High | Resolve cache lookup by produced artifact kind(s); require all requested artifacts or fall through to stage work. |
| Workflow creation failure leaves a queued run that no worker owns. | High | Add transactional/outbox dispatch or mark the run failed with a structured enqueue failure before returning success. |
| Budget caps are bypassed under concurrent requests. | High | Replace read-then-increment with an atomic Postgres RPC that checks and reserves budget in one transaction. |
| Topic Expansion supersession can be blocked by completed `ready` runs or race with new-run insert. | High | Fix the partial unique index terminal-state set and move supersession cancellation plus insertion into one RPC/transaction. |
| Browser durable flows fail because CORS omits durable headers. | Medium | Add `supersedes-key`, `last-event-id`, and `cache-control` to allowed request headers. |
| SSE replay works but live tail closes early. | Medium | Implement the RunEventBus Durable Object live tail or a documented reconnect/polling loop that runs until terminal state. |
| Failure stats leak all-device aggregate data in pre-auth v1. | Medium | Scope stats by `X-Abyss-Device` by default, or require an explicit admin credential for operator-wide stats. |
| Retry route creates work but does not return a response contract. | Medium | Return `{ runId }`, enforce retry preconditions, and cover dispatch failure behavior. |

### Prompt Drift Prevention

- Do not add a second parser, fallback parser, markdown fence stripper, or shape normalizer to durable backend paths.
- Do not broaden schemas to accommodate model drift. Fix prompt/schema/model configuration upstream and fail loudly at the boundary.
- Do not add random or timestamp-derived hashes for durable artifacts.
- Do not add hand-written Worker JSON Schemas after `generationContracts` exposes the schema response-format API.
- Do not treat provider response healing as downstream recovery. It remains an OpenRouter plugin request recorded as metadata.
- Do not add direct remote I/O to features, components, or hooks.

## Decisions

1. **Should backend workflows be allowed to ship with temporary local schemas/parsers now that `generationContracts` exists?**

   Recommended answer: No. Phase 3.5 makes `generationContracts` consumption a hard gate.

   Solution: Every workflow imports a narrow Worker-safe adapter that re-exports only the public `@contracts` APIs needed by the backend.

2. **Is the failure dashboard per-device or operator-wide?**

   Recommended answer: Per-device for pre-auth v1 unless protected by an admin credential.

   Solution: Scope `/v1/runs/stats` to `X-Abyss-Device` by default. Add an explicit admin-only mode later if operator-wide stats are needed.

3. **Should `Idempotency-Key` dedupe last 24 hours or forever?**

   Recommended answer: 24 hours, matching the main plan.

   Solution: Add `idempotency_expires_at` or a cleanup job that removes stale keys. Tests must cover same-key reuse after expiry.

4. **Is artifact cache keyed by pipeline kind or artifact kind?**

   Recommended answer: Artifact kind.

   Solution: Document and test the mapping from pipeline kind to produced artifact kind(s), especially multi-stage `topic-content`.

5. **Should JSON Schema response formats be built in the backend or in `generationContracts`?**

   Recommended answer: `generationContracts`.

   Solution: Add feature-owned JSON Schema response-format builders beside the Zod schemas and export them through the public contracts barrel. The Worker adapter re-exports those builders; workflows must not hand-write response schemas.

6. **Should backend event rows be loose database records or typed `RunEvent` projections?**

   Recommended answer: Typed `RunEvent` projections.

   Solution: Persist events from builder helpers that require the canonical event type and payload. Transitional aliases such as `run.artifact-ready` and status-specific event names must be removed from backend emit paths.

7. **What should happen if run insertion succeeds but Workflow creation fails?**

   Recommended answer: The API must not silently return a durable run that no Workflow owns.

   Solution: Add a dispatch outbox or mark the run `failed_final` with a structured enqueue failure before returning. If an outbox is chosen, the response may be `201` only after the outbox row is persisted and a dispatcher test proves eventual Workflow creation.

8. **Should Topic Expansion supersession rely on separate repository calls?**

   Recommended answer: No.

   Solution: Implement a single transaction/RPC that cancels the prior active run, inserts the replacement run, and emits the supersession events consistently. The active-run uniqueness predicate must exclude all terminal server states, including `ready`.

9. **Should retry creation be treated as a best-effort side effect?**

   Recommended answer: No.

   Solution: `POST /v1/runs/:id/retry` returns `{ runId }` only after the retry run is created and dispatch has either succeeded or been made recoverable through the same enqueue/outbox policy.

## Implementation Steps

### Step 1 - Worker Contract Adapter

Create a backend-local adapter, for example `backend/src/contracts/generationContracts.ts`, that imports from `@contracts` and exposes:

- `inputHash`
- `contentHash`
- `strictParseArtifact`
- `semanticValidateArtifact`
- `ArtifactKind`
- typed `RunEvent` builders or assertion helpers
- JSON Schema response-format builders for each artifact kind
- schema-version lookup helpers by artifact kind
- artifact-kind resolution helpers for each pipeline kind and stage

Tests:

- Backend typecheck proves the Worker can import the shared contracts module.
- Boundary tests assert backend workflows do not define local `computeInputHash`, random `contentHash`, or ad hoc parser helpers.
- Boundary tests assert backend workflows do not declare inline `jsonSchema` literals for contract artifacts.

### Step 1A - Feature-Owned JSON Schema Response Formats

Add a public contracts API that converts each artifact schema into the exact OpenRouter `response_format` shape required by durable pipeline calls.

Required behavior:

- `response_format.type === 'json_schema'`.
- `json_schema.strict === true`.
- `json_schema.name` is stable and artifact-kind-specific.
- `json_schema.schema` is derived from the same source as the strict Zod parser contract, or generated from a locked schema artifact that is tested against the Zod schema fixtures.
- Prompt/schema/model changes still run the eval gate.

Tests:

- Every `ArtifactKind` has exactly one response-format builder.
- Response-format names are stable snapshots.
- Backend request-shape tests import the builder instead of duplicating expected inline schemas.
- No backend workflow contains hand-written JSON Schema payloads for durable artifacts.

### Step 2 - Canonical Hashes Everywhere

Replace every backend-local snapshot hasher with `inputHash(snapshot)`.

Replace every random content hash with `contentHash(parsedPayload)`.

Tests:

- Same snapshot produces the same `input_hash` in frontend and backend.
- Same artifact payload produces the same `content_hash` in frontend and backend.
- Cache-hit lookup uses artifact kind plus canonical `input_hash`.
- Stage checkpoints use deterministic stage input hashes, not random `stg_*` placeholders.

### Step 3 - Strict Parse and Semantic Validation

Replace workflow `JSON.parse` plus manual shape checks with:

```ts
const parsed = strictParseArtifact(kind, rawText);
if (!parsed.ok) throw new WorkflowFail(parsed.code, parsed.message);

const semantic = semanticValidateArtifact(kind, parsed.payload, context);
if (!semantic.ok) throw new WorkflowFail(semantic.code, semantic.message);
```

Tests:

- Parse failures preserve `parse:json-mode-violation` and `parse:zod-shape`.
- Semantic failures preserve `validation:semantic-*`.
- Subject Graph Stage B keeps only the documented prerequisite-edge deterministic correction exception.

### Step 4 - Typed RunEvent Emission

Add event builder helpers so backend rows are persisted from typed `RunEvent` inputs rather than loose strings and partial payloads.

Required `artifact.ready` payload:

- `artifactId`
- `kind`
- `contentHash`
- `inputHash`
- `schemaVersion`
- optional `subjectId`
- optional `topicId`

Tests:

- Cache-hit and workflow success events both include complete artifact payloads.
- Frontend SSE normalization receives no empty `kind`, `inputHash`, or `schemaVersion`.
- Backend emits canonical event types only: `run.queued`, `run.status`, `stage.progress`, `artifact.ready`, `run.completed`, `run.failed`, `run.cancel-acknowledged`, and `run.cancelled`.
- Status transitions use `run.status` with a typed status body, not status-specific event names such as `run.status:planning`.
- Client SSE normalization no longer accepts empty required artifact fields as valid events; malformed backend events fail tests.

### Step 4A - Artifact Cache and Stage Checkpoint Semantics

Replace pipeline-kind cache checks with artifact-kind-aware cache checks.

Required behavior:

- Single-artifact pipelines check their produced artifact kind:
  - `crystal-trial` -> `crystal-trial`
  - `topic-expansion` -> `topic-expansion-cards`
- Multi-artifact pipelines resolve cache by requested stage and produced artifact kinds:
  - Topic Content Pipeline: `topic-theory`, `topic-study-cards`, and the three mini-game artifact kinds as applicable.
  - Subject Graph Generation: `subject-graph-topics` for Stage A and `subject-graph-edges` for Stage B.
- A run may short-circuit only when every artifact required for the requested work is present.
- Partial cache hits become stage checkpoints or skipped stages, never a completed run with missing artifacts.

Tests:

- Full Topic Content Pipeline cache hit requires all requested artifacts.
- Subject Graph Stage B cannot complete from a Stage A-only cache hit.
- Cache-hit `artifact.ready` events include one complete event per cached artifact.
- Stage checkpoints persist real artifact ids returned by `artifacts.putStorage`.

### Step 5 - Atomic Budget Reservation

Replace separate budget read and best-effort increment with a transaction-backed RPC such as:

```sql
reserve_run_budget(
  p_device_id uuid,
  p_day text,
  p_kind text,
  p_estimated_tokens bigint
) returns jsonb
```

The RPC must:

- read or create the `usage_counters` row;
- reject when daily run or token cap would be exceeded;
- increment `runs_started` on success;
- return a structured `budget:over-cap` result on failure.

Provider token usage remains recorded after LLM completion, but run reservation must fail closed.

Tests:

- Concurrent submissions cannot exceed run cap.
- UTC rollover covers `23:59:59 UTC` and `00:00:01 UTC`.
- Cache-hit increments `runs_started` but not token counters.
- Retry submissions reserve budget under the same rules as initial submissions.

### Step 5A - Durable Enqueue and Retry Contract

Make Workflow dispatch recoverable and make retry responses explicit.

Required behavior:

- `POST /v1/runs` does not return a successful durable run unless Workflow dispatch succeeded or an outbox entry guarantees retryable dispatch.
- Dispatch failure without an outbox marks the run `failed_final`, emits `run.failed`, and returns a structured failure response.
- `POST /v1/runs/:id/retry` validates retry preconditions, creates a child run with `parent_run_id`, reserves budget, dispatches or enqueues recoverably, and returns `{ runId }`.
- Workflow creation errors do not leave unowned `queued` runs.

Tests:

- Simulated Workflow binding failure does not leave an active queued run without a dispatch record.
- Retry returns `{ runId }` and the child run has `parent_run_id`.
- Retry dispatch failure follows the same enqueue/failure policy as initial submission.
- Retrying a non-owned run returns `404`; retrying a non-terminal active run returns `409`.

### Step 6 - Durable Browser Transport Completion

Fix browser-facing transport before declaring durable UX complete:

- Add `supersedes-key`, `last-event-id`, and `cache-control` to CORS allowed headers.
- Implement live SSE tail via RunEventBus Durable Object, or implement reconnect/polling that continues until terminal run status.
- Ensure `Last-Event-ID` replay uses `seq > lastSeq`.

Tests:

- Topic Expansion supersession works from browser preflight through Worker.
- SSE resumes after an interrupted connection without double-applying artifacts.
- Closing and reopening the tab applies terminal artifacts exactly once.

### Step 6A - Topic Expansion Supersession Transaction

Fix server-side supersession so completed runs never block later expansion and replacement is atomic.

Required behavior:

- The active supersession uniqueness predicate excludes every terminal server state, including `ready`, `failed_final`, `cancelled`, and any future persisted terminal equivalent.
- Supersession cancellation, replacement run insertion, and supersession event emission are performed by one transaction/RPC or by a repository method that has equivalent transactional guarantees.
- Superseded runs emit `run.cancel-acknowledged` and terminal `run.cancelled` exactly once.
- Superseded Topic Expansion still suppresses player-facing failure copy.

Tests:

- A previous `ready` Topic Expansion does not block a new run with the same `Supersedes-Key`.
- Concurrent submissions with the same `Supersedes-Key` result in exactly one active replacement run.
- Superseded run events are complete typed `RunEvent`s.

### Step 7 - Stats Scope and Idempotency TTL

Stats:

- Default `/v1/runs/stats` to the requesting device.
- Add an explicit admin-only operator-wide mode only when an admin credential exists.

Idempotency:

- Enforce the 24-hour dedupe window declared in the main plan.
- Avoid permanent `(device_id, idempotency_key)` lockout unless the main plan is amended.

Tests:

- Stats route does not return other devices' runs in default mode.
- Same idempotency key returns existing `runId` inside TTL.
- Same idempotency key can create a new run after TTL.

## Exit Criteria

- `pnpm --filter abyss-durable-orchestrator typecheck` is green.
- Backend workflows import contract behavior through the Worker contract adapter.
- `generationContracts` exports JSON Schema response-format builders and backend workflows consume them through the Worker adapter.
- No backend workflow defines local `computeInputHash`, random `contentHash`, inline JSON Schema payloads, inline parser fallback, or partial artifact-ready payloads.
- Backend event persistence is fed by typed RunEvent builders; no canonical backend emit path uses status-specific event names or incomplete artifact payloads.
- Cache-hit behavior is artifact-kind-aware and covers multi-artifact pipeline semantics.
- Full budget reservation is atomic and fail-closed.
- Workflow dispatch failure is recoverable or converted to structured terminal failure; no unowned queued runs remain.
- Retry endpoint returns `{ runId }` and follows the same budget/dispatch/event contract as initial submission.
- Browser durable headers pass CORS preflight.
- SSE live tail or terminal-state reconnect is implemented and tested.
- Topic Expansion supersession is transaction-backed and `ready` runs do not block new superseding runs.
- Failure stats are scoped per device or explicitly admin-protected.
- Main plan references Phase 3.5 as a hard prerequisite for Phase 4.
