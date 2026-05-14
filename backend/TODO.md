App is unreleased, so you can introduce breaking changes with no data migration or backward compatibility, etc.

## Completed

- [x] Start reducing LLM context workload by adding a backend-only materialization boundary for topic cards.
- [x] Stop relying on LLM-generated card IDs in the Learning Content Store materializer.
  - [x] Generate deterministic backend `card_id` values during materialization.
  - [x] Generate deterministic backend `concept_id`, `card_spec_id`, and `mini_game_spec_id` placeholders for existing broad artifacts.
  - [x] Compute and persist `question_signature` for duplicate detection.
  - [x] Reject duplicate question signatures within one generated artifact before persistence.
  - [x] Add a DB uniqueness guard for duplicate `question_signature` values per topic.
- [x] Update LCS repository/envelope validation so persisted card JSON must match backend-owned row metadata.
- [x] Document the current implementation slice and remaining topic-generation pipeline work.
- [x] Add backend-owned topic theory source spans and use selected spans when constructing downstream card/mini-game prompt context.
- [x] Add backend-local concept/card planning compiler as the next deterministic pipeline seam.
  - [x] Add backend-local schemas for `topic-concept-plan` and `topic-card-plan` payloads.
  - [x] Compile model-planned concepts into authoritative backend `concept_id` values.
  - [x] Compile planned study-card and mini-game specs into authoritative backend `card_spec_id` and `mini_game_spec_id` values.
  - [x] Validate compiled specs against concept-owned `sourceSpanId[]` selections.
- [x] Wire backend-local topic planning into `TopicContentWorkflow` behind the current broad artifact path.
  - [x] Add backend-local strict response formats for `topic-concept-plan` and `topic-card-plan` LLM calls.
  - [x] Add backend generation policy entries for planning stages.
  - [x] Run concept planning and card-spec planning after theory source spans are available.
  - [x] Persist compiled `planning:concepts` and `planning:card-specs` checkpoints from workflow execution.
  - [x] Reuse ready planning checkpoints on retry/child runs when they match the current theory spans and concept refs.
  - [x] Bind broad study-card and mini-game cache keys to the compiled card-plan checkpoint content hash.
  - [x] Prefer compiled-plan `sourceSpanId[]` grounding in broad downstream prompts while retaining lexical fallback.

## Remaining

- [ ] Introduce CLOZE and free form cards to the workflow.
- [ ] Remove static pre-generated @public/data/subjects deck json stubs.
- [ ] check if we can remove @src/features/subjectGeneration .
- [ ] Finish reducing LLM context workload with deterministic typed stages.
  - [ ] Promote backend-local `topic-concept-plan`, `topic-card-plan`, and future per-spec content schemas into the external `@contracts` artifact layer.
  - [ ] Generate per-card content from a single compiled card specification.
  - [ ] Generate mini-games only when the compiled card plan says a mini-game is suitable.
  - [ ] Ensure multiple cards for the same concept do not repeat questions.
  - [ ] Replace broad mini-game fan-out with plan-selected per-spec jobs.
  - [ ] Add bounded concurrency once per-spec content fan-out exceeds the current three broad mini-game stages.
  - [ ] Retire lexical source-span fallback after per-spec content jobs are live.
  - [ ] Add duplicate-repair retry jobs for failed card specs.
  - [ ] Add workflow-level tests for planning checkpoint reuse, stale checkpoint rejection, and broad-stage cache-key binding.
- [ ] Remove temporary LLM ID compatibility from generation contracts once ID-free content schemas exist.
- [ ] Replace single topic readiness with explicit theory/deck/enrichment readiness state.

## Deep Modularization

1. **Durable Run Observation Bridge**
**Files**: [useContentGenerationHydration.ts](/Users/quantum_craft/_DEV/abyss-engine/src/hooks/useContentGenerationHydration.ts:13), [generationRunEventHandlers.ts](/Users/quantum_craft/_DEV/abyss-engine/src/infrastructure/generationRunEventHandlers.ts:56), [eventBus.ts](/Users/quantum_craft/_DEV/abyss-engine/src/infrastructure/eventBus.ts:185)
**Problem**: React reconstructs intents from backend snapshots, while the event handler fabricates legacy App Event Bus payloads with placeholder values. That Interface has low Depth because callers still need legacy generation semantics.
**Solution**: make durable observation a deeper Module that consumes backend publication facts and emits product-shaped notifications, not old frontend-generation events.
**Benefits**: stronger Leverage for Mentor, Telemetry, and query invalidation; tests can target backend observation behavior instead of snapshot field parsing.
