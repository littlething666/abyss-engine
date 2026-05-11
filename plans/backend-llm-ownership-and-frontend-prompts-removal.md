# Backend LLM Ownership and Frontend Prompt Removal Plan

Status: in progress, first implementation slice completed, 2026-05-11

## Decisions Applied

Accepted decisions for this plan:

- Delete `src/prompts/**`; do not move frontend prompt templates elsewhere.
- Transfer all LLM request construction and provider calls to `backend/`.
- Do not keep frontend reasoning toggles. Backend policy decides whether reasoning is requested and whether reasoning text is streamed back.
- Do not keep `src/features/subjectGeneration/graph/prereqWiring/prerequisiteEdgeRules.ts` or related tests/code.
- No migration or backward compatibility is required; the app is unreleased.


## Completed in This Patch

- Added backend study LLM contract modules under `backend/src/studyLlm/`:
  - compact request types;
  - backend-owned prompt construction;
  - backend-owned policy for model, temperature, reasoning posture, streaming posture, and prompt version;
  - validation that rejects unknown kinds, empty required strings, and browser-supplied provider/request-shape fields anywhere in the body;
  - normalized SSE event encoding.
- Added `POST /v1/study-llm/stream` in `backend/src/routes/studyLlm.ts` and mounted it from `backend/src/index.ts` under the existing `/v1` API boundary, so the route is behind `X-Abyss-Device` middleware in the Worker app.
- Extended `backend/src/llm/openrouterClient.ts` with a backend-only streaming helper for study explanations. It owns OpenRouter auth headers, model/request shape, reasoning request policy, non-2xx provider classification before browser streaming starts, and normalization of provider content/reasoning deltas.
- Added frontend study LLM seam `src/features/studyPanel/studyLlmClient.ts`, infrastructure adapter `src/infrastructure/repositories/BackendStudyLlmRepository.ts`, and wiring `src/infrastructure/wireStudyLlmClient.ts`. The adapter posts only compact study intent plus `Content-Type` and `X-Abyss-Device` headers to `NEXT_PUBLIC_DURABLE_GENERATION_URL`.
- Rewrote `useStudyQuestionLlmExplain` and `useStudyFormulaLlmExplain` to call the study LLM client with compact intents. The hooks keep pending/abort/error/session-cache behavior and still render backend-streamed reasoning chunks, but no longer build messages or resolve model/provider/streaming/reasoning settings in the browser.
- Removed study explanation reasoning toggle UI from `StudyPanelModal` / `StudyPanelStudyView`, simplified `useStudyPanelLlmSurfaces`, and deleted the unused reasoning-toggle component/hook files.
- Added targeted tests for backend validation/prompts/route streaming, backend OpenRouter streaming normalization/request shape, frontend hook compact intents, frontend Worker SSE parsing, and a boundary guard for the new study LLM browser seams.

## Remaining Follow-ups

- Expand `durableGenerationBoundary.test.ts` to enforce the full deletion contract after the obsolete files are removed: `src/prompts/**`, `src/types/prompt-assets.d.ts`, raw-loader config, `raw-loader`, browser provider modules, and settings/provider UI.
- Delete obsolete frontend prompt builder modules and tests once the remaining prompt-importing surfaces are rewritten:
  - `src/features/studyPanel/minimalStudyLlmMessages.ts`;
  - `src/features/studyPanel/formulaExplainLlmMessages.ts`;
  - `src/features/studyPanel/promptTemplate.ts` if no non-LLM prompt utility remains.
- Remove or rewrite remaining prompt-importing study surfaces:
  - `src/hooks/useStudyPanelModel.ts` still constructs `topicSystemPrompt` from `src/prompts/topic-system.prompt`;
  - `src/components/studyPanel/StudyPromptExternalActions.tsx` still uses diagram prompt helpers and prompt-search actions.
- Remove the retired browser provider stack and tests after all consumers are gone:
  - `src/infrastructure/repositories/HttpChatCompletionsRepository.ts`;
  - `src/infrastructure/llmInferenceRegistry.ts`;
  - `src/infrastructure/llmInferenceSurfaceProviders.ts`;
  - `src/infrastructure/openRouterDefaults.ts`;
  - associated tests and request-shape lockstep tests.
