# Local Workflows Removal Plan

Status: in progress (2026-05-08). PR 1 core, PR 2 runtime intent submission, and PR 3 durable-only routing are implemented. `GenerationClient` no longer imports snapshot builders or `inputHash`, default idempotency keys are UUID-based, and `DurableGenerationRunRepository.submitRun()` posts `{ kind, intent }` without client snapshots/policy fields. `eventBusHandlers`, the command palette trial regeneration path, and HUD retry routing no longer reconstruct frontend snapshots or resolve pipeline models. Frontend bootstrap now requires `NEXT_PUBLIC_DURABLE_GENERATION_URL`, always registers one `DurableGenerationRunRepository`, observes durable runs unconditionally, and no longer parses `NEXT_PUBLIC_DURABLE_RUNS*`. Legacy `RunInput` remains temporarily accepted at the low-level seam until PR 7 local runners are deleted.

## Goal

Move generation to durable-only routing and delete the local-runner/settings legacy seams. The browser should submit compact generation intents, observe durable Worker run events, and read generated learning content from the Learning Content Store. The browser must not construct generation snapshots, choose generation pipeline models, toggle response healing, run in-tab pipelines, or abort generation on navigation.

## Architectural Alignment Assessment

- **Governing pattern:** Repository pattern + durable workflow orchestration. Generation execution is an infrastructure adapter behind the `GenerationClient` interface; generation contracts remain the typed transport/contract module.
- **Seams to deepen:** `GenerationClient` should become the durable submission/observation interface, not a router between local and durable adapters. `RunInput` should be replaced for submissions by intent-only input; backend-expanded `RunSnapshot.snapshotJson` remains read-only observation data.
- **Boundary verification:** Frontend feature/application code may request generation through public content-generation interfaces, but direct remote I/O stays isolated in `DurableGenerationRunRepository` / HTTP adapters. Backend generation policy remains backend-owned.
- **State strategy:** Keep `useContentGenerationStore` as a UI projection of durable runs if needed, but remove `AbortController` ownership. User cancel routes through Worker `POST /v1/runs/:id/cancel`; navigation does nothing.

## Decisions / Questions With Recommended Answers

1. **Should the browser still submit model ids, response-healing state, or OpenRouter pipeline settings?**
   - **Recommended answer:** No. Delete pipeline generation settings from frontend state/UI. Backend `GenerationPolicy` is the only model/healing authority.
   - **Solution:** Remove pipeline surface IDs (`subjectGenerationTopics`, `subjectGenerationEdges`, `topicContent`, `crystalTrial`) from frontend settings; keep only study-explanation inference preferences.

2. **Should the browser still construct snapshots for `submitRun`?**
   - **Recommended answer:** No. Runtime frontend submission should pass intents only. Shared snapshot builders may remain in `src/features/generationContracts` only because the backend imports them through `backend/src/contracts/generationContracts.ts`.
   - **Solution:** Replace frontend `RunInput` submission with a `GenerationRunIntent` union; add a boundary test forbidding frontend runtime imports of snapshot builders and `inputHash` outside shared contracts/tests.

3. **Should Subject Graph Generation intents include frontend-derived `strategyBrief`?**
   - **Recommended answer:** Prefer no: browser sends `checklist`, backend resolves the strategy before building the snapshot. This gives backend full ownership of snapshot expansion. If moving strategy resolution is too large for the first PR, keep `strategyBrief` temporarily but do not include model/policy fields.
   - **Solution:** Target backend `expandSubjectGraphIntent()` to accept checklist-only and derive strategy server-side; delete frontend `prepareSubjectGraphTopicsRunInput()`.

4. **How should idempotency work after removing frontend snapshot hashing?**
   - **Recommended answer:** Use explicit client-generated idempotency keys that do not require snapshots. New user submissions can use `crypto.randomUUID()`-based keys; retries should call the backend retry endpoint instead of reconstructing a new submit body.
   - **Solution:** `DurableGenerationRunRepository.submitRun(intent, idempotencyKey)` sends `{ kind, intent }`. The client facade supplies a UUID key by default and forwards explicit keys only for narrowly intentional dedupe.

