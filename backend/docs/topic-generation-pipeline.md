# Topic generation pipeline refactor status

This backend is unreleased, so the Learning Content Store schema and generated artifact contracts can still take breaking changes without migration compatibility.

## Current implemented slices

### Backend-owned materialization identifiers

The first implementation slice targets the lowest-risk dependency for the proposed split pipeline: backend-owned materialization identifiers.

Completed:

- Learning Content Store `topic_cards` rows carry backend-owned planning/materialization metadata:
  - `concept_id`
  - `card_spec_id`
  - `mini_game_spec_id`
  - `question_signature`
- `topic_cards` has a uniqueness guard on `(device_id, subject_id, topic_id, question_signature)` to reject duplicate questions for the same topic.
- The artifact applier no longer persists LLM-generated card IDs. It normalizes generated cards and overwrites card metadata with deterministic backend IDs.
- Prompt rules state that any model-generated ID is temporary and ignored by backend materialization.
- Repository and envelope validation require persisted card JSON to match row-level backend IDs/signatures.

This is intentionally not the full concept/card-plan DAG yet. Existing broad artifacts can still be consumed, but they are now materialized through the new deterministic-ID boundary. That gives the later DAG work a stable database target.

### Backend-owned theory source spans

This patch adds a second dependency slice: deterministic source spans derived from `topic-theory` artifacts.

Completed:

- `topic-theory` materialization now stores `details.sourceSpans` on the topic details read model.
- Source spans are backend-owned and deterministic. Span IDs are derived from subject/topic scope, span kind, span index, optional difficulty, and normalized span text.
- Source spans currently cover:
  - `core-concept`
  - paragraph/sentence-level `theory`
  - `key-takeaway`
  - difficulty-bound `syllabus-question`
- Topic details envelope validation now validates `sourceSpans` when present.
- Card, mini-game, and expansion prompt snapshots built from either cached theory artifacts or Learning Content topic details now select a bounded relevant source-span subset from syllabus-question overlap instead of passing the whole theory body.
- The formatted prompt excerpt includes source-span IDs so generated content can be traced back to backend-owned grounding spans.

This still uses the existing broad `topic-study-cards` and broad mini-game artifact contracts. It reduces downstream prompt context and establishes the grounding primitive needed by future per-card jobs without requiring external contract changes in this patch.

### Backend-local concept/card planning compiler

This patch adds a third dependency slice: backend-local planning payload schemas and deterministic compile primitives for the future split pipeline.

Completed:

- Added backend-local Zod payload schemas for:
  - `topic-concept-plan`
  - `topic-card-plan`
- Added `compileTopicConceptPlan`, which validates model-planned concepts against backend-owned theory `sourceSpanId` values and emits authoritative compiled concept specs.
- Added `compileTopicCardPlan`, which validates planned card and mini-game specs against compiled concepts and enforces that each spec is grounded only in that concept's selected source spans.
- Compiled specs now receive backend-owned deterministic IDs:
  - `concept_id` from subject/topic scope, local concept key, and source spans.
  - `card_spec_id` from compiled concept, local card key, card type, difficulty, and source spans.
  - `mini_game_spec_id` from compiled concept, local mini-game key, game type, difficulty, and source spans.
- The compiler intentionally ignores model-generated `id`, `conceptId`, `cardSpecId`, and `miniGameSpecId` compatibility fields by consuming only the typed planning fields required for backend materialization.
- Added compiler tests for deterministic IDs, source-span validation, concept linkage, duplicate local keys, and rejection of card specs that reference unknown concepts or spans outside the concept.

This still does not wire the new plan artifacts into durable run artifacts or `TopicContentWorkflow`. The implementation stays behind a backend-local seam until the workflow is ready to persist these artifacts and the external `@contracts` package can be updated with artifact kinds, strict parsers, semantic validators, response formats, snapshots, and eval fixtures in one durable-contract slice.


### Backend-local planning snapshots and prompt modules

This patch adds the next dependency slice after the local compiler: deterministic backend-local snapshots and prompt builders for planning artifacts.

Completed:

- Added backend-local snapshot builders for:
  - `topic-concept-plan`
  - `topic-card-plan`
