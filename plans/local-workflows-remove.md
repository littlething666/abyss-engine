# Local Workflows Removal Plan

Status: in progress (2026-05-09). PR 1 core, PR 2 runtime intent submission, PR 3 durable-only routing, PR 4 HUD/UI removal, the first PR 5 durable-observation cutovers, PR 6 browser settings removal, PR 7 local-runner/log-store deletion, and PR 8 backend Subject Graph strategy ownership are implemented. `GenerationClient` no longer imports snapshot builders or `inputHash`, default idempotency keys are UUID-based, and `DurableGenerationRunRepository.submitRun()` posts `{ kind, intent }` without client snapshots/policy fields. `eventBusHandlers`, the command palette trial regeneration path, and runtime generation entry paths no longer reconstruct frontend snapshots or resolve pipeline models. Frontend bootstrap now requires `NEXT_PUBLIC_DURABLE_GENERATION_URL`, always registers one `DurableGenerationRunRepository`, observes durable runs unconditionally, and no longer parses `NEXT_PUBLIC_DURABLE_RUNS*`. The `GenerationProgressHud`, its app mount, its quick action, generation-progress `uiStore` state/actions, navigation-abort lifecycle hook, store-backed topic-status/mentor UI reads, frontend generation log repository/store, HUD retry routing, local in-tab generation runners, frontend artifact appliers, local artifact capture, and legacy `RunInput` submit compatibility have been removed. Durable run observation no longer fetches artifacts or invokes frontend topic-content/topic-expansion/crystal-trial appliers; terminal durable events now publish query invalidations for backend-owned Learning Content Store reads. Subject Graph Generation topic-stage intents now carry checklist-only browser input; the Worker rejects client `strategyBrief` and derives the canonical strategy brief server-side before snapshot expansion. `useContentGenerationHydration()` now skips browser generation-log hydration and reattaches durable observation using compact intents derived from Worker run snapshots, failing loudly on malformed Worker snapshot contracts instead of rebuilding frontend `RunInput`. Browser Global Settings now exposes only study explanation model/provider bindings; generation pipeline model selection and `openRouterResponseHealing` local state are removed, and pipeline surfaces fail loudly if legacy code tries to resolve them through study settings. 2026-05-09 review update: the remaining work is Crystal Trial backend-resolved read consumption, cleanup of shared artifact-applier contracts/prompt-parser remnants where no backend import requires them, and final documentation/drift guards (PR 9).

## Goal

Move generation to durable-only routing and delete the local-runner/settings/HUD legacy seams. The browser should submit compact generation intents, observe durable Worker run events only to refresh consumer state and route product notifications, and read generated learning content from the Learning Content Store. The browser must not construct generation snapshots, choose generation pipeline models, toggle response healing, run in-tab pipelines, maintain a generation progress/log HUD, persist generation logs in IndexedDB, locally apply generated artifacts, or abort generation on navigation.

## Architectural Alignment Assessment

- **Governing pattern:** Repository pattern + durable workflow orchestration. Generation execution is an infrastructure adapter behind the `GenerationClient` interface; generation contracts remain the typed transport/contract module.
- **Seams to deepen:** `GenerationClient` should become the durable submission/observation interface, not a router between local and durable adapters. `RunInput` should be replaced for submissions by intent-only input; backend-expanded `RunSnapshot.snapshotJson` remains read-only observation data for backend run consumers, not a frontend progress-store input.
- **Boundary verification:** Frontend feature/application code may request generation through public content-generation interfaces, but direct remote I/O stays isolated in `DurableGenerationRunRepository` / HTTP adapters. Backend generation policy, run state, run logs, artifact application, and generated-content persistence remain backend-owned.
- **State strategy:** Delete `useContentGenerationStore` as a runtime projection after local runners are removed. Any player-facing content readiness must come from Learning Content Store queries (`Topic Content Status`, Subject Graph reads, Crystal Trial read endpoints), while backend run logs remain behind Worker run/debug endpoints. User cancel/retry controls leave the frontend HUD surface; if a future product surface needs them, it must be a backend-run consumer rather than resurrecting local generation state.

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
   - **Recommended answer:** No. Abort controllers were local-runner implementation state, and the HUD/store should be deleted rather than migrated.
   - **Solution:** Remove `abortControllers`, `pipelineAbortControllers`, `ContentGenerationAbortReason`, `useContentGenerationLifecycle`, and beforeunload cancellation. Durable cancel remains available at the Worker/API seam and in backend tests; do not keep a frontend HUD cancel surface.