5. **Should `NEXT_PUBLIC_DURABLE_RUNS` / per-kind routing remain?**
   - **Recommended answer:** No. Durable is the only path. Keep only the Worker base URL (`NEXT_PUBLIC_DURABLE_GENERATION_URL`) and fail loudly when missing.
   - **Solution:** Delete `durableRuns`, `durableKinds`, `localRepo`, `unreachableDurableRepo`, and `isDurableRunsEnabled()`; `ensureGenerationClientRegistered()` always creates `DurableGenerationRunRepository` from a non-empty Worker URL.

6. **Should the HUD/store keep abort controllers?**
   - **Recommended answer:** No. Abort controllers were local-runner implementation state. Preserve explicit user cancel via durable run cancel.
   - **Solution:** Remove `abortControllers`, `pipelineAbortControllers`, `ContentGenerationAbortReason`, `useContentGenerationLifecycle`, and beforeunload cancellation. Update HUD cancel buttons to call `GenerationClient.cancel(runId, 'user')` against durable run ids.

7. **Should local pipeline modules be deleted in the same wave?**
   - **Recommended answer:** Yes, after intent-only submission and durable run projection are in place. App is unreleased, so no compatibility shim is needed.
   - **Solution:** Delete `LocalGenerationRunRepository`, local artifact capture, `runContentGenerationJob`, topic pipeline runner, expansion runner, crystal-trial generator, subject-generation orchestrator, and their tests/import exports.

## Current Codebase Findings

### Durable/local routing seams status

- `src/features/contentGeneration/generationClient.ts`
  - Durable-only facade now delegates to one repository and no longer supports `flags.durableRuns`, per-kind routing, `localRepo`, or `durableRepo` selection.
- `src/infrastructure/wireGenerationClient.ts`
  - Durable-only bootstrap now requires `NEXT_PUBLIC_DURABLE_GENERATION_URL`, constructs one `DurableGenerationRunRepository`, and always observes run events.
- `src/infrastructure/deckRepositoryFactory.ts`
  - Selects backend reads whenever the Worker URL is configured; no durable flag gate remains.
- `src/infrastructure/repositories/LocalGenerationRunRepository.ts`
  - Still exists as a deletion target and wraps all four in-tab runners, but is no longer constructed by runtime durable bootstrap.
- `src/infrastructure/repositories/localGenerationRunArtifactCapture.ts`
  - Still exists only for the local adapter deletion wave.

### Frontend snapshot/model/healing construction to remove

- `src/features/contentGeneration/prepareGenerationRunSubmit.ts`
  - Builds all frontend generation snapshots and accepts `modelId`, `capturedAt`, `enableReasoning`.
- `src/infrastructure/eventBusHandlers.ts`
  - Calls `resolveModelForSurface()` for pipeline generation and passes model ids into `prepare*RunInput()`.
- `src/features/contentGeneration/retryContentGeneration.ts`
  - Reconstructs snapshots/model ids for retries instead of calling durable retry.
- `src/store/studySettingsStore.ts`, `src/types/llmInference.ts`, `src/components/settings/GlobalSettingsSheet.tsx`, `src/infrastructure/llmInferenceSurfaceProviders.ts`
  - Persist and expose pipeline model/provider/response-healing settings.

### Local-runner execution modules to delete after callers move

- `src/features/contentGeneration/runContentGenerationJob.ts`
- `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts`
- `src/features/contentGeneration/jobs/runExpansionJob.ts`
- `src/features/crystalTrial/generateTrialQuestions.ts`
- `src/features/subjectGeneration/orchestrator/*`
- Frontend prompt/parsing modules under `src/features/contentGeneration/messages/**`, `src/features/contentGeneration/parsers/**`, and subject-generation local permissive prompt/parser modules once no runtime imports remain.

### Navigation abort to remove

- `src/hooks/useContentGenerationLifecycle.ts`
- `src/types/contentGenerationAbort.ts`
- `abortControllers` / `pipelineAbortControllers` in `src/features/contentGeneration/contentGenerationStore.ts`
- `app/page.tsx` call to `useContentGenerationLifecycle()`

## Implementation Plan

### PR 1 — Introduce intent-only frontend submission interface

