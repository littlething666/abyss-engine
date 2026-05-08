# Phase 4 Temporary Recommended Next Steps

Last updated: 2026-05-08.

## Status review

The previous ordering is still broadly correct, with these updates from the latest implementation pass:

1. **Stale root-owned SQL files are resolved.** `backend/db/init.sql` and `backend/db/reset.sql` were manually removed outside the agent sandbox. `backend/d1/init.sql` and `backend/d1/reset.sql` remain the canonical D1 schema/reset paths.
2. **Backend Learning Content routes are implemented.** `backend/src/routes/learningContent.ts` now exposes the read routes below, mounted under `/v1`, with route-level per-device/not-found tests in `backend/src/routes/learningContent.test.ts`.
3. **Frontend backend deck reads are wired for durable mode.** `src/infrastructure/repositories/BackendDeckRepository.ts` implements `IDeckRepository` against the Learning Content routes via `ApiClient`, and `src/infrastructure/deckRepositoryFactory.ts` switches `deckRepository` to backend reads when `NEXT_PUBLIC_DURABLE_RUNS=true` and `NEXT_PUBLIC_DURABLE_GENERATION_URL` is configured. Legacy local-runner builds still use IndexedDB until Phase 4 deletes local runners.
4. **Backend subject manifest envelope is enforced at write time.** `backend/src/learningContent/learningContentRepo.ts` now rejects `upsertSubject` calls unless `subjects.metadata_json.subject` contains the frontend manifest envelope (`description`, `color`, `geometry.gridTile`, optional `topicIds`, optional domain `metadata`). This keeps missing presentation fields as explicit backend materialization errors rather than frontend defaults.
5. **Backend generation policy is bound before durable run hashing/storage and used by workflows.** `POST /v1/runs` now overwrites snapshot policy fields with backend-resolved `model_id`, `generation_policy_hash`, and `provider_healing_requested` before `input_hash` calculation and D1 persistence. Workflow LLM calls resolve their job policy through `backend/src/generationPolicy/*`, trace `generationPolicyHash`, and no longer use workflow-local model fallbacks or hard-coded provider-healing booleans.
6. **Durable run submission has moved to intents at the Worker boundary.** `POST /v1/runs` now accepts `{ kind, intent }`, rejects `snapshot`, and rejects generation-policy fields (`model`, `modelId`, `model_id`, provider/healing/plugin/response-format fields) at any depth before expansion. `backend/src/runIntents/runIntentExpansion.ts` expands intents into backend-owned snapshots using the Learning Content Store and backend Generation Policy before `input_hash` calculation and D1 persistence. The frontend durable repository now posts compact intents instead of client-built snapshots.
7. **Backend prompt construction now has a dedicated seam.** `backend/src/prompts/generationPrompts.ts` owns prompt message construction for Subject Graph Generation, Topic Content, Topic Expansion, and Crystal Trial workflows. Workflows no longer inline prompt messages. Stage B Subject Graph prompts use the authoritative Stage A Topic Lattice artifact, and Topic Content card/mini-game prompts materialize theory prompt context from the ready theory artifact when the run snapshot is a full-pipeline snapshot.
8. **Topic Content stage artifacts now have parent-bound cache keys.** `backend/src/workflows/topicContentStageInputHash.ts` computes per-stage artifact `input_hash` values. Theory keeps the run snapshot hash; study-card artifacts include the consumed theory artifact `content_hash`; mini-game artifacts include the consumed theory and study-card artifact `content_hash` values. Topic Content full-pipeline submission no longer short-circuits at the Worker boundary on a cached theory artifact.
9. **Workflow event idempotency and retry-edge hardening have started.** D1 `events` now has nullable `semantic_key` plus a unique `(run_id, semantic_key)` constraint, `IRunsRepo.appendOnce` / `appendTypedOnce` return the existing semantic event on replay, all Workflow-emitted status/progress/artifact/terminal events use deterministic semantic keys, LLM step retry options use the explicit `'5 seconds'` delay constant, and terminal `WorkflowFail` prefixes (`config:`, `precondition:`, `parse:`, `validation:`, etc.) are mapped to Cloudflare `NonRetryableError` after the failed run row/event is written.

## Completed to date