7. **Should local pipeline modules be deleted in the same wave?**
   - **Recommended answer:** Yes, after intent-only submission and durable content refresh are in place. App is unreleased, so no compatibility shim is needed.
   - **Solution:** Delete `LocalGenerationRunRepository`, local artifact capture, `runContentGenerationJob`, topic pipeline runner, expansion runner, crystal-trial generator, subject-generation orchestrator, and their tests/import exports.

8. **Should `GenerationProgressHud` be migrated to durable runs or deleted?**
   - **Recommended answer:** Delete it. Runs and their diagnostic logs are backend-owned; the browser should not keep a second run-log interface with retry/cancel semantics.
   - **Solution:** Remove `src/components/GenerationProgressHud.tsx`, its app mount, the quick-action menu entry, `uiStore` generation-progress state/actions, HUD retry/cancel wiring, and tests/copy that point players to the HUD.

9. **Should the frontend keep `contentGenerationLogRepository` / `useContentGenerationStore` as a read-cache for backend runs?**
   - **Recommended answer:** No. A frontend IndexedDB run-log read-cache duplicates backend run state and normalizes drift. Keep only temporary compile support for local-runner deletion sequencing, then delete it.
   - **Solution:** Remove `loadPersistedLogs()` hydration, terminal job persistence, `MAX_PERSISTED_LOGS`, `ContentGenerationJob` / `ContentGenerationPipeline` UI-history state, `generationAttentionSurface`, and retry-routing collapse state once local runners are gone.

10. **Should the frontend still locally apply durable artifacts?**
   - **Recommended answer:** No. Backend workflows already call `applyArtifactToLearningContent()` / `publishCompleteSubjectGraphToLearningContent()` and publish complete generated content through Learning Content Store reads.
   - **Solution:** Refactor `generationRunEventHandlers` into a content-refresh consumer: on terminal durable events, invalidate/refetch Learning Content Store queries and emit mentor/telemetry events; do not fetch artifacts or call frontend appliers for Topic Content, Topic Expansion, Subject Graph, or Crystal Trial.

11. **How should topic content readiness show generation-in-progress after deleting store-backed active jobs?**
   - **Recommended answer:** Use backend Learning Content Store `Topic Content Status`. Do not synthesize `generating` from local job state.
   - **Solution:** Remove `useContentGenerationStore` from `useTopicContentStatusMap`, `TopicSelectionBar`, `TopicDetailsPopup`, and `DiscoveryModal`; rely on backend `topic_details.status` (`generating` / `ready` / `unavailable`) and query invalidation after submission and terminal events.

12. **How should Crystal Trial pregeneration be consumed after deleting the frontend applier?**
   - **Recommended answer:** Delegate generated question-set storage and lookup to the backend Learning Content Store. The frontend may keep player attempt/cooldown UI state, but generated trial questions should be read from a backend endpoint.
   - **Solution:** Add a frontend repository/hook for backend Crystal Trial sets or change the backend endpoint to resolve the current card-pool hash server-side. Delete `createCrystalTrialApplier()` and local generated-question writes after the read path exists.

13. **Where do failure diagnostics and retry live after HUD deletion?**
   - **Recommended answer:** Backend run/debug endpoints own diagnostics. Product retry should be a domain action (request generation again) or a future backend Run History/admin surface, not `GenerationProgressHud`.
   - **Solution:** Update mentor copy/actions that mention “generation HUD”; remove HUD retry buttons and `retryContentGeneration.ts`; if retry is retained, expose it through a backend-run consumer with explicit run ids and no frontend log reconstruction.