**Status (2026-05-08): complete for the central client/durable adapter seam; follow-up guard tests still recommended.**

Completed:
- Added `GenerationRunIntent` / `SubmitGenerationRunInput` in `src/types/repository.ts`.
- Changed `GenerationClient.start*()` to accept compact intents and generate `crypto.randomUUID()` idempotency keys when none are supplied.
- Removed generation snapshot builders and `inputHash` imports from `src/features/contentGeneration/generationClient.ts`.
- Changed `DurableGenerationRunRepository.submitRun()` to post `{ kind, intent }`; direct intent inputs are forwarded without snapshots or model/policy fields.
- Updated `generationClient` unit tests for intent-only submission and UUID idempotency.

Still pending under later PRs:
- Convert runtime callers away from `prepare*RunInput()` so the low-level `submitRun()` no longer needs the temporary `RunInput` compatibility path.
- Add a repository boundary guard forbidding frontend runtime imports of snapshot builders / `inputHash` outside shared contracts/tests.

**Files:**
- `src/types/repository.ts`
- `src/features/contentGeneration/generationClient.ts`
- `src/infrastructure/repositories/DurableGenerationRunRepository.ts`
- `src/features/contentGeneration/generationClient.test.ts`
- `src/infrastructure/repositories/DurableGenerationRunRepository.test.ts` if present / add if absent

**Steps:**
1. Add a submit union such as `GenerationRunIntent` / `SubmitGenerationRunInput`:
   - `topic-content`: `{ kind: 'topic-content'; subjectId; topicId; stage: 'theory' | 'study-cards' | 'mini-games' | 'full'; miniGameType? }`
   - `topic-expansion`: `{ kind: 'topic-expansion'; subjectId; topicId; nextLevel: 1 | 2 | 3 }`
   - `subject-graph`: `{ kind: 'subject-graph'; subjectId; stage: 'topics' | 'edges'; checklist?; latticeArtifactContentHash? }`
   - `crystal-trial`: `{ kind: 'crystal-trial'; subjectId; topicId; currentLevel; targetLevel? }`
2. Keep `RunSnapshot.snapshotJson` as backend-observation data, but remove `snapshot` from frontend submit types.
3. Change `GenerationClient.submitRun()` / `start*()` to accept intent-only inputs and generate a UUID idempotency key when one is not supplied.
4. Change `DurableGenerationRunRepository.submitRun()` to send `{ kind, intent }` directly. Delete `runInputToSubmitIntent()` snapshot reads.
5. Update tests to assert no client-built snapshot or policy fields are posted.

**Exit checks:**
- `generationClient.ts` has no imports of snapshot builders or `inputHash`.
- `DurableGenerationRunRepository.submitRun()` body contains only `{ kind, intent }`.

### PR 2 — Convert generation entry paths to submit intents

**Status (2026-05-08): complete for runtime entry paths; deletion of the unused snapshot-builder module is deferred until local runner deletion.**

Completed:
- Replaced runtime `prepare*RunInput()` usage in `src/infrastructure/eventBusHandlers.ts` with direct `GenerationRunIntent` submissions through `startTopicContent()`, `startTopicExpansion()`, `startSubjectGraph()`, and `startCrystalTrial()`.
- Removed pipeline `resolveModelForSurface()` / `resolveEnableReasoningForSurface()` calls from those generation entry paths.
- Changed `src/components/AbyssCommandPalette.tsx` crystal-trial regeneration to submit a crystal-trial intent.
- Changed `retryContentGeneration.ts` to call `GenerationClient.retry(runId, { stage?, jobId? })` instead of rebuilding snapshots/model ids.
- Adapted durable run observation to accept intent inputs while preserving the temporary legacy `RunInput` path for local runner compatibility.
- Removed `prepare*RunInput` exports from the content-generation public API and added `intentSubmissionBoundary.test.ts` to guard against runtime imports of frontend snapshot submit builders / input hashing.

Still pending under later PRs:
- Delete `prepareGenerationRunSubmit.ts` after local runner modules and their tests are removed.
- Project durable run ids explicitly into HUD job/pipeline state (PR 4); retry currently uses `metadata.runId`, `pipelineId`, or standalone job id according to the durable projection available.