- Remove provider/model/OpenRouter settings from `src/store/studySettingsStore.ts`, `src/types/llmInference.ts`, and `src/components/settings/GlobalSettingsSheet.tsx`; retain only product study settings such as target audience, agent personality, TTS, and study-history controls.
- Delete `src/prompts/**`, `src/types/prompt-assets.d.ts`, `*.prompt` loader config in `next.config.mjs` / `vitest.config.ts`, and `raw-loader` from `package.json` / lockfile.
- Remove frontend Subject Graph Stage B prompt/repair code (`src/features/subjectGeneration/graph/prereqWiring/prerequisiteEdgeRules.ts` and related tests/code) in the same cleanup pass.
- Add integration coverage against the real Worker middleware stack once the full backend route tree is available in the test bundle; the current route test uses a lightweight v1 device-header harness because this task bundle only included related backend files.

## Target Architecture

The browser submits compact product intents to the Worker and receives normalized output/events. The Worker owns:

- prompt construction;
- OpenRouter request shape;
- model selection;
- reasoning posture;
- streaming/non-streaming choice;
- provider error normalization;
- LLM budget/rate enforcement;

The browser must not:

- import `.prompt` files;
- build LLM `messages` arrays for provider calls;
- expose model/provider/OpenRouter configuration UI;
- send model/provider/request-shape fields to backend LLM routes;
- keep a reasoning toggle;
- import provider repositories such as `HttpChatCompletionsRepository`;
- retain frontend Subject Graph Stage B prompt/parser/repair seams.

## Current Code Inventory

### `src/prompts/**` disposition

Delete all files:

- `src/prompts/crystal-trial.prompt` — superseded by backend durable generation prompts.
- `src/prompts/topic-expansion-cards.prompt` — superseded by backend durable generation prompts.
- `src/prompts/topic-mini-game-cards.prompt` — superseded by backend durable generation prompts.
- `src/prompts/topic-study-cards.prompt` — superseded by backend durable generation prompts.
- `src/prompts/topic-theory-syllabus.prompt` — superseded by backend durable generation prompts.
- `src/prompts/subject-graph-edges.prompt` — delete with the retired frontend Stage B prompt/repair path; backend Stage B remains strict parse plus semantic validation only.
- `src/prompts/minimal-study.prompt` — move responsibility to backend study LLM prompt module.
- `src/prompts/formula-explain.prompt` — move responsibility to backend study LLM prompt module.
- `src/prompts/topic-system.prompt` — remove frontend prompt construction and prompt-search action.
- `src/prompts/diagram-system.prompt` — remove frontend diagram prompt action.
- `src/prompts/witty-mentor.prompt` — delete; current Mentor uses canned lines and does not need an LLM prompt.

### Frontend prompt importers to remove or rewrite

- `src/features/studyPanel/minimalStudyLlmMessages.ts`
- `src/features/studyPanel/formulaExplainLlmMessages.ts`
- `src/features/studyPanel/promptTemplate.ts`
- `src/hooks/useStudyPanelModel.ts` (`topicSystemPrompt` construction)
- `src/components/studyPanel/StudyPromptExternalActions.tsx`
- `src/features/subjectGeneration/graph/prereqWiring/prerequisiteEdgeRules.ts`

### Browser LLM/provider modules to remove or replace

- `src/infrastructure/repositories/HttpChatCompletionsRepository.ts`
- `src/infrastructure/llmInferenceRegistry.ts`
- `src/infrastructure/llmInferenceSurfaceProviders.ts`
- `src/infrastructure/openRouterDefaults.ts`
- `src/infrastructure/llm/openRouterRequestShapeLockstep.test.ts`
- frontend OpenRouter/provider tests tied to those modules
- `chatCompletionsRepository` export from `src/infrastructure/di.ts`
- LLM provider/model settings in `src/store/studySettingsStore.ts`
- Study provider/OpenRouter config UI in `src/components/settings/GlobalSettingsSheet.tsx`
- prompt asset declarations in `src/types/prompt-assets.d.ts`
- `*.prompt` raw-loader config in `next.config.mjs`
- `raw-loader` dependency from root `package.json`

## Implementation Sequence

### 1. Strengthen boundary tests first — partially completed

Update `src/features/generationContracts/durableGenerationBoundary.test.ts` before implementation.

Add guards that fail when any of these return:

