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

## Remaining

- [ ] Introduce CLOZE and free form cards to the workflow.
- [ ] Remove static pre-generated @public/data/subjects deck json stubs.
- [ ] check if we can remove @src/features/subjectGeneration .
- [ ] Finish reducing LLM context workload with deterministic typed stages.
  - [ ] Add `topic-concept-plan` artifact kind/schema/prompt.
  - [ ] Extract most important concepts and plan card specifications based on theory.
  - [ ] Add `topic-card-plan` artifact kind/schema/prompt.
  - [ ] Determine suitable card types and mini-game types per concept.
  - [ ] Generate per-card content from a single compiled card specification.
  - [ ] Generate mini-games only when the plan says a mini-game is suitable.
  - [ ] Ensure multiple cards for the same concept do not repeat questions.
  - [ ] Replace broad mini-game fan-out with plan-selected per-spec jobs.
  - [ ] Add bounded concurrency once per-spec content fan-out exceeds the current three broad mini-game stages.
  - [ ] Improve source-span selection from lexical overlap to explicit plan-selected `sourceSpanId[]`.
  - [ ] Add duplicate-repair retry jobs for failed card specs.
- [ ] Remove temporary LLM ID compatibility from generation contracts once ID-free content schemas exist.
- [ ] Replace single topic readiness with explicit theory/deck/enrichment readiness state.