**Files:**
- `src/infrastructure/eventBusHandlers.ts`
- `src/features/contentGeneration/retryContentGeneration.ts`
- `src/components/AbyssCommandPalette.tsx`
- `src/features/contentGeneration/index.ts`
- delete `src/features/contentGeneration/prepareGenerationRunSubmit.ts` once unused

**Steps:**
1. Replace `prepareTopicContentRunInput()` calls with direct intent submission:
   - event `topic-content:generation-requested` → `{ kind: 'topic-content', subjectId, topicId, stage }`.
2. Replace subject generation submission:
   - preferred: send `{ kind: 'subject-graph', subjectId, stage: 'topics', checklist }` and update backend to derive strategy;
   - temporary if needed: include `strategyBrief`, but no model/policy fields.
3. Replace topic expansion submission with `{ kind: 'topic-expansion', subjectId, topicId, nextLevel }`.
4. Replace crystal trial submissions with `{ kind: 'crystal-trial', subjectId, topicId, currentLevel, targetLevel? }`.
5. Replace manual retry reconstruction in `retryContentGeneration.ts` with `getGenerationClient().retry(runId, { stage?, jobId? })`. If current UI state does not retain `runId`, add it to durable run projection before this PR lands.
6. Remove pipeline `resolveModelForSurface()` and `resolveEnableReasoningForSurface()` calls from generation entry paths.

**Exit checks:**
- No `prepare*RunInput` exports remain from `src/features/contentGeneration/index.ts`.
- Runtime generation entry paths no longer import `prepareGenerationRunSubmit` or `inputHash`; `intentSubmissionBoundary.test.ts` enforces this.
- No `resolveModelForSurface('topicContent' | 'crystalTrial' | 'subjectGenerationTopics' | 'subjectGenerationEdges')` remains in runtime entry paths. Remaining hits are local runner modules scheduled for PR 7 deletion.

### PR 3 — Make durable routing unconditional

**Status (2026-05-08): complete for runtime routing and hydration.**

Completed:
- Removed `NEXT_PUBLIC_DURABLE_RUNS` / `NEXT_PUBLIC_DURABLE_RUNS_KINDS` parsing from frontend runtime and build env export configuration.
- Removed `LocalGenerationRunRepository` construction and per-kind routing from `wireGenerationClient.ts`.
- `ensureGenerationClientRegistered()` now throws a descriptive bootstrap error when `NEXT_PUBLIC_DURABLE_GENERATION_URL` is absent.
- `GenerationClient` now delegates all submit/observe/cancel/retry/list/artifact methods to a single durable repository.
- `observeGenerationRun()` and `useContentGenerationHydration()` always use durable observation/hydration.
- Deck read selection now uses the backend repository whenever the durable Worker URL is configured.

Still pending under later PRs:
- Delete local runner modules/tests and remove the temporary low-level `RunInput` compatibility path (PR 7).
- Project durable run ids explicitly into HUD/store state before deleting abort controller fields (PR 4/5).

**Files:**
- `src/infrastructure/wireGenerationClient.ts`
- `src/infrastructure/deckRepositoryFactory.ts`
- `config/next-public-env.mjs`
- `src/hooks/useContentGenerationHydration.ts`
- tests referencing durable flags

**Steps:**
1. Delete `NEXT_PUBLIC_DURABLE_RUNS` and `NEXT_PUBLIC_DURABLE_RUNS_KINDS` parsing.
2. Remove `LocalGenerationRunRepository` construction from `wireGenerationClient.ts`.
3. Require non-empty `NEXT_PUBLIC_DURABLE_GENERATION_URL` at bootstrap. Throw a descriptive error at the composition root if missing.
4. Register one `GenerationClient` backed by one `DurableGenerationRunRepository`.
5. Make `observeGenerationRun()` always observe; remove flag no-op.
6. Make `useContentGenerationHydration()` always fetch durable active/recent runs; remove `isDurableRunsEnabled()`.
7. Make deck reads backend-authoritative when a Worker URL is configured; if local IndexedDB remains for bundled/manual content, ensure generated content paths cannot select it.
8. Remove `NEXT_PUBLIC_DURABLE_RUNS` from `config/next-public-env.mjs`.