14. **Should Crystal Trial card-pool invalidation/regeneration remain frontend-owned?**
   - **Recommended answer:** No for generated question-set validity. Backend should own the current card-pool hash and serve the matching Crystal Trial set, so stale frontend persisted questions cannot survive Topic Content or Topic Expansion changes.
   - **Solution:** Prefer a backend endpoint that resolves the current card-pool hash for `{ subjectId, topicId, targetLevel }` and returns either the matching trial set or an explicit not-found/stale status. Keep frontend-triggered pregeneration requests only as a product intent; do not keep frontend card-pool hash writes or generated-question persistence.

## Current Codebase Findings

### Durable/local routing seams status

- `src/features/contentGeneration/generationClient.ts`
  - Durable-only facade now delegates to one repository and no longer supports `flags.durableRuns`, per-kind routing, `localRepo`, or `durableRepo` selection.
- `src/infrastructure/wireGenerationClient.ts`
  - Durable-only bootstrap now requires `NEXT_PUBLIC_DURABLE_GENERATION_URL`, constructs one `DurableGenerationRunRepository`, and always observes run events.
- `src/infrastructure/deckRepositoryFactory.ts`
  - Selects backend reads whenever the Worker URL is configured; no durable flag gate remains.
- `src/infrastructure/repositories/LocalGenerationRunRepository.ts` and `src/infrastructure/repositories/localGenerationRunArtifactCapture.ts`
  - Deleted in PR 7; runtime bootstrap has no local adapter path.

### Frontend snapshot/model/healing leftovers to remove

- `src/features/contentGeneration/prepareGenerationRunSubmit.ts` and `src/features/contentGeneration/retryContentGeneration.ts`
  - Deleted in PR 7 with the legacy `RunInput` and HUD/job-shape retry seams.
- `src/store/studySettingsStore.ts`, `src/types/llmInference.ts`, `src/components/settings/GlobalSettingsSheet.tsx`, `src/infrastructure/llmInferenceSurfaceProviders.ts`
  - Persist and expose pipeline model/provider/response-healing settings.

### Local-runner execution modules to delete after callers move

- `src/features/contentGeneration/runContentGenerationJob.ts`, `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts`, `src/features/contentGeneration/jobs/runExpansionJob.ts`, `src/features/crystalTrial/generateTrialQuestions.ts`, and `src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.ts`
  - Deleted in PR 7.
- Frontend prompt/parsing modules under `src/features/contentGeneration/messages/**`, `src/features/contentGeneration/parsers/**`, and subject-generation local permissive prompt/parser modules remain as cleanup candidates once confirmed unused by backend/shared tests.

### Frontend HUD/log/store surfaces to remove

- `src/components/GenerationProgressHud.tsx`
  - Still mounted in `app/page.tsx` and reachable from the quick-action “Background generation” menu.
  - Owns cancel/retry controls, raw prompt/output display, and frontend history presentation.
- `src/store/uiStore.ts`
  - Still owns `isGenerationProgressOpen`, `openGenerationProgress()`, `closeGenerationProgress()`, and `setGenerationProgressOpen()`.
- `src/features/contentGeneration/contentGenerationStore.ts`, `src/infrastructure/repositories/contentGenerationLogRepository.ts`, `src/features/contentGeneration/retryContentGeneration.ts`, and `src/features/contentGeneration/generationAttentionSurface.ts`
  - Deleted in PR 7; mentor and topic readiness runtime paths no longer read frontend generation job state.

### Frontend content-readiness/local-application seams to remove

- `src/hooks/useTopicContentStatusMap.ts`
  - Still overlays backend `Topic Content Status` with active local generation jobs. After HUD/store deletion, `generating` must come only from backend Learning Content Store rows.
- `src/components/TopicSelectionBar.tsx`, `src/components/TopicDetailsPopup.tsx`, `src/components/DiscoveryModal.tsx`
  - Still import `useContentGenerationStore` / `activeTopicContentGenerationLabel` for local progress labels and sorting.
