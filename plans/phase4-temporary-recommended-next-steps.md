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
10. **Backend artifact materialization is now wired into durable workflows.** `backend/src/learningContent/artifactApplication.ts` applies validated artifacts to the D1 Learning Content Store for Subject Graph topics/edges, Topic Theory, Topic cards/mini-games/expansion, and Crystal Trial sets. Workflows now run artifact writes, checkpoint writes, token accounting, cache-hit materialization, Learning Content application, artifact-ready events, cancellation/failure writes, and terminal completion/failure/cancellation writes inside named `step.do` boundaries before `run.completed`.
11. **OpenRouter Worker request construction is now canonicalized.** `backend/src/llm/openrouterClient.ts` exposes shared `callOpenRouterChat({ jobKind, modelId, messages, responseFormat, providerHealingRequested, temperature })`; Crystal Trial, Topic Expansion, Subject Graph, and Topic Content adapters now delegate to it. The helper preserves strict `json_schema`, backend-policy-owned response healing, token usage accounting, no streaming, no `json_object` fallback, and fail-loud validation of malformed OpenRouter response/usage wrappers.
12. **Backend route validation has a first shared schema seam.** `backend/src/routes/validation.ts` now owns Zod-backed validation for `POST /v1/runs` intent envelopes, `GET /v1/runs` list filters, retry bodies, and Crystal Trial read route params/query. Invalid retry JSON no longer falls through as an empty retry request, run-list filters fail before D1 query construction, client-built snapshots remain rejected at the Worker boundary, and Crystal Trial malformed route inputs use one structured boundary error shape.
13. **Backend route validation has been extended across additional framework edges.** The same Zod seam now validates run path ids for get/cancel/retry, SSE resume cursors (`Last-Event-ID` / `lastSeq`), artifact read ids, and failure-stats filters before repository calls. `/v1/runs/stats` is mounted before the catch-all run-id route so stats requests cannot be misrouted through `GET /v1/runs/:id`.
14. **Cloudflare runtime test harness and first D1 proofs have landed.** `backend/vitest.runtime.config.ts` runs `src/runtimeTests/**/*.runtime.test.ts` through `@cloudflare/vitest-pool-workers` against the Worker entrypoint and wrangler bindings. Runtime tests now reset/apply `backend/d1/reset.sql` + `backend/d1/init.sql`, prove real-D1 `atomicSubmitRun` same-key concurrency/idempotency/budget rollback behavior, and prove semantic-keyed event idempotency under concurrent `appendTypedOnce` calls.
15. **Generation-policy parsing is schema-backed.** `parseGenerationPolicy` now uses the Zod-backed `generationPolicySchema`, still fails with `WorkflowFail('config:invalid')`, normalizes trimmed model IDs, requires the exact nine backend job kinds, rejects unknown fields/nested extras/non-OpenRouter models/non-finite temperatures, and adds `parseGenerationPolicyJson` for backend-owned JSON overrides with no default fallback after invalid config.

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
- Backend Learning Content artifact applier (`backend/src/learningContent/artifactApplication.ts`) with tests for theory details, study-card materialization, Crystal Trial sets, and Subject Graph topics/edges.
- Durable Workflow side-effect step split: artifact/cache materialization, stage checkpoint writes, D1/R2 artifact writes, token accounting, `artifact.ready`, cancellation, failure, and terminal ready writes now execute inside named `step.do` boundaries. Single-stage Crystal Trial and Topic Expansion now keep model call + strict parse + semantic validation in one retryable generation step, with persistence/application in separate idempotent storage steps.
- Shared Worker OpenRouter chat helper (`callOpenRouterChat`) now owns canonical request construction for all four pipeline adapters, with tests pinning strict JSON Schema, response-healing plugin shape, temperature handling, token usage, absence of streaming/job metadata leakage, and fail-loud provider wrapper validation.
- Shared backend route validation seam (`backend/src/routes/validation.ts`) with Zod-backed tests for run submission envelopes, run list filters, retry bodies, Crystal Trial read params/query, run path ids, SSE resume cursors, artifact ids, and failure-stats filters. Route tests prove malformed inputs stop before run lookup/workflow dispatch/artifact lookup/stats D1 scans, and that `/v1/runs/stats` routes to the stats handler rather than the generic run-id handler.
- Cloudflare runtime test harness (`backend/vitest.runtime.config.ts`, `pnpm --filter abyss-durable-orchestrator test:runtime`) with real local D1 schema reset/init helpers and runtime tests for `atomicSubmitRun` concurrency/idempotency/budget rollback plus semantic-keyed event idempotency.
- Zod-backed backend generation-policy parser and JSON parser with tests for strict job-key coverage, model ID constraints, temperature constraints, nested extra keys, invalid JSON, blank JSON, normalized hashes, and no fallback after invalid backend override.