- any file under `src/prompts/`;
- any import path ending in `.prompt` or `.prompt?raw`;
- `src/types/prompt-assets.d.ts`;
- `raw-loader` in `package.json`;
- `*.prompt` loader config in `next.config.mjs`;
- frontend runtime references to `NEXT_PUBLIC_LLM_CHAT_URL`, `NEXT_PUBLIC_LLM_API_KEY`, `NEXT_PUBLIC_LLM_MODEL`, or `NEXT_PUBLIC_LLM_WORKER_URL`;
- frontend runtime imports of `HttpChatCompletionsRepository`, `llmInferenceRegistry`, or `llmInferenceSurfaceProviders`;
- frontend runtime construction of provider request-shape fields for study LLM calls: `messages`, `model`, `response_format`, `plugins`, `tools`, `includeOpenRouterReasoning`, `enableReasoning`;
- frontend settings references to OpenRouter configs, provider selection, or reasoning toggles.

Keep `NEXT_PUBLIC_DURABLE_GENERATION_URL` allowed: it is the backend Worker URL, not an LLM provider setting.

### 2. Add backend study LLM interface — completed for first slice

Add a backend module with a narrow interface:

```txt
backend/src/studyLlm/
  studyLlmPolicy.ts
  studyLlmPrompts.ts
  studyLlmValidation.ts
  studyLlmStream.ts
  studyLlmTypes.ts
  studyLlmPrompts.test.ts
  studyLlmValidation.test.ts
```

Recommended intent contract:

```ts
type StudyLlmRequest =
  | {
      kind: 'study-question-explain';
      intent: {
        topicLabel: string;
        questionText: string;
        agentPersonality: string;
      };
    }
  | {
      kind: 'study-formula-explain';
      intent: {
        topicLabel: string;
        cardQuestionText: string;
        latex: string;
        context: 'question' | 'answer' | 'option';
      };
    };
```

Validation rules:

- Reject unknown `kind`.
- Reject empty required strings.
- Reject request-shape/provider fields anywhere in the body: `model`, `modelId`, `model_id`, `provider`, `messages`, `response_format`, `plugins`, `tools`, `reasoning`, `includeOpenRouterReasoning`, `enableReasoning`, `apiKey`.
- Fail loudly with a 400 response and descriptive code.

Prompt construction lives only in `backend/src/studyLlm/studyLlmPrompts.ts`.

Backend policy lives only in `backend/src/studyLlm/studyLlmPolicy.ts` and should define:

- model id;
- temperature;
- reasoning enabled/disabled;
- streaming enabled/disabled;
- per-kind prompt version.

No policy values come from the browser.

### 3. Add backend study LLM route — completed for first slice

Add `backend/src/routes/studyLlm.ts` and mount it from `backend/src/index.ts` under:

```txt
POST /v1/study-llm/stream
```

Route behavior:

1. Require existing `X-Abyss-Device` middleware.
2. Parse and validate compact study LLM intent.
3. Resolve backend study LLM policy.
4. Build backend-owned messages.
5. Call OpenRouter through backend LLM infrastructure.
6. Stream normalized Server-Sent Events to the browser:

```ts
type StudyLlmStreamEvent =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done' };
```

Do not expose raw OpenRouter SSE frames or provider response wrappers to the browser.

Tests:

- `backend/src/routes/studyLlm.test.ts`
  - accepts both compact intent kinds;
  - rejects provider/model/message fields;
  - includes `X-Abyss-Device` requirement;
  - streams normalized content chunks;
  - streams reasoning chunks only when backend policy/provider returns them;
  - maps provider failure to stable error event or non-2xx response before streaming starts.

### 4. Reuse/extend backend OpenRouter seam — completed for study streaming

Prefer extending `backend/src/llm/openrouterClient.ts` instead of adding a second provider adapter.

Add a streaming helper behind the same backend provider seam, reusing:

- OpenRouter auth header construction;
- attribution headers;
- provider error classification;
- malformed wrapper failure rules;
- usage/token parsing when available.

Tests in `backend/src/llm/openrouterClient.test.ts` should cover:

- backend policy-owned reasoning request shape;
- no browser-supplied fields;
- normalized content/reasoning chunk parsing;
- provider error classification for streaming responses.

### 5. Add frontend study LLM client seam — completed

