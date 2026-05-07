<aside>
📌

**Status:** Corrected Phase 4 plan, 2026-05-07. This file replaces the earlier Phase 4 plan that assumed the durable backend was already production-correct. Current codebase review shows Phase 3.6 is still open, so Phase 4 is now a **readiness-gated productionization and destructive-cleanup phase**, not a place to hide transport, retry, budget, idempotency, or event-contract fixes.

**Authoritative dependency:** `plans/durable-workflow-orchestration.md` Phase 3.6 must exit before Phase 4 cleanup PRs may delete the local in-tab path.

</aside>

## Overview

Phase 4 completes the Durable Workflow Orchestration program only after the durable backend is the sole reliable generation substrate for all four pipeline kinds:

- **Subject Graph Generation**
- **Topic Content Pipeline**
- **Topic Expansion**
- **Crystal Trial generation**

The earlier Phase 4 plan mixed three different kinds of work:

1. productionization that has already mostly landed (`backend/src/middleware/cors.ts`, `docs/security/threat-model.md`, `docs/security/storage-retention.md`, `docs/security/auth-migration.md`, `backend/src/routes/settings.ts`, `backend/migrations/0005_device_settings.sql`);
2. correctness fixes that belong to Phase 3.6 and must not be deferred to cleanup;
3. destructive removal of local runners, permissive parsers, feature flags, and client-owned provider settings.

This corrected plan separates those concerns. Phase 4 destructive cleanup starts only after Phase 3.6 proves durable execution can survive tab close, retry, replay, budget accounting, idempotency reuse, and typed event/status mapping without local fallbacks.

## Phase 3.6 Exit Gate

Do not open Phase 4 cleanup PRs until all Phase 3.6 gates in `plans/durable-workflow-orchestration.md` are complete:

- Live SSE tail replaces the replay-and-close stub in `backend/src/routes/runEvents.ts`.
- Hydration cannot miss terminal backend runs and uses a persisted per-run event cursor.
- `POST /v1/runs/:id/retry` returns `{ runId }`, reserves budget once, preserves lineage, and terminally fails on workflow dispatch errors.
- Budget reservation has one owner. Route-level `reserve_run_budget` reserves exactly once; workflows must not reserve run count again or call extra `incrementRunsStarted()`.
- Idempotency TTL is schema-correct. A stale key after 24 hours can create a fresh run despite persisted indexes.
- `IRunsRepo.append` accepts typed event inputs through backend event builders, not arbitrary event names and loose payloads.
- Backend underscore statuses and transport hyphen statuses map through one explicit status mapper.

Recommended solution: finish Phase 3.6 as a hard correctness gate, then run at least one end-to-end close-tab/reopen test per pipeline kind before deleting any local runner.

## Compliance, Risk & Drift Assessment

### Misalignment Check

- **No material architecture conflict in the corrected Phase 4 scope.** Cleanup remains behind infrastructure repositories and feature public APIs.
- **Known current-code contradictions are Phase 3.6 blockers, not Phase 4 tasks:** SSE replay-and-close, retry response omission, mixed budget ownership, idempotency TTL/index mismatch, untyped backend event writes, and status naming drift.
- **Client-owned `openRouterResponseHealing` still contradicts the target server-authoritative durable model.** Phase 4 removes the browser as the authority after server settings are read by Worker workflows.

### Architectural Risk

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Deleting `LocalGenerationRunRepository` while SSE/hydration is still flawed strands completed backend runs. | High | Phase 3.6 live-tail + terminal hydration gate must pass first. Add close-tab/reopen tests for all four pipeline kinds. |
| Budget cleanup accidentally preserves double counting. | High | Phase 4 may delete obsolete budget helpers only after Phase 3.6 proves exactly-one reservation across cache hit, cache miss, retry, and UTC rollover. |
| Parser deletion removes helpers still used by non-pipeline display surfaces. | Medium | Move any remaining display-only permissive helper into the owning study feature; forbid imports from pipeline/backend paths. |
| Removing durable feature flags prevents emergency fallback. | Medium | Only remove flags after dashboards show durable success at the Phase 3 exit floor for 14 consecutive days and all four pipeline kinds are backend-routed in production. |
| Server-side response-healing settings drift from client settings. | Medium | Add a one-shot localStorage-to-Worker migration, then remove client persistence and make workflows read `device_settings['response-healing']`. |

### Prompt Drift Prevention

Phase 4 must not normalize:

- local fallback orchestration after durable routing is considered complete;
- `json_object` fallback or permissive parser use in pipeline/backend paths;
- direct `fetch` outside infrastructure adapters;
- arbitrary backend event/status strings;
- client-side ownership of durable provider behavior;
- workaround branches that mask Phase 3.6 defects.