- `GET /v1/library/manifest`
- `GET /v1/subjects/:subjectId/graph`
- `GET /v1/subjects/:subjectId/topics/:topicId/details`
- `GET /v1/subjects/:subjectId/topics/:topicId/cards`
- `GET /v1/subjects/:subjectId/topics/:topicId/trials/:targetLevel?cardPoolHash=...`
- Manual removal of stale root-owned SQL files: `backend/db/init.sql` and `backend/db/reset.sql`; `backend/d1/init.sql` remains the only canonical schema path and `backend/d1/reset.sql` remains the canonical D1 reset path.
- Tests for device-scoped repository calls, missing read-model rows returning `404`, and malformed Crystal Trial route inputs returning `400`.
- `BackendDeckRepository` with strict Learning Content transport wrappers, encoded route paths, card wrapper/id mismatch checks, and manifest mapping from backend subject rows to frontend `Subject` values.
- Shared frontend device identity helper (`src/infrastructure/deviceIdentity.ts`) so backend deck reads and durable run submission use the same anonymous `X-Abyss-Device` value.
- Repository factory tests proving backend deck reads activate only when durable runs and the Worker URL are both configured.
- Backend `upsertSubject` manifest-envelope validation plus tests for strict failure when `metadata.subject` is missing.
- Backend generation-policy snapshot binding seam (`backend/src/generationPolicy/snapshotBinding.ts`) and tests proving backend policy overwrites client snapshot policy fields before hashing/storage.
- Workflow policy wiring for Crystal Trial, Topic Expansion, Subject Graph, and Topic Content; LLM traces now include `generationPolicyHash`.
- Intent-based durable submission seam (`backend/src/runIntents/runIntentExpansion.ts`) with tests for deep policy-field rejection and Learning Content Store-backed expansion for Topic Expansion and Crystal Trial.
- `POST /v1/runs` accepts `{ kind, intent }`, rejects client-built `snapshot`, rejects policy fields at any depth, and expands intents server-side through Learning Content Store + backend Generation Policy before hashing/storage.
- `DurableGenerationRunRepository` posts `{ kind, intent }` to `/v1/runs`; tests lock that durable submit bodies omit snapshots and client-side policy fields.
- Backend prompt modules in `backend/src/prompts/generationPrompts.ts` replace workflow-local prompt arrays for all four durable workflows, with unit tests covering prompt inputs and explicit failure when Subject Graph Stage B lacks a Stage A lattice.
- Topic Content per-stage `input_hash` calculation in `backend/src/workflows/topicContentStageInputHash.ts`, with tests proving parent artifact `content_hash` values alter study-card and mini-game cache keys.
- Topic Content stage-level cache handling in `backend/src/workflows/topicContentWorkflow.ts`; cached stages now resume through checkpoints and full-pipeline submissions are not marked complete solely because the theory artifact is cached.
- D1 event semantic idempotency: `events.semantic_key`, unique `(run_id, semantic_key)`, `appendOnce` / `appendTypedOnce`, and Workflow event emission converted to deterministic status/progress/artifact/terminal semantic keys.
- Workflow retry/failure-edge hardening: shared LLM step retry constants now use explicit `'5 seconds'` delay, and terminal `WorkflowFail` codes map to Cloudflare `NonRetryableError` so impossible/config/parse/semantic failures do not consume Workflow retries.

## Recommended next steps

The code-review findings are compatible with `plans/durable-workflow-orchestration.md` when treated as **durability and framework-edge hardening**, not as a change in orchestration strategy. Keep Cloudflare Workflows + Hono + D1/R2. Do not introduce Durable Objects as a replacement orchestrator, do not replace the typed event/status contracts, and do not add downstream parser recovery.

### Critical fixes to eliminate now

1. **Make Workflow side effects durable and idempotent before `run.completed`**
   - Move every side-effectful Workflow operation into named `step.do` boundaries: status transitions, cancellation writes/events, failure writes/events, D1/R2 artifact writes, checkpoint writes, usage/token accounting, cache-hit materialization, `artifact.ready`, and terminal `run.completed` / `run.failed` / `run.cancelled` events.
   - Event-level deterministic semantic idempotency is now in place (`events.semantic_key`, unique `(run_id, semantic_key)`, `appendOnce` / `appendTypedOnce`, Workflow status/progress/artifact/terminal events using semantic keys). **Remaining:** extend the same principle to artifact writes, checkpoints, Learning Content Store application, and token accounting.
   - Workflow LLM retry options now use shared explicit retry constants with `delay: '5 seconds'`. **Remaining:** define and apply explicit timeout/storage-step constants as side-effect steps are split.
   - Cloudflare Workflow terminal-error mapping is now in place for terminal `WorkflowFail` prefixes. Keep auditing new failure codes so invalid config, impossible snapshots, invalid retry plans, parse/semantic terminal failures, and already-terminal/cancelled states continue to map to `NonRetryableError`.
   - Align retry semantics with generation correctness: when a parse/semantic failure should trigger a fresh model attempt, keep model call + strict parse + semantic validation in the same retryable stage step. Persist artifacts/events in a separate idempotent storage step. If raw or parsed output is large, store it in R2 inside the step and return only keys/compact metadata.