Add a frontend feature seam that hooks can call without importing infrastructure adapters directly:

```txt
src/features/studyPanel/studyLlmClient.ts
```

Suggested interface:

```ts
export type StudyLlmIntent =
  | { kind: 'study-question-explain'; intent: { topicLabel: string; questionText: string; agentPersonality: string } }
  | { kind: 'study-formula-explain'; intent: { topicLabel: string; cardQuestionText: string; latex: string; context: StudyFormulaExplainContext } };

export interface StudyLlmClient {
  stream(intent: StudyLlmIntent, signal?: AbortSignal): AsyncIterable<StudyLlmChunk>;
}
```

Add infrastructure adapter:

```txt
src/infrastructure/repositories/BackendStudyLlmRepository.ts
src/infrastructure/wireStudyLlmClient.ts
```

The adapter may use `fetch` because it lives in infrastructure. It must send only:

- `X-Abyss-Device`;
- `Content-Type: application/json`;
- compact `StudyLlmIntent` body.

It must use `NEXT_PUBLIC_DURABLE_GENERATION_URL` as the Worker base URL.

### 6. Rewrite study explanation hooks — completed

Rewrite:

- `src/hooks/useStudyQuestionLlmExplain.ts`
- `src/hooks/useStudyFormulaLlmExplain.ts`

They should:

- keep UI lifecycle behavior: pending, abort, error, session cache;
- submit compact `StudyLlmIntent` through `StudyLlmClient`;
- stop building `messages`;
- stop resolving model/provider/streaming/reasoning;
- remove `reasoningFromUserToggle` from hook params;
- still render `reasoningText` if the backend streams reasoning chunks.

Update:

- `src/components/StudyPanelModal.tsx`
- `src/components/studyPanel/StudyPanelStudyView.tsx`
- `src/hooks/useStudyPanelLlmSurfaces.ts`
- related tests.

Delete usage of:

- `useReasoningToggle`;
- `LlmReasoningToggle` if no remaining consumer exists.

### 7. Remove frontend prompt-based external actions

Delete or simplify these prompt surfaces:

- `src/components/studyPanel/StudyPromptExternalActions.tsx`
- `buildDiagramSystemPrompt()` and `extractExamplesSection()` from `src/features/studyPanel/promptTemplate.ts`
- `topicSystemPrompt` from `useStudyPanelModel()` and `StudyPanelModel`

Recommended v1: delete the external prompt/search buttons from the study LLM surface header. Do not recreate them with frontend prompt strings.

Update tests that expect:

- `study-prompt-external-search`;
- `study-prompt-external-diagram`;
- `topicSystemPrompt` props.

### 8. Simplify study settings

Remove from `src/store/studySettingsStore.ts`:

- `localModelId`;
- `openRouterConfigs`;
- `surfaceProviders`;
- OpenRouter config parsing/seed/migration helpers;
- model/provider actions;
- `getSurfaceBinding()`;
- `getOpenRouterConfigById()`;
- `getLocalModelId()`.

Keep product settings only:

- `targetAudience`;
- `agentPersonality`;
- `showStudyHistoryControls`.

Because there is no migration requirement, old persisted blobs can be ignored by constructing a fresh normalized snapshot from supported fields only.

Remove from `src/components/settings/GlobalSettingsSheet.tsx`:

- `StudyProvidersSection`;
- `OpenRouterSection`;
- all provider/config/model/reasoning UI.

Keep the explanatory copy clear: study explanations are backend-powered and not model-configurable in browser settings.

### 9. Delete the Stage B prerequisite-edge repair exception path

Delete:

```txt
src/features/subjectGeneration/graph/prereqWiring/prerequisiteEdgeRules.ts
src/features/subjectGeneration/graph/prereqWiring/prerequisiteEdgeRules.test.ts
src/prompts/subject-graph-edges.prompt
```

Do not migrate this repair behavior to `backend/` and do not create `backend/src/workflows/subjectGraphEdgesCorrection.ts` or equivalent.

Backend Subject Graph Stage B should remain:

1. backend-owned prompt construction in `backend/src/prompts/generationPrompts.ts`;
2. strict JSON Schema provider request;
3. `strictParseArtifact('subject-graph-edges', raw.text)`;
4. `semanticValidateArtifact('subject-graph-edges', ...)`;
5. hard failure on invalid output.