- `topic-concept-plan` snapshots now carry the exact backend-owned `sourceSpanId` values, source span text, derived syllabus questions, and target difficulties used to prompt concept planning.
- `topic-card-plan` snapshots now carry authoritative compiled concepts, their backend-owned `concept_id` values, and only the source spans selected by each concept.
- Added prompt builders for `topic-concept-plan` and `topic-card-plan` behind the backend prompt module seam.
- Planning prompts explicitly require the model to copy `sourceSpanId` values from the supplied span allow-list, and require card/mini-game specs to use only source spans attached to the selected concept.
- Planning prompts explicitly tell the model not to emit backend-owned IDs such as `conceptId`, `cardSpecId`, or `miniGameSpecId`; the compiler remains the only authority for those IDs.
- Added tests for snapshot shape, source-span scope validation, compiled-concept grounding, and prompt text containing the required grounding and ID-boundary rules.

This still does not persist planning artifacts or fan out per-spec content jobs. The implementation remains backend-local and deterministic so the next workflow slice can checkpoint compiled specs before invoking per-card or per-mini-game generation.

## Deterministic materialization policy

For legacy broad artifacts, the backend currently derives:

- `question_signature` from normalized semantic card content.
- `concept_id` from the subject/topic scope as an `unplanned-topic-concept:v1` placeholder.
- `card_spec_id` or `mini_game_spec_id` from the topic, artifact kind, card index, and question signature.
- `card_id` from the compiled spec ID and question signature.

For theory artifacts, the backend currently derives:

- `theory_span_id` from subject/topic scope, span kind, span index, optional difficulty, and span text.
- selected downstream grounding spans from deterministic token overlap against the target syllabus questions.

For planning artifacts, backend-local snapshots and the compiler currently derive:

- `topic-concept-plan` input snapshots from backend-owned source spans, derived syllabus questions, and target difficulties.
- `concept_id` from subject/topic scope, normalized local concept key, and selected source spans.
- `card_spec_id` from compiled concept, normalized local card key, card type, difficulty, and selected source spans.
- `mini_game_spec_id` from compiled concept, normalized local mini-game key, game type, difficulty, and selected source spans.
- `topic-card-plan` input snapshots from compiled concept specs plus each concept's allowed source-span subset.

This keeps existing stages operational while preventing LLM-generated IDs from entering the Learning Content Store, beginning to reduce downstream LLM context size, and establishing the deterministic spec compiler needed before per-spec content jobs are wired into the workflow.

## Target pipeline still intended

```text
topic-theory
  ↓ backend compile: deterministic sourceSpanId[]
topic-concept-plan
  ↓ backend compile: deterministic conceptId
topic-card-plan
  ↓ backend compile: deterministic cardSpecId / miniGameSpecId
topic-card-content jobs, one per cardSpec, grounded by selected sourceSpanId[]
topic-mini-game-content jobs, one per miniGameSpec, grounded by selected sourceSpanId[]
  ↓
backend materialization
```

## Remaining follow-ups

1. Promote the backend-local planning schemas and snapshot builders into the durable external `@contracts` artifact layer once the workflow is ready to persist these artifacts:
   - `topic-concept-plan`
   - `topic-card-plan`
   - `topic-card-content`
   - `topic-mini-game-content`
2. Persist or checkpoint compiled concept/card/mini-game specs so workflow retries reuse the same authoritative IDs.
3. Wire `TopicContentWorkflow` through the new plan snapshots in dependency order: theory source spans → concept plan → compiled concepts → card plan → compiled specs.
4. Replace the broad `study-cards` artifact in `TopicContentWorkflow` with per-card-spec jobs.
5. Replace unconditional mini-game fan-out with mini-game specs emitted by the compiled card plan.
6. Add bounded concurrency for per-spec content jobs once the workflow fans out beyond the current three mini-game stages.
7. Replace lexical source-span selection in downstream broad content prompts with explicit plan-selected `sourceSpanId[]` from compiled specs, then retire the lexical fallback after per-spec jobs are live.
8. Make topic readiness explicit, for example `theory`, `deck`, and `enrichment` readiness instead of a single `ready` flag.
9. Remove temporary LLM ID compatibility from external generation contracts once the contract source is updated to allow ID-free content outputs.
10. Add duplicate-repair retry jobs that regenerate only the failed card spec when `question_signature` conflicts.