## Recommended next steps

The code-review findings are compatible with `plans/durable-workflow-orchestration.md` when treated as **durability and framework-edge hardening**, not as a change in orchestration strategy. Keep Cloudflare Workflows + Hono + D1/R2. Do not introduce Durable Objects as a replacement orchestrator, do not replace the typed event/status contracts, and do not add downstream parser recovery.

### Remaining recommended follow-ups in order of priority (remove items as they are completed)

 1. Continue real Cloudflare runtime tests beyond the landed D1/event proofs: Worker route dispatch failure/retry, R2 artifact write/read behavior, Workflow retry/replay faults, cancellation/cache-hit/supersession boundaries.
 2. Continue validation hardening for Learning Content Store JSON envelopes (generation-policy config parsing is now schema-backed).
 3. After runtime proof, proceed toward durable-only routing and local-runner/settings legacy deletion.

### Critical fixes to eliminate now

1. **Make Workflow side effects durable and idempotent before `run.completed`**
   - Move every side-effectful Workflow operation into named `step.do` boundaries: status transitions, cancellation writes/events, failure writes/events, D1/R2 artifact writes, checkpoint writes, usage/token accounting, cache-hit materialization, `artifact.ready`, and terminal `run.completed` / `run.failed` / `run.cancelled` events.
   - Event-level deterministic semantic idempotency is now in place (`events.semantic_key`, unique `(run_id, semantic_key)`, `appendOnce` / `appendTypedOnce`, Workflow status/progress/artifact/terminal events using semantic keys). Artifact writes, checkpoints, Learning Content Store application, cache-hit materialization, and token accounting now run behind named Workflow steps and rely on natural D1/R2 idempotency (`artifacts`/read-model upserts plus semantic event keys). **Remaining:** prove replay behavior under the Cloudflare runtime test pool and audit any newly-added side effects for the same pattern.
   - Workflow LLM retry options now use shared explicit retry constants with `delay: '5 seconds'`; storage and terminal side effects now use explicit retry/timeout constants. **Remaining:** tune these constants with real Worker runtime tests if Cloudflare behavior requires narrower bounds.
   - Cloudflare Workflow terminal-error mapping is now in place for terminal `WorkflowFail` prefixes. Keep auditing new failure codes so invalid config, impossible snapshots, invalid retry plans, parse/semantic terminal failures, and already-terminal/cancelled states continue to map to `NonRetryableError`.
   - Align retry semantics with generation correctness: when a parse/semantic failure should trigger a fresh model attempt, keep model call + strict parse + semantic validation in the same retryable stage step. Persist artifacts/events in a separate idempotent storage step. If raw or parsed output is large, store it in R2 inside the step and return only keys/compact metadata.

2. **Artifact appliers on backend — implementation landed; runtime proof remains**
   - Validated artifacts are written to R2/D1 metadata, then applied to the D1 Learning Content Store before `run.completed`.
   - Cache-hit runs/stages materialize Learning Content Store rows before completion.
   - Application shares the idempotency model above through deterministic Workflow step names, D1 read-model upserts, artifact cache unique keys, and semantic event keys. **Remaining:** Cloudflare runtime replay/concurrency tests, stale Topic Expansion supersession proof under replay/concurrency, plus a follow-up product decision for the existing CLOZE-to-deck read-model gap inherited from frontend appliers.