2. **Artifact appliers on backend**
   - After validated artifacts are written to R2/D1 metadata, apply them to the D1 Learning Content Store before `run.completed`.
   - Cache-hit runs must materialize Learning Content Store rows before completion.
   - Application must share the idempotency model above: a replayed Workflow step or duplicate cache-hit completion must not double-write read models or emit duplicate semantic events.

3. **Add real Cloudflare runtime integration tests for durability-critical paths**
   - Add `@cloudflare/vitest-pool-workers` coverage for Workflow step retry/replay behavior, duplicate event prevention, R2 artifact writes/reads, D1 transaction semantics, cancellation before/after stage boundaries, cache-hit materialization, retry child runs, and dispatch failure/no-orphan-queued behavior.
   - Cover `atomicSubmitRun` against real/local D1, not only `fakeD1`: idempotency hit does not reserve budget twice, budget failure releases the temporary idempotency record, run creation and idempotency record roll back together, same-key concurrency returns one run, and ready cache hits behave consistently.

4. **Only then delete local runner / settings legacy**
   - Remove frontend snapshot construction/model settings once durable-only routing is ready; current local-runner compatibility still builds snapshots before the durable adapter converts them to intents.
   - Remove local pipeline runners after durable-only intent routing works and backend appliers are durable.
   - Remove frontend generation model/healing settings.
   - Remove `NEXT_PUBLIC_DURABLE_RUNS*` flags and navigation abort.

### Follow-up hardening worth doing after the critical fixes

1. **Replace hand-rolled Hono framework-edge code where behavior can stay identical**
   - Replace custom CORS plumbing with `hono/cors` only if production defaults, per-request env origin resolution, durable headers, and documented rejection behavior remain exact.
   - Replace manual SSE stream formatting with `streamSSE()` / `writeSSE()` while preserving the domain polling/replay contract: `Last-Event-ID`, `seq > lastSeq`, keepalives, terminal close, and client disconnect cleanup.

2. **Standardize backend request/config validation**
   - Introduce a single schema-validation seam for route bodies, params, and query strings (`POST /v1/runs` intent body, retry body, list filters, trial route params, generation policy, Learning Content Store JSON envelopes, and OpenRouter response wrappers).
   - Prefer the existing Zod posture from the durable plan unless there is a specific reason to choose another Standard Schema-compatible library. Validation must fail loudly at the boundary, not normalize ambiguous input downstream.

3. **Collapse duplicated OpenRouter request construction without hiding policy**
   - Keep per-pipeline typed adapters if useful, but route them through one shared `callOpenRouterChat({ jobKind, modelId, messages, responseFormat, providerHealingRequested, temperature })` implementation.
   - Preserve backend generation-policy ownership, strict `json_schema`, provider-healing metadata, trace metadata, failure-code mapping, and no `json_object` pipeline fallback. SDK adoption is optional and only acceptable if those contracts remain explicit.

4. **Extract a small internal Workflow stage runner after semantics are fixed**
   - Once side-effect boundaries/idempotency are correct, compress repeated plan/check-cancel/generate/validate/persist/ready/failure patterns behind a narrow internal helper.
   - Do not create a branching mega-workflow; preserve one Workflow class per pipeline kind and deterministic stage names.

5. **Final boundary/docs pass**
   - Add repo-wide tests for no local runners, no frontend model policy, no response-healing setting, no Supabase, no Durable Object workflow/database pattern, no custom pipeline `json_object` fallback, and no direct D1/R2/browser access outside backend adapters.
   - Remove `nodejs_compat` only after a Worker bundle/runtime test proves backend code and imported contracts do not require Node compatibility.
   - Keep raw D1 repositories unless migrations/query typing become painful; Drizzle is not a Phase 4 prerequisite.
   - Update docs once behavior matches implementation.
