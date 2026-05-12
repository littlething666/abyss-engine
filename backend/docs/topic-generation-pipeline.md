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

## Deterministic materialization policy

For legacy broad artifacts, the backend currently derives:

- `question_signature` from normalized semantic card content.
- `concept_id` from the subject/topic scope as an `unplanned-topic-concept:v1` placeholder.
- `card_spec_id` or `mini_game_spec_id` from the topic, artifact kind, card index, and question signature.
- `card_id` from the compiled spec ID and question signature.

For theory artifacts, the backend currently derives:

- `theory_span_id` from subject/topic scope, span kind, span index, optional difficulty, and span text.
- selected downstream grounding spans from deterministic token overlap against the target syllabus questions.

This keeps existing stages operational while preventing LLM-generated IDs from entering the Learning Content Store and beginning to reduce downstream LLM context size.

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

1. Add durable artifact kinds and schemas for:
   - `topic-concept-plan`
   - `topic-card-plan`
   - `topic-card-content`
   - `topic-mini-game-content`
2. Add backend compile steps that transform LLM planning artifacts into authoritative concept/card/mini-game specs.
3. Replace the broad `study-cards` artifact in `TopicContentWorkflow` with per-card-spec jobs.
4. Replace unconditional mini-game fan-out with mini-game specs emitted by the card plan.
5. Add bounded concurrency for per-spec content jobs once the workflow fans out beyond the current three mini-game stages.
6. Improve source-span selection from lexical overlap to explicit plan-selected `sourceSpanId[]` once concept/card planning exists.
7. Make topic readiness explicit, for example `theory`, `deck`, and `enrichment` readiness instead of a single `ready` flag.
8. Remove temporary LLM ID compatibility from external generation contracts once the contract source is updated to allow ID-free content outputs.
9. Add duplicate-repair retry jobs that regenerate only the failed card spec when `question_signature` conflicts.