3. **Add real Cloudflare runtime integration tests for durability-critical paths**
   - `@cloudflare/vitest-pool-workers` harness is in place, with real/local D1 coverage for duplicate event prevention and the core `atomicSubmitRun` transaction/idempotency behavior: idempotency hit does not reserve budget twice, budget failure releases the temporary idempotency record, run creation and idempotency record roll back together, and same-key concurrency returns one run.
   - **Remaining:** Workflow step retry/replay behavior, R2 artifact writes/reads, cancellation before/after stage boundaries, cache-hit materialization/ready-cache behavior, retry child runs, and dispatch failure/no-orphan-queued behavior.

4. **Only then delete local runner / settings legacy**
   - Remove frontend snapshot construction/model settings once durable-only routing is ready; current local-runner compatibility still builds snapshots before the durable adapter converts them to intents.
   - Remove local pipeline runners after durable-only intent routing works and backend appliers are durable.
   - Remove frontend generation model/healing settings.
   - Remove `NEXT_PUBLIC_DURABLE_RUNS*` flags and navigation abort.

### Follow-up hardening worth doing after the critical fixes

1. **Replace hand-rolled Hono framework-edge code where behavior can stay identical**
   - Replace custom CORS plumbing with `hono/cors` only if production defaults, per-request env origin resolution, durable headers, and documented rejection behavior remain exact.
   - Replace manual SSE stream formatting with `streamSSE()` / `writeSSE()` while preserving the domain polling/replay contract: `Last-Event-ID`, `seq > lastSeq`, keepalives, terminal close, and client disconnect cleanup.

2. **Standardize backend request/config validation — in progress**
   - `backend/src/routes/validation.ts` now covers `POST /v1/runs` intent bodies, retry bodies, run list filters, Crystal Trial read params/query, run path ids for get/cancel/retry, SSE resume cursors, artifact read ids, and failure-stats filters with Zod-backed boundary validation.
   - Generation policy config parsing is now schema-backed and strict, with a backend-owned JSON parser that never falls back to defaults after an invalid override.
   - **Remaining:** extend the same seam/posture to any newly added route params and bodies, Learning Content Store JSON envelopes, and any future OpenRouter wrapper fields. Validation must continue to fail loudly at the boundary, not normalize ambiguous input downstream.

3. **Collapse duplicated OpenRouter request construction without hiding policy — completed**
   - Per-pipeline typed adapters remain, but now route through shared `callOpenRouterChat({ jobKind, modelId, messages, responseFormat, providerHealingRequested, temperature })`.
   - Backend generation-policy ownership, strict `json_schema`, provider-healing metadata, failure-code mapping, and no `json_object` pipeline fallback are preserved. The latest pass also validates OpenRouter response/usage wrappers at the Worker boundary. **Remaining:** keep lockstep tests updated if the browser non-pipeline OpenRouter client or future telemetry trace fields change.

4. **Extract a small internal Workflow stage runner after semantics are fixed**
   - Once side-effect boundaries/idempotency are correct, compress repeated plan/check-cancel/generate/validate/persist/ready/failure patterns behind a narrow internal helper.
   - Do not create a branching mega-workflow; preserve one Workflow class per pipeline kind and deterministic stage names.

5. **Final boundary/docs pass**
   - Add repo-wide tests for no local runners, no frontend model policy, no response-healing setting, no Supabase, no Durable Object workflow/database pattern, no custom pipeline `json_object` fallback, and no direct D1/R2/browser access outside backend adapters.
   - Remove `nodejs_compat` only after a Worker bundle/runtime test proves backend code and imported contracts do not require Node compatibility.
   - Keep raw D1 repositories unless migrations/query typing become painful; Drizzle is not a Phase 4 prerequisite.
   - Update docs once behavior matches implementation.