- `src/infrastructure/generationRunEventHandlers.ts`
  - No longer fetches durable artifacts or locally applies Topic Content, Topic Expansion, or Crystal Trial artifacts. It now consumes terminal durable events as query-invalidation/publication signals for backend Learning Content Store reads, while still emitting legacy product notifications for mentor/telemetry paths.
- `src/features/contentGeneration/appliers/*`, `src/features/crystalTrial/appliers/crystalTrialApplier.ts`, and `src/infrastructure/repositories/appliedArtifactsStore.ts`
  - Deleted in PR 7. Durable SSE cursor persistence now lives in the narrow `src/infrastructure/repositories/runEventCursorStore.ts`.
- `src/features/crystalTrial/crystalTrialStore.ts`
  - Still stores generated trial questions client-side. Backend already persists `crystal_trial_sets`; frontend should read generated question sets from the Learning Content Store and keep only player attempt/cooldown state locally if needed.

### Navigation abort to remove

- `src/hooks/useContentGenerationLifecycle.ts`, `src/types/contentGenerationAbort.ts`, and `abortControllers` / `pipelineAbortControllers` in `src/features/contentGeneration/contentGenerationStore.ts`
  - Deleted; `app/page.tsx` has no generation navigation-abort lifecycle.

## Implementation Plan

### PR 1 — Introduce intent-only frontend submission interface

**Status (2026-05-09): complete for the central client/durable adapter seam and legacy submit compatibility removal.**

Completed:
- Added `GenerationRunIntent` / `SubmitGenerationRunInput` in `src/types/repository.ts`.
- Changed `GenerationClient.start*()` to accept compact intents and generate `crypto.randomUUID()` idempotency keys when none are supplied.
- Removed generation snapshot builders and `inputHash` imports from `src/features/contentGeneration/generationClient.ts`.
- Changed `DurableGenerationRunRepository.submitRun()` to post `{ kind, intent }`; direct intent inputs are forwarded without snapshots or model/policy fields.
- Updated `generationClient` unit tests for intent-only submission and UUID idempotency.

Still pending under later PRs:
- Add/keep final repository boundary guards forbidding frontend runtime imports of snapshot builders / `inputHash` outside shared contracts/tests.

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

**Status (2026-05-09): complete for runtime entry paths and deferred snapshot-submit module deletion.**

Completed:
- Replaced runtime `prepare*RunInput()` usage in `src/infrastructure/eventBusHandlers.ts` with direct `GenerationRunIntent` submissions through `startTopicContent()`, `startTopicExpansion()`, `startSubjectGraph()`, and `startCrystalTrial()`.
- Removed pipeline `resolveModelForSurface()` / `resolveEnableReasoningForSurface()` calls from those generation entry paths.
- Changed `src/components/AbyssCommandPalette.tsx` crystal-trial regeneration to submit a crystal-trial intent.
- Deleted `retryContentGeneration.ts` with HUD/job-shape retry routing in PR 7.
- Durable run observation accepts intent inputs only; the temporary legacy `RunInput` path was removed in PR 7.
- Removed `prepare*RunInput` exports from the content-generation public API and added `intentSubmissionBoundary.test.ts` to guard against runtime imports of frontend snapshot submit builders / input hashing.
- Deleted `prepareGenerationRunSubmit.ts` in PR 7.

Still pending under later PRs:
- If backend retry becomes product-facing later, expose it through a backend-run consumer, not `ContentGenerationJob` UI shapes.

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
5. Replace manual retry reconstruction in `retryContentGeneration.ts` with backend retry only as a short-lived bridge; PR 4/7 delete HUD retry paths and `retryContentGeneration.ts` rather than adding durable run projection state.
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
- None for routing; PR 7 deleted local runner modules/tests and removed the temporary low-level `RunInput` compatibility path.

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

### PR 4 — Remove GenerationProgressHud and frontend generation-log UI

**Status (2026-05-08): complete for runtime HUD/UI removal.**