Required cleanup:

- remove tests that preserve the old map-shaped frontend repair contract;
- remove comments/docs in touched files that claim a Stage B correction pass still exists;
- keep or add boundary guards so `prerequisiteEdgeRules.ts`, `prereqWiring/**`, `src/prompts/subject-graph-edges.prompt`, or backend `*EdgesCorrection*` modules cannot return;
- keep backend Stage B artifact shape as `{ edges: Array<{ source, target, minLevel? }> }`; do not support the old frontend map shape.

### 10. Delete `src/prompts/**` and prompt tooling

After all imports are gone:

- delete `src/prompts/`;
- delete `src/types/prompt-assets.d.ts`;
- remove `*.prompt` Turbopack rule from `next.config.mjs`;
- remove `raw-loader` from `package.json` and lockfile;
- update any docs/tests that reference `src/prompts/**` as supported paths.

### 11. Remove obsolete frontend LLM types and tests

Delete or reduce:

- `src/types/llmInference.ts` if no longer used;
- provider request fields from `src/types/llm.ts` if only used by deleted frontend provider adapters;
- `src/infrastructure/repositories/openRouterReasoningDetails.ts` if no backend/frontend consumer remains;
- tests for deleted provider settings and lockstep browser request shape.

Keep only types required by the new compact study LLM client seam.

## Concrete Test Checklist

Run/add before implementation where possible, then keep green:

### Backend

- `backend/src/studyLlm/studyLlmPrompts.test.ts`
- `backend/src/studyLlm/studyLlmValidation.test.ts`
- `backend/src/routes/studyLlm.test.ts`
- `backend/src/llm/openrouterClient.test.ts` streaming additions
- existing workflow tests touching Subject Graph Stage B strict parse/semantic failure behavior

### Frontend

- update `src/hooks/useStudyLlmExplain.test.tsx`
- update `src/components/studyPanel/StudyPanelStudyView.test.tsx`
- update `src/components/StudyPanelModal` related tests if present
- update `src/store/studySettingsStore.test.ts`
- update `src/features/generationContracts/durableGenerationBoundary.test.ts`

### Eval/contract

- `pnpm test:eval` must remain green.
- Subject Graph Stage B eval fixtures should continue to assert strict parse plus semantic validation failures; do not add repair-acceptance fixtures.

## Verification Commands

Run after implementation:

```bash
pnpm test:unit:run
pnpm test:eval
pnpm check:compile
pnpm test:e2e:smoke
```

Manual checks:

1. Start a Study Session and request a study-question explanation.
2. Tap a formula and request a formula explanation.
3. Confirm no reasoning toggle appears.
4. Confirm Settings has no provider/model/OpenRouter configuration.
5. Generate Subject Graph, Topic Content, Topic Expansion, and Crystal Trial.
6. Confirm generated learning content still reads from the backend Learning Content Store.
7. Confirm no file remains under `src/prompts/`.
8. Confirm browser network requests go only to backend Worker routes, never to OpenRouter or local chat-completions endpoints.

## Close Criteria

This plan is complete when:

- `src/prompts/**` is deleted and guarded.
- Frontend prompt asset support is removed from config/types/dependencies.
- Browser study LLM hooks submit compact backend intents only.
- Browser reasoning toggle and provider/model/OpenRouter settings are deleted.
- All LLM provider calls originate in `backend/`.
- Stage B prerequisite-edge repair code is deleted rather than migrated; no frontend or backend correction module remains.
- Boundary tests fail if frontend prompts, frontend LLM request-shape ownership, or frontend provider policy returns.

## Compliance, Risk & Drift Assessment

Misalignment check: The current code still has frontend prompt construction and frontend provider-policy ownership for study explanation surfaces. This plan resolves that contradiction by making backend LLM ownership universal, not limited to durable generation pipelines.

Architectural risk: Medium. The largest risks are breaking study explanation streaming and accidentally replacing deleted prompt files with equivalent frontend strings. Mitigation is a compact intent seam, backend route tests, and repository-wide drift guards.

Prompt drift prevention: Do not recreate `src/prompts/**` under another frontend directory. Do not keep browser request-shape helpers as “temporary” adapters. Do not preserve `prerequisiteEdgeRules.ts` as a test-only seam and do not migrate it to backend; delete the repair path outright.