**Exit checks:**
- `rg "NEXT_PUBLIC_DURABLE_RUNS|durableKinds|durableRunsEnabled|isDurableRunsEnabled" src config tests` returns no runtime references.
- App bootstrap cannot silently fall back to local generation.

### PR 4 — Project durable runs into HUD/store state

**Recommended next task:** durable routing is now unconditional, so the next dependency is making the HUD/store a durable run projection with explicit `runId` fields before removing navigation abort and local-runner execution files.

**Files:**
- `src/features/contentGeneration/contentGenerationStore.ts`
- `src/infrastructure/generationRunEventHandlers.ts`
- `src/hooks/useContentGenerationHydration.ts`
- `src/components/GenerationProgressHud.tsx`
- `src/types/contentGeneration.ts`

**Steps:**
1. Add a pure mapper from `RunSnapshot.jobs` / `RunEvent`s to existing `ContentGenerationJob` and `ContentGenerationPipeline` UI shapes.
2. Store `runId` on jobs/pipelines so retry and cancel can call durable endpoints.
3. Remove `AbortController` fields from store state.
4. Replace `abortJob` / `abortPipeline` with either:
   - UI-level calls to `getGenerationClient().cancel(runId, 'user')`, or
   - store actions that only update local optimistic UI state and are invoked after the composition root performs remote cancel.
5. Keep terminal failure attention and persisted durable cursor behavior, but stop writing local generation logs as authoritative state. Prefer hydrating recent runs from Worker.
6. Update HUD retry buttons to call durable retry using `runId` and optional `jobId` / stage.

**Exit checks:**
- HUD still shows active durable runs after refresh.
- Cancel button calls Worker cancel, not `AbortController.abort()`.

### PR 5 — Remove navigation abort

**Files:**
- `src/hooks/useContentGenerationLifecycle.ts`
- `app/page.tsx`
- `src/types/contentGenerationAbort.ts`
- `src/features/contentGeneration/contentGenerationStore.ts`
- `src/components/GenerationProgressHud.tsx`

**Steps:**
1. Delete `useContentGenerationLifecycle.ts`.
2. Remove `useContentGenerationLifecycle()` from `app/page.tsx`.
3. Delete `ContentGenerationAbortReason` if no non-local runner uses it.
4. Remove failure-debug special casing for navigation abort.

**Exit checks:**
- `rg "kind: 'navigation'|beforeunload|ContentGenerationAbortReason|abortControllers|pipelineAbortControllers" src app tests` has no local-generation references.

### PR 6 — Remove frontend pipeline model/provider/healing settings

**Files:**
- `src/types/llmInference.ts`
- `src/store/studySettingsStore.ts`
- `src/components/settings/GlobalSettingsSheet.tsx`
- `src/infrastructure/llmInferenceSurfaceProviders.ts`
- `src/infrastructure/llmInferenceRegistry.ts`
- settings tests

**Steps:**
1. Narrow `InferenceSurfaceId` to study-only surfaces: `studyQuestionExplain`, `studyFormulaExplain`.
2. Delete `PIPELINE_INFERENCE_SURFACE_IDS`, pipeline surface labels, and provider rows for generation pipelines.
3. Delete `openRouterResponseHealing` and associated actions/storage migration code.
4. Delete pipeline config validation (`validatePipelineSurfaceConfig`, `assertPipelineSurfaceConfigValid`) from frontend infrastructure.
5. Keep study explain model/provider settings only if still used by study-explain hooks.
6. Remove OpenRouter structured-output helper usage from frontend pipeline paths; backend owns strict response format and healing.

**Exit checks:**
- Global Settings has no generation model/healing controls.
- `rg "openRouterResponseHealing|subjectGenerationTopics|subjectGenerationEdges|topicContent|crystalTrial" src/store src/components/settings src/infrastructure/llmInferenceSurfaceProviders.ts src/types/llmInference.ts` returns no pipeline setting references.

### PR 7 — Delete local runner modules and prompt/parser legacy