Completed:
- Deleted `src/components/GenerationProgressHud.tsx`, removed its `app/page.tsx` mount, and removed the “Background generation” quick action.
- Removed generation-progress state/actions from `src/store/uiStore.ts` and updated UI-store tests.
- Removed `useContentGenerationLifecycle()` from `app/page.tsx` and deleted the navigation-abort lifecycle hook.
- Removed `useContentGenerationStore` runtime UI reads from `useTopicContentStatusMap`, `TopicSelectionBar`, `TopicDetailsPopup`, `DiscoveryModal`, `useMentorEntryContext`, `MentorBubble`, and `MentorDialogOverlay`.
- Changed topic readiness to use backend Learning Content Store `Topic Content Status` rows only; `generating` is no longer synthesized from local active jobs.
- Removed mentor CTAs/copy that route players to a generation HUD; failure dialogs now dismiss while backend run diagnostics own details/retry.

Still pending under later PRs:
- None for HUD/UI removal; PR 7 deleted `contentGenerationStore`, local runner modules, abort-reason types, retry helpers, and `generationAttentionSurface`.

**Files:**
- `src/components/GenerationProgressHud.tsx` (delete)
- `app/page.tsx`
- `src/store/uiStore.ts`
- `src/components/MentorDialogOverlay.tsx`
- `src/hooks/useMentorEntryContext.ts`
- `src/components/MentorBubble.tsx`
- `src/features/mentor/mentorLines.ts`
- `src/features/mentor/dialogRuleEngine.ts`
- `src/hooks/useTopicContentStatusMap.ts`
- `src/components/TopicSelectionBar.tsx`
- `src/components/TopicDetailsPopup.tsx`
- `src/components/DiscoveryModal.tsx`
- tests that assert generation-progress modal state, HUD retry/cancel controls, or store-backed active-job labels

**Steps:**
1. Delete `GenerationProgressHud.tsx` and remove its mount from `app/page.tsx`.
2. Remove the quick-action “Background generation” entry and its `openGenerationProgress()` handler.
3. Delete `uiStore` generation-progress state/actions and update modal-stack tests.
4. Remove mentor actions/copy that say “open generation HUD” or route failures to the HUD. Keep event-driven mentor failure triggers from `eventBusHandlers.ts`.
5. Remove `useContentGenerationStore` from `useMentorEntryContext`, `MentorBubble`, and `MentorDialogOverlay`; delete or narrow `generationAttentionSurface` tests according to what still has a runtime caller.
6. Remove `useContentGenerationStore` overlays from `useTopicContentStatusMap`, `TopicSelectionBar`, `TopicDetailsPopup`, and `DiscoveryModal`. Topic readiness/progress must come from backend `Topic Content Status` rows and Learning Content Store query invalidation.
7. Remove `useContentGenerationLifecycle()` from `app/page.tsx` and delete `useContentGenerationLifecycle.ts` / `ContentGenerationAbortReason` if no runtime caller remains.

**Exit checks:**
- `rg "GenerationProgressHud|isGenerationProgressOpen|openGenerationProgress|setGenerationProgressOpen|Background generation|generation HUD" src app tests` has no runtime references.
- `rg "useContentGenerationStore" src/components src/hooks app` has no runtime UI references except local-runner/test-only mocks.
- Topic Content Status now shows `generating` only from backend Learning Content Store rows after a topic-content run is submitted.

### PR 5 — Convert durable observation into content-refresh consumption

**Status (2026-05-09): partially complete for the runtime event-observation composition root.**

Completed:
- `generationRunEventHandlers` treats `artifact.ready` as a progress signal only and no longer calls `GenerationClient.getArtifact()` or frontend topic-content/topic-expansion/crystal-trial appliers.
- `wireGenerationClient` no longer constructs frontend generation artifact appliers or passes the artifact dedupe store into durable observation.
- Terminal `run.completed` now publishes content-refresh signals through `PubSubClient`: topic content invalidates details/cards/status/ready reads, topic expansion invalidates cards/status/ready reads, subject graph keeps backend subject publication, and crystal trial invalidates the backend trial read/status keys.
- `useContentGenerationHydration()` no longer imports `contentGenerationLogRepository` or `useContentGenerationStore`; it observes active/recent durable runs with compact intents derived from Worker run snapshots and throws descriptive contract errors for malformed snapshots.
- Updated event-handler and pub/sub tests to assert no frontend artifact fetch/apply path is used.