## Current State From Codebase Review

### Already Landed Or Partially Landed

- CORS middleware exists at `backend/src/middleware/cors.ts` and reads `ALLOWED_ORIGINS`.
- Security docs exist under `docs/security/`.
- Server settings persistence exists through `device_settings` rows keyed by setting name.
- `DurableGenerationRunRepository` exists and supports all repository methods.
- `LocalGenerationRunRepository` still exists and is still wired through `src/infrastructure/wireGenerationClient.ts`.
- `NEXT_PUBLIC_DURABLE_RUNS` and `NEXT_PUBLIC_DURABLE_RUNS_KINDS` still control routing.
- `openRouterResponseHealing` is still persisted in `src/store/studySettingsStore.ts`.

### Must Not Be Treated As Phase 4 Cleanup

- `backend/src/routes/runEvents.ts` still replays events, emits one keepalive for active runs, then closes.
- `useContentGenerationHydration` lists active runs only and does not observe recent terminal `ready` runs for missed artifact application.
- `generationRunEventHandlers.observeRun()` exposes `getLastAppliedSeq()` but does not pass it to `client.observe(runId, lastSeq)`.
- `backend/src/routes/runs.ts` retry currently logs workflow dispatch failure and returns no success body after dispatch.
- Route and workflow budget code both reserve/increment run counts.
- `idx_runs_device_idempotency` is still unique on `(device_id, idempotency_key)` while middleware claims stale keys can create fresh runs.
- Backend event writes still use raw strings and loose payload objects.
- Status strings are cast directly on the client in `workerRunToSnapshot()` and normalized ad hoc in `sseClient.rowToRunEvent()`.

## Phase 4 Goals

1. Finalize production-facing configuration and docs without contradicting live code.
2. Move durable provider settings ownership to the Worker.
3. Remove the local in-tab generation path after durable operation is proven.
4. Remove `NEXT_PUBLIC_DURABLE_RUNS` and per-kind routing flags.
5. Remove `{ kind: 'navigation' }` from `ContentGenerationAbortReason`.
6. Remove deprecated permissive parsers from generation pipeline paths.
7. Publish a program-end changelog and boundary tests that prevent legacy reintroduction.

## Step 0 — Readiness Verification

**Purpose:** prove Phase 3.6 is actually complete before deletion starts.

Required checks:

- `backend/src/routes/runEvents.sse.test.ts` proves active streams stay open until a later terminal event is persisted.
- Hydration tests prove close-tab-before-completion, reopen-after-`ready`, artifact applies exactly once, and completion side effects fire exactly once.
- Retry route tests prove `{ runId }` success response, dispatch-failure terminal failure, `parent_run_id`, and `{ stage, jobId }` preservation.
- Budget tests prove one `runs_started` increment for cache hit, cache miss, retry, workflow plan execution, and UTC rollover.
- Idempotency tests prove same key within 24 hours dedupes and same key after 24 hours creates a fresh run.
- Event/status boundary tests prove typed backend event builders and one status mapper cover every value.

Exit: all four pipeline kinds are backend-routed in the deployed environment and have passed close-tab/reopen manual verification.

## Step 1 — Production Configuration Reconciliation

**Files:** `backend/src/middleware/cors.ts`, `backend/wrangler.toml`, `backend/src/middleware/cors.test.ts`, `docs/security/threat-model.md`

Keep the current `ALLOWED_ORIGINS` env name unless there is a separate migration reason. Do not introduce a second `PRODUCTION_ORIGINS` variable.

Recommended solution:

- Preserve `accept`, `content-type`, `x-abyss-device`, `idempotency-key`, `supersedes-key`, `last-event-id`, and `cache-control` in allowed request headers.
- Decide whether non-preflight disallowed origins should receive structured `403 cors:forbidden` or rely on missing ACAO. If structured rejection is required, implement it explicitly and update tests/docs.
- Keep local development origin as an environment concern. Production deployments should not implicitly allow localhost unless that is deliberately configured in `ALLOWED_ORIGINS`.
- Update docs to match the actual Worker behavior.

Exit:

- CORS tests lock allowed preflight, disallowed preflight, actual disallowed-origin behavior, missing-origin behavior, and comma-trim parsing.

## Step 2 — Server-Authoritative Provider Settings

**Files:** `backend/src/routes/settings.ts`, `backend/src/repositories/deviceSettingsRepo.ts`, `backend/src/workflows/*Workflow.ts`, `src/store/studySettingsStore.ts`, settings UI callers.

