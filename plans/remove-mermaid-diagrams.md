# Remove Mermaid Diagram Functionality

Remove the study-card Mermaid diagram feature completely instead of keeping hidden UI, dormant prompts, or unused inference surfaces.

## Goals

- Remove the "draw diagram with AI" study-card flow, including trigger UI, modal surface state, LLM request hook, Mermaid rendering, prompt, parser, and tests.
- Remove `studyQuestionMermaid` as an inference surface so settings, defaults, provider bindings, and persisted settings no longer advertise or configure it.
- Keep unrelated study-card explanation, formula explanation, hint, TTS, reasoning, and screen-capture removal work unchanged.

## Non-goals

- Do not replace Mermaid with another diagram renderer in this refactor.
- Do not keep a compatibility shim that silently maps `studyQuestionMermaid` to another surface.
- Do not change generic study-card explanation copy or model defaults except where they reference the removed surface.
- Do not add new UI primitives or modify files under `src/components/ui/*`.

## Current Mermaid Touchpoints

- Public inference contracts: `src/types/llmInference.ts`, `src/infrastructure/openRouterDefaults.ts`, `src/infrastructure/llmInferenceSurfaceProviders.ts`, `src/store/studySettingsStore.ts`.
- Study-panel orchestration: `src/hooks/useStudyPanelLlmSurfaces.ts`, `src/hooks/useStudyQuestionMermaidDiagram.ts`, `src/components/studyPanel/StudyPanelStudyView.tsx`, `src/components/studyPanel/StudyQuestionMermaidLlmBody.tsx`, `src/components/studyPanel/StudyMermaidPreview.tsx`, `src/components/StudyPanelModal.tsx`.
- Feature helpers and prompts: `src/features/studyPanel/studyQuestionMermaidLlmMessages.ts`, `src/features/studyPanel/extractMermaidFromAssistantText.ts`, `src/prompts/study-question-mermaid.prompt`.
- Tests: `src/hooks/useStudyPanelLlmSurfaces.test.tsx`, `src/hooks/useStudyLlmExplain.test.tsx`, `src/components/studyPanel/StudyPanelStudyView.test.tsx`, `src/features/studyPanel/studyQuestionMermaidLlmMessages.test.ts`, `src/features/studyPanel/extractMermaidFromAssistantText.test.ts`, settings/defaults provider tests.

## Implementation Plan

1. Contract removal
   - Remove `studyQuestionMermaid` from `InferenceSurfaceId`, `ALL_SURFACE_IDS`, and `SURFACE_DISPLAY_LABELS`.
   - Remove default provider/model bindings for the surface.
   - Update provider/default tests so the canonical surface list no longer includes Mermaid.
   - Add or update persisted settings migration behavior to drop stale `studyQuestionMermaid` provider entries at the settings boundary. The migration should remove the key explicitly, not route it to another surface.

2. Study-panel state removal
   - Delete `StudyPanelMermaidDiagramProps` from `src/features/studyPanel/studyPanelLlmSurfaceProps.ts`.
   - Remove `llmMermaidDiagram`, `mermaidOpen`, `handleMermaidOpenChange`, `dismissMermaidInference`, and `mermaidReasoningEnabled` paths from `useStudyPanelLlmSurfaces`.
   - Keep the existing mutual-exclusion behavior between normal explanation, formula explanation, and hints.
   - Update `useStudyPanelLlmSurfaces.test.tsx` to assert only the remaining surfaces cancel and reopen correctly.

3. UI removal
   - Remove the "Draw diagram with AI" button, responsive inference description, Mermaid TTS wiring, Mermaid dialog body, and associated props from `StudyPanelStudyView`.
   - Remove any parent props passed through `StudyPanelModal` and `app/page.tsx`.
   - Delete `StudyQuestionMermaidLlmBody.tsx` and `StudyMermaidPreview.tsx`.
   - Update component tests by deleting Mermaid-specific assertions and keeping coverage for explain, formula, hint, card review, and accessibility behavior.

4. LLM hook, parser, and prompt deletion
   - Delete `useStudyQuestionMermaidDiagram.ts`.
   - Delete `studyQuestionMermaidLlmMessages.ts` and remove its export from `src/features/studyPanel/index.ts`.
   - Delete `extractMermaidFromAssistantText.ts` and remove its export.
   - Delete `src/prompts/study-question-mermaid.prompt`.
   - Delete tests that only validate the removed prompt builder or Mermaid fence extractor.

5. Backlog and docs cleanup
   - Search for `mermaid`, `studyQuestionMermaid`, `StudyMermaid`, `requestDiagram`, and `Draw diagram with AI`; every remaining hit should be either intentionally historical in plans or unrelated generic diagram tooling.

## Generic Diagram Prompt Follow-up

`StudyPanelStateViews` still exposes a separate "Diagram Prompt" utility built from `src/prompts/diagram-system.prompt` and `buildDiagramSystemPrompt`. It is not the same Mermaid rendering flow, but it is diagram-related. Decide during implementation whether the requested scope includes this tool:

- If the intent is Mermaid-only removal, leave `diagram-system.prompt`, `buildDiagramSystemPrompt`, and their tests intact.
- If the intent is all diagram-related study-panel removal, remove the "Diagram Prompt" button/dialog, delete `diagram-system.prompt`, delete `buildDiagramSystemPrompt`, and update `promptTemplate.test.ts`.

## Test Plan

- Run targeted unit tests for study panel hooks, study panel view, study settings store, OpenRouter defaults, and inference surface providers.
- Run `pnpm test -- --run` or the repository's equivalent full unit test command when the focused tests pass.
- Run `pnpm lint` or the repository's standard lint/typecheck command to catch stale imports and type references.
- Run a final repository search for removed identifiers and verify no production code imports `mermaid`.

## Risks and Guardrails

- Persisted settings may still contain `studyQuestionMermaid`; strip the stale key in one migration path and avoid runtime compatibility shims.
- Removing the Mermaid dialog changes study-card controls; keep button spacing and mobile tap targets coherent after the button is gone.
- Shared LLM surface orchestration can regress if cancellation behavior is edited broadly; keep the refactor limited to the Mermaid branch.
- The generic "Diagram Prompt" tool has overlapping language but separate behavior; make the scope decision explicit before deleting it.