Remaining follow-ups:
- Add or wire the backend-resolved current Crystal Trial set read path so the new `['content', 'crystal-trial', subjectId, topicId]` invalidation has a canonical frontend consumer.
- Remove shared artifact-applier contract exports if no backend/shared consumer remains after prompt/parser cleanup.

**Files:**
- `src/infrastructure/generationRunEventHandlers.ts`
- `src/infrastructure/wireGenerationClient.ts`
- `src/infrastructure/pubsub.ts`
- `src/hooks/useContentGenerationHydration.ts`
- `src/infrastructure/repositories/appliedArtifactsStore.ts` / cursor store split if needed
- `src/features/contentGeneration/appliers/*`
- `src/features/crystalTrial/appliers/crystalTrialApplier.ts`
- generation-run event handler tests

**Steps:**
1. Stop fetching durable artifacts in `generationRunEventHandlers`. Backend workflows already materialize artifacts into the Learning Content Store. **Done 2026-05-09.**
2. Replace frontend applier calls with explicit content-publication/query-invalidation methods:
   - `topic-content` completion → invalidate topic details, topic cards, and topic statuses for the topic. **Done 2026-05-09.**
   - `topic-expansion` completion → invalidate topic cards and statuses for the topic. **Done 2026-05-09.**
   - `subject-graph` completion → keep `publishBackendSubjectGraph(subjectId)`. **Done.**
   - `crystal-trial` completion → invalidate the backend Crystal Trial read for the topic/target level and trigger trial availability consumption. Prefer backend-resolved current card-pool hash over frontend `setCardPoolHash`. **Invalidation added 2026-05-09; backend-resolved read consumer still pending.**
3. Add/adjust the frontend Learning Content Store consumer for Crystal Trial sets. If the current endpoint requires `cardPoolHash`, either add a backend-resolved “current trial set” endpoint or a narrow repository method that obtains the backend-owned hash before reading questions.
4. Keep durable SSE cursor tracking only if observation still needs resumability; split it from `AppliedArtifactsStore` so an artifact-application dedupe store does not survive as a shallow pass-through. **Done 2026-05-09: `runEventCursorStore.ts` is the only runtime cursor store.**
5. Change `useContentGenerationHydration()` to observe active/recent backend runs without loading `contentGenerationLogRepository` or reconstructing frontend `RunInput` for UI state. If backend `RunSnapshot.snapshotJson` is needed for routing, treat malformed/missing context as a Worker contract violation and throw at the adapter boundary. **Done 2026-05-09.**
6. Update tests so duplicate SSE delivery proves duplicate query invalidation / mentor trigger suppression, not duplicate local artifact application.

**Exit checks:**
- `rg "client.getArtifact|createTopicContentApplier|createTopicExpansionApplier|createCrystalTrialApplier|AppliedArtifactsStore" src/infrastructure src/hooks src/components` has no runtime artifact-application references.
- Durable run completion refreshes backend Learning Content Store queries without writing generated content into IndexedDB or Zustand.
- Subject Graph Generation still publishes only complete subjects through backend reads.

### PR 6 — Remove frontend pipeline model/provider/healing settings

**Status (2026-05-09): complete for runtime browser settings and type-only legacy helper deletion.**

Completed:
- Removed generation pipeline rows from `GlobalSettingsSheet`; the settings sheet now states that generation model/structured-output policy is backend-owned.
- Narrowed persisted `studySettingsStore.surfaceProviders` to study explanation surfaces only and dropped `openRouterResponseHealing` state/actions from the store snapshot.
- Legacy stored pipeline bindings and response-healing values are discarded during settings normalization rather than migrated forward.
- `resolveOpenRouterStructuredChatExtrasForJob()` no longer reads browser response-healing state; the explicit caller option is the only frontend study-surface switch, while backend GenerationPolicy owns durable pipeline healing.
- Legacy pipeline surface resolution through browser study settings now fails loudly with a backend-owned-policy error.

