# Topic generation pipeline refactor status

This backend is unreleased, so the Learning Content Store schema and generated artifact contracts can still take breaking changes without migration compatibility.

## Current implemented slice

The first implementation slice targets the lowest-risk dependency for the proposed split pipeline: backend-owned materialization identifiers.

Completed in this patch:

- Learning Content Store `topic_cards` rows now carry backend-owned planning/materialization metadata:
  - `concept_id`
  - `card_spec_id`
  - `mini_game_spec_id`
  - `question_signature`
- `topic_cards` now has a uniqueness guard on `(device_id, subject_id, topic_id, question_signature)` to reject duplicate questions for the same topic.
- The artifact applier no longer persists LLM-generated card IDs. It normalizes generated cards and overwrites card metadata with deterministic backend IDs.
- Prompt rules now state that any model-generated ID is temporary and ignored by backend materialization.
- Repository and envelope validation now require persisted card JSON to match row-level backend IDs/signatures.

This is intentionally not the full concept/card-plan DAG yet. Existing broad artifacts can still be consumed, but they are now materialized through the new deterministic-ID boundary. That gives the later DAG work a stable database target.

## Deterministic materialization policy

For legacy broad artifacts, the backend currently derives:

- `question_signature` from normalized semantic card content.
- `concept_id` from the subject/topic scope as an `unplanned-topic-concept:v1` placeholder.
- `card_spec_id` or `mini_game_spec_id` from the topic, artifact kind, card index, and question signature.
- `card_id` from the compiled spec ID and question signature.

This keeps existing stages operational while preventing LLM-generated IDs from entering the Learning Content Store.

## Target pipeline still intended

```text
topic-theory
  ↓
topic-concept-plan
  ↓ backend compile: deterministic conceptId
  ↓
topic-card-plan
  ↓ backend compile: deterministic cardSpecId / miniGameSpecId
  ↓
topic-card-content jobs, one per cardSpec
  ↓
topic-mini-game-content jobs, one per miniGameSpec
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
3. Replace the broad `study-cards` and unconditional mini-game fan-out in `TopicContentWorkflow` with per-spec jobs and bounded concurrency.
4. Split theory into backend-owned source spans and pass only relevant spans into content jobs.
5. Make topic readiness explicit, for example `theory`, `deck`, and `enrichment` readiness instead of a single `ready` flag.
6. Remove temporary LLM ID compatibility from external generation contracts once the contract source is updated to allow ID-free content outputs.
7. Add duplicate-repair retry jobs that regenerate only the failed card spec when `question_signature` conflicts.