Current backend settings persistence already stores a generic `'response-healing'` key, but workflows still hard-code `providerHealingRequested: true`, while frontend inference helpers read `openRouterResponseHealing` from local Zustand/localStorage.

Recommended solution:

- Define the server setting shape as `{ enabled: boolean }` under `device_settings` key `'response-healing'`.
- Add a repository helper that returns `true` by default when the setting is missing and throws on invalid persisted shape.
- Make every durable workflow read the setting during plan and thread it into OpenRouter request construction and job/trace metadata as `providerHealingRequested`.
- Add `GET /v1/settings` / `PUT /v1/settings` client infrastructure through the existing `ApiClient`; no component or feature should call `fetch` directly.
- Add one one-shot browser migration from `STUDY_SETTINGS_STORAGE_KEY.openRouterResponseHealing` to `PUT /v1/settings`, then remove the field from the local study settings snapshot.
- Keep non-pipeline local study explanation settings separate if they still need client-local model preferences.

Boundary tests:

- No `openRouterResponseHealing` reference remains under `src/**` except the marked one-shot migration until it is removed.
- Workflows do not hard-code `providerHealingRequested: true`.
- Settings route rejects invalid `'response-healing'` shape with a structured parse/config failure.

## Step 3 — Remove Durable Routing Flags

**Files:** `src/infrastructure/wireGenerationClient.ts`, `src/features/contentGeneration/generationClient.ts`, `.env.example`, docs.

Recommended solution:

- Delete `NEXT_PUBLIC_DURABLE_RUNS` and `NEXT_PUBLIC_DURABLE_RUNS_KINDS`.
- Register `DurableGenerationRunRepository` unconditionally when `NEXT_PUBLIC_DURABLE_GENERATION_URL` is configured.
- Fail loudly at bootstrap when the durable URL is missing in a production build.
- Remove the `localRepo`, `flags`, and `durableKinds` arguments from `createGenerationClient()`.
- Keep the repository interface; delete only the selection logic.

Boundary tests:

- No `NEXT_PUBLIC_DURABLE_RUNS` or `NEXT_PUBLIC_DURABLE_RUNS_KINDS` references remain under `src/**`, config docs, or tests except changelog notes.
- `GenerationClient` no longer accepts a local repository implementation.

## Step 4 — Delete Local In-Tab Runners

**Files to delete after Step 3:**

- `src/infrastructure/repositories/LocalGenerationRunRepository.ts`
- `src/infrastructure/repositories/LocalGenerationRunRepository.test.ts`
- `src/infrastructure/repositories/localGenerationRunArtifactCapture.ts`
- `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts`
- `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.test.ts`
- `src/features/contentGeneration/jobs/runExpansionJob.ts`
- `src/features/contentGeneration/jobs/runExpansionJob.test.ts`
- `src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.ts`
- `src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.test.ts`
- `src/features/crystalTrial/generateTrialQuestions.ts`
- `src/features/crystalTrial/generateTrialQuestions.test.ts`

Recommended solution:

- Delete legacy dispatchers only after every entry path already submits `RunInputSnapshot`s to the durable client.
- Collapse retry helpers so retry goes through `GenerationClient.retry()` and the Worker retry route.
- Remove local synthetic `RunEvent` wording from comments once the local repo is gone.

Boundary tests:

- Deleted file paths do not exist.
- No import specifier references legacy runner modules.
- No feature, component, or hook imports `DurableGenerationRunRepository`, `ApiClient`, or `sseClient` directly.

## Step 5 — Drop Navigation Abort

**Files:** `src/types/contentGenerationAbort.ts`, `src/hooks/useContentGenerationLifecycle.ts`, call sites.

Recommended solution:

- Remove `{ kind: 'navigation'; source: 'beforeunload' }` from `ContentGenerationAbortReason`.
- Delete `useContentGenerationLifecycle.ts` if its only remaining job is beforeunload cancellation.
- Preserve `{ kind: 'user' }` and `{ kind: 'superseded' }` cancellation semantics through the durable Worker.

Boundary tests:

- `kind: 'navigation'` cannot be constructed as a content-generation abort reason.
- No `beforeunload` cancellation path dispatches generation aborts.

## Step 6 — Remove Deprecated Permissive Parsers From Pipeline Paths

**Candidate files after local runner deletion:**

- `src/features/contentGeneration/parsers/parseCrystalTrialPayload.ts`
- `src/features/contentGeneration/parsers/parseTopicCardsPayload.ts`
- `src/features/contentGeneration/parsers/parseTopicTheoryContentPayload.ts`
- `src/features/subjectGeneration/graph/topicLattice/parseTopicLatticeResponse.ts`
- `src/lib/llmResponseText.ts`