Remaining follow-ups:
- Run the final PR 9 guard after PR 7 so `rg "subjectGenerationTopics|subjectGenerationEdges|topicContent|crystalTrial" src/types/llmInference.ts src/infrastructure/llmInferenceSurfaceProviders.ts` has no settings-policy hits. **Done 2026-05-09.**

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

### PR 7 — Delete local runner modules, frontend log store, and prompt/parser legacy

**Status (2026-05-09): complete for local execution, frontend log/store, retry/HUD support, artifact-applier, and `RunInput` compatibility deletion. Prompt/parser legacy cleanup remains a narrower follow-up because shared generation-contract and backend test seams still reference snapshot/parser terminology.

Completed:
- Deleted `LocalGenerationRunRepository`, local artifact capture, frontend generation-log repository, `useContentGenerationStore`, retry helpers, generation attention surface, local job/pipeline runners, Crystal Trial question generator, Subject Graph local orchestrator, frontend artifact appliers, `src/types/contentGeneration.ts`, and navigation abort reason types.
- Removed local-runner/applier exports from feature public APIs.
- Removed legacy `RunInput` from `src/types/repository.ts`; `SubmitGenerationRunInput` is now `GenerationRunIntent` only.
- Removed legacy snapshot-to-intent conversion from `DurableGenerationRunRepository` and the low-level `GenerationClient` compatibility branch.
- Split durable SSE cursor persistence into `runEventCursorStore.ts`; the artifact-dedupe `AppliedArtifactsStore` runtime table is gone.
- Replaced `legacyRunnerBoundary.test.ts` with a deletion guard that fails if deleted local generation seams or imports return.

Remaining follow-ups:
- Confirm and delete any frontend-only prompt/parser modules not required by backend/shared tests.
- Remove legacy mentor retry-routing trigger/copy if no backend-run retry consumer replaces it.
- Remove or rename stale comments in backend/shared generation-contract docs that refer to local artifacts if those contracts are no longer imported anywhere.

**Files deleted/refactored:**
- `src/infrastructure/repositories/LocalGenerationRunRepository.ts`
- `src/infrastructure/repositories/localGenerationRunArtifactCapture.ts`
- `src/infrastructure/repositories/LocalGenerationRunRepository.test.ts`
- `src/infrastructure/repositories/contentGenerationLogRepository.ts`
- `src/features/contentGeneration/contentGenerationStore.ts`
- `src/features/contentGeneration/retryContentGeneration.ts`
- `src/features/contentGeneration/generationAttentionSurface.ts`
- `src/features/contentGeneration/failureKeys.ts` if no non-HUD caller remains
- `src/types/contentGeneration.ts` if no backend-run consumer still needs the UI job shape
- `src/features/contentGeneration/runContentGenerationJob.ts`
- `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts`
- `src/features/contentGeneration/pipelines/triggerTopicGenerationPipeline.ts` if entry paths submit intents directly instead
- `src/features/contentGeneration/jobs/runExpansionJob.ts`
- `src/features/crystalTrial/generateTrialQuestions.ts`
- `src/features/subjectGeneration/orchestrator/*`
- `src/features/contentGeneration/appliers/*` and `src/features/crystalTrial/appliers/crystalTrialApplier.ts` once PR 5 removes local artifact application
- local-runner/log-store/HUD tests and exports from feature barrels
- frontend-only pipeline messages/parsers once imports are gone

**Steps:**
1. Delete the local adapter, artifact capture, and frontend run-log files. **Done 2026-05-09.**
2. Delete local execution modules and update deliberate `index.ts` exports; do not leave automatic barrels that expose deleted legacy seams. **Done 2026-05-09.**
3. Delete tests whose only subject is local execution, frontend generation logs, HUD retry/cancel, or local artifact application behavior. **Done 2026-05-09.**
4. Keep domain-only modules that are still used outside execution (for example strategy resolution if backend or UI still needs it). **Done: strategy resolution/bindings remain.**
5. Convert `legacyRunnerBoundary.test.ts` into deletion guards that assert local runner files, frontend generation-log files, and frontend artifact appliers do not exist. **Done 2026-05-09.**
6. Add repository-wide guards forbidding imports of local runner entry points, `contentGenerationLogRepository`, `GenerationProgressHud`, frontend permissive pipeline parsers, and frontend generation-store UI job shapes from runtime code. **Partially done for deleted local-runner/log/store/applier seams; parser-specific guard remains a PR 9 follow-up.**