**Files to delete/refactor:**
- `src/infrastructure/repositories/LocalGenerationRunRepository.ts`
- `src/infrastructure/repositories/localGenerationRunArtifactCapture.ts`
- `src/infrastructure/repositories/LocalGenerationRunRepository.test.ts`
- `src/features/contentGeneration/runContentGenerationJob.ts`
- `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts`
- `src/features/contentGeneration/jobs/runExpansionJob.ts`
- `src/features/crystalTrial/generateTrialQuestions.ts`
- `src/features/subjectGeneration/orchestrator/*`
- local-runner tests and exports from feature barrels
- frontend-only pipeline messages/parsers once imports are gone

**Steps:**
1. Delete the local adapter and artifact capture files.
2. Delete local execution modules and update `index.ts` barrels.
3. Delete tests whose only subject is local execution behavior.
4. Keep domain-only modules that are still used outside execution (for example strategy resolution if backend or UI still needs it).
5. Convert `legacyRunnerBoundary.test.ts` into a deletion guard that asserts the files/imports do not exist.
6. Add a repository-wide guard forbidding imports of local runner entry points and frontend permissive pipeline parsers from runtime code.

**Exit checks:**
- `rg "LocalGenerationRunRepository|runContentGenerationJob|runTopicGenerationPipeline|runExpansionJob|generateTrialQuestions|createSubjectGenerationOrchestrator" src` has no runtime hits.
- No local runner files exist.

### PR 8 — Backend intent cleanup for subject strategy ownership

**Files:**
- `backend/src/runIntents/runIntentExpansion.ts`
- backend run-intent tests
- shared/domain strategy module location if moved

**Steps:**
1. Change subject graph topics intent validation to require only `subjectId`, `stage: 'topics'`, and `checklist`.
2. Move or duplicate `resolveStrategy(checklist)` into a backend-owned module, or promote strategy resolution to a shared pure contract module with no frontend/runtime dependencies.
3. Reject `strategyBrief` from client intents if backend owns it fully.
4. Keep the existing forbidden policy field checks.

**Exit checks:**
- Browser subject generation intent contains no snapshot-like strategy fields unless explicitly retained by decision.
- Backend tests prove checklist-only intent expands to the same snapshot shape.

### PR 9 — Documentation and drift guards

**Files:**
- `CONTEXT.md` if terminology changes
- `docs/security/threat-model.md`
- `plans/phase4.md`
- `CHANGELOG.md`
- boundary tests

**Steps:**
1. Document durable-only generation and backend Learning Content Store authority.
2. Document that browser generation settings affect only study explanation, not pipelines.
3. Add/keep guards:
   - no `NEXT_PUBLIC_DURABLE_RUNS*` references;
   - no frontend runtime snapshot builder imports;
   - no frontend pipeline model/healing settings;
   - no local runner files/imports;
   - no navigation abort reason;
   - `POST /v1/runs` rejects snapshots and policy fields.

## Verification Plan

Run after each PR or logical batch:

```bash
pnpm test:unit:run
pnpm test:eval
pnpm check:compile
pnpm test:e2e:smoke
```

Manual durable checks after PR 3+:

1. Start Next with `NEXT_PUBLIC_DURABLE_GENERATION_URL` configured and no `NEXT_PUBLIC_DURABLE_RUNS` variables.
2. Submit Subject Graph Generation; close/reopen tab; verify run continues and a Published Subject appears from backend reads.
3. Generate Topic Content; verify topic content status transitions from backend Learning Content Store reads.
4. Trigger Topic Expansion through crystal level-up; verify supersession still cancels older expansion via Worker.
5. Trigger Crystal Trial pregeneration; close/reopen tab; verify trial availability comes from backend-applied artifact.
6. Use HUD cancel; verify Worker run receives `cancel_requested_at` and emits `run.cancelled`.

## Compliance, Risk & Drift Assessment

- **Misalignment check:** No contradictions with `AGENTS.md` found. The plan reinforces backend-owned repository seams and removes local tactical fallbacks.
- **Architectural risk:** High while replacing `RunInput` because many modules currently derive UI labels/stages from snapshots. Mitigation: introduce intent submission and durable projection first, then delete local runners.
- **Prompt drift prevention:** Do not add compatibility shims that parse both snapshots and intents in the browser. The only accepted browser submission shape should be intent-only; any snapshot/policy fields should fail at the Worker boundary.