Recommended solution:

- Delete parser files that become unreferenced after Step 4.
- If `extractJsonString()` or markdown-fence helpers still serve non-pipeline display surfaces, move them into the owning feature as display-only helpers. Do not leave them in a shared `src/lib` location that pipeline code can casually import.
- Preserve the curriculum prerequisite-edge deterministic repair exception by keeping `correctPrereqEdges` inside the generation contracts public API and invoking it from the Subject Graph Stage B validation path. It must remain a single documented repair pass, not a permissive parser.

Boundary tests:

- No backend workflow, generation contract, Subject Graph Generation, Topic Content Pipeline, Topic Expansion, or Crystal Trial generation path imports permissive parsers.
- Any remaining display-only JSON helper is importable only from the owning study/display feature.

## Step 7 — Documentation And Program Changelog

**Files:** `README.md`, `docs/security/threat-model.md`, `docs/security/storage-retention.md`, `docs/security/auth-migration.md`, `CHANGELOG.md` if present.

Recommended solution:

- Update docs to describe durable-only generation and remove feature-flag migration language.
- Keep the existing docs under `docs/security/`; do not create duplicate root-level versions unless the documentation structure is intentionally changed.
- Document remaining pre-auth limitations: `deviceId` is an identifier, not a credential; budgets are per-device until auth migration.
- Clarify storage retention as policy if automation is not implemented. Do not claim cron or SQL retention jobs exist unless they are in the repo.
- Add a Phase 4 changelog section listing breaking removals: local runners, permissive pipeline parsers, navigation abort, durable flags, and client-owned response-healing setting.

## PR Sequencing

1. **PR-A: Phase 3.6 exit verification update** — tests and docs proving the prerequisite gate is green. No destructive deletes.
2. **PR-B: Production config reconciliation** — CORS behavior/docs and any missing tests.
3. **PR-C: Server-authoritative response-healing** — Worker setting reads, client migration, local settings removal.
4. **PR-D: Remove durable routing flags** — durable repo unconditional, `GenerationClient` simplification, env/doc cleanup.
5. **PR-E: Delete local runners** — remove local repository, dispatchers, legacy runner entry points, and tests.
6. **PR-F: Drop navigation abort** — type narrowing and lifecycle hook deletion.
7. **PR-G: Delete permissive pipeline parsers** — parser cleanup, display-helper relocation if needed, prerequisite-edge repair location verified.
8. **PR-H: Final docs/changelog** — durable-only architecture docs and program-end checklist.

## Exit Criteria

- [ ] Phase 3.6 exit gates are complete and tested.
- [ ] All four pipeline kinds run durably in production without local fallback.
- [ ] Close-tab/reopen verification passes for Subject Graph Generation, Topic Content Pipeline, Topic Expansion, and Crystal Trial generation.
- [ ] `LocalGenerationRunRepository` and local runner entry points are deleted.
- [ ] `NEXT_PUBLIC_DURABLE_RUNS` and `NEXT_PUBLIC_DURABLE_RUNS_KINDS` are gone.
- [ ] `ContentGenerationAbortReason` no longer includes `navigation`.
- [ ] No permissive parser is reachable from durable pipeline or backend workflow paths.
- [ ] Worker workflows read server-side response-healing settings instead of hard-coding provider behavior.
- [ ] Security and retention docs match implemented behavior.
- [ ] Boundary tests prevent reintroduction of local orchestration, parser fallback, direct durable `fetch`, untyped backend events, and status-string drift.

## Manual Verification Before Program Close

1. Start each pipeline kind, close the tab before completion, reopen after backend terminal `ready`, and confirm the artifact applies exactly once.
2. Retry a failed run and confirm the retry response returns `{ runId }`, preserves lineage, and streams/apply events correctly.
3. Submit identical input within 24 hours and confirm idempotency dedupes; submit with the same key after 24 hours and confirm a fresh run is created.
4. Confirm daily budget `runs_started` increments once for cache hit, once for cache miss, and once for retry.
5. Toggle response healing in settings, generate a durable run, and confirm workflow metadata records the server-derived `providerHealingRequested` value.
6. Run repository boundary searches: no local runner imports, no durable flags, no `kind: 'navigation'` abort, no permissive parser imports in pipeline/backend paths.

When these checks pass, the Durable Workflow Orchestration program is complete. Supabase Auth implementation, global artifact dedupe, richer observability, and new generation surfaces proceed as follow-on initiatives.