**Exit checks:**
- `rg "LocalGenerationRunRepository|runContentGenerationJob|runTopicGenerationPipeline|runExpansionJob|generateTrialQuestions|createSubjectGenerationOrchestrator|contentGenerationLogRepository|GenerationProgressHud|useContentGenerationStore|retryFailedJob|retryFailedPipeline" src app tests` has no runtime hits.
- No local runner, frontend generation HUD/log, or local artifact applier files exist.

### PR 8 — Backend intent cleanup for subject strategy ownership

**Status (2026-05-09): complete.**

Completed:
- Added a backend-owned Subject Graph strategy resolver used by Worker run-intent expansion.
- Removed the temporary `strategyBrief` field from the frontend `GenerationRunIntent` type.
- Changed Subject Graph topic-stage expansion to accept checklist-only client intents, map the checklist into the canonical snapshot shape, and derive `strategy_brief` on the backend.
- Added tests proving checklist-only expansion and HTTP rejection of client-provided `strategyBrief`.

**Files:**
- `backend/src/runIntents/runIntentExpansion.ts`
- backend run-intent tests
- shared/domain strategy module location if moved

**Steps:**
1. Change subject graph topics intent validation to require only `subjectId`, `stage: 'topics'`, and `checklist`. **Done 2026-05-09.**
2. Move or duplicate `resolveStrategy(checklist)` into a backend-owned module, or promote strategy resolution to a shared pure contract module with no frontend/runtime dependencies. **Done 2026-05-09 via `backend/src/runIntents/subjectGraphStrategy.ts`.**
3. Reject `strategyBrief` from client intents if backend owns it fully. **Done 2026-05-09.**
4. Keep the existing forbidden policy field checks. **Done.**

**Exit checks:**
- Browser subject generation intent contains no snapshot-like strategy fields.
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
   - no `GenerationProgressHud`, frontend generation-log store, or store-backed generation attention surface;
   - no frontend local artifact appliers for backend-generated artifacts;
   - no local runner files/imports;
   - no navigation abort reason;
   - `POST /v1/runs` rejects snapshots and policy fields.

## Verification Plan

Current verification (2026-05-09 PR 7 batch):
- `pnpm check:compile` ✅
- `pnpm test:unit:run` ✅ (191 files, 1743 passed, 1 skipped) before final PR 6 helper cleanup/documentation updates
- Targeted post-cleanup Vitest ✅: `legacyRunnerBoundary`, `llmInferenceRegistry`, `llmInferenceSurfaceProviders`, and `generationRunEventHandlers`

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
5. Trigger Crystal Trial pregeneration; close/reopen tab; verify trial availability/questions come from backend Learning Content Store reads.
6. Verify the app has no Background Generation HUD/quick action and no browser IndexedDB generation-log writes.
7. Use a backend/API-level cancel test for `POST /v1/runs/:id/cancel`; do not reintroduce a frontend HUD cancel surface.

## Compliance, Risk & Drift Assessment

- **Misalignment check:** No contradictions with `AGENTS.md` found. The plan reinforces backend-owned repository seams and removes local tactical fallbacks.
- **Architectural risk:** High while removing frontend generation UI/log state because several product surfaces currently read `useContentGenerationStore` for active labels, mentor attention, retry, and topic status overlays. Mitigation: delete player-facing HUD/logs first, route content readiness through backend Learning Content Store rows, and keep only content-refresh observation of durable runs until local runners are deleted.
- **Prompt drift prevention:** Do not add compatibility shims that parse both snapshots and intents in the browser. Do not replace `GenerationProgressHud` with another frontend run-log cache. The only accepted browser submission shape should be intent-only; any snapshot/policy fields should fail at the Worker boundary.
