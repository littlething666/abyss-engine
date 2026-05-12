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

### Backend-local compiled planning checkpoints

This patch adds the next dependency slice before workflow fan-out: reusable checkpoint helpers for compiled planning outputs.

Completed:

- Added backend-local checkpoint artifact payloads for compiled planning state:
  - `topic-concept-plan-checkpoint`
  - `topic-card-plan-checkpoint`
- Added deterministic checkpoint input hashes for compiled concept plans from subject/topic scope, source-span IDs, and the parsed concept-plan payload.
- Added deterministic checkpoint input hashes for compiled card plans from subject/topic scope, compiled concept references, and the parsed card-plan payload.
- Added persistence helpers that store compiled planning checkpoints through the existing artifacts repository and mark ready stage checkpoints:
  - `planning:concepts`
  - `planning:card-specs`
- Added load helpers that read ready checkpoints by run/stage, optionally reject stale input hashes, and validate the stored compiled concept/card/mini-game spec shape before returning it.
- Added tests for checkpoint persistence, stored artifact payload shape, ready stage-checkpoint writes, ready checkpoint load, and stale-hash rejection.

This helper seam is now used by `TopicContentWorkflow`, but the checkpoints remain backend-local and are not yet promoted to the external durable `@contracts` artifact layer.

### Workflow-level planning checkpoint wiring

This patch wires the backend-local planning seam into `TopicContentWorkflow` while keeping generated broad study-card and mini-game artifacts operational.

Completed:

- Added backend-local strict JSON Schema response formats for:
  - `topic-concept-plan`
  - `topic-card-plan`
- Added backend generation policy entries for the two planning LLM stages:
  - `topic-concept-plan`
  - `topic-card-plan`
- `TopicContentWorkflow` now runs planning in dependency order after a ready theory artifact is available:
  - theory source spans
  - concept-plan prompt snapshot
  - concept-plan LLM response
  - compiled concepts checkpoint
  - card-plan prompt snapshot
  - card/mini-game spec LLM response
  - compiled card-spec checkpoint
- Retry/child runs now attempt to load ready `planning:concepts` and `planning:card-specs` checkpoints before invoking new planning LLM calls.
- Loaded planning checkpoints are checked against the current subject/topic scope, current theory source-span IDs, and compiled concept references before reuse.
- Study-card and mini-game stage input hashes now bind to the compiled card-plan checkpoint content hash for full-pipeline runs, preventing cache hits from crossing plan changes.
- Broad study-card and mini-game prompt construction now prefers plan-selected `sourceSpanId[]` grounding when compiled specs are available, with the previous lexical source-span selection retained as a compatibility fallback.

This still does not replace the broad `topic-study-cards` artifact with per-card-spec content jobs, and mini-game generation still uses the existing broad artifact contracts. The workflow now has durable compiled planning state available for the later fan-out slice.

### Workflow-level planning checkpoint reuse guards

This patch adds the next low-risk workflow hardening slice: explicit planning checkpoint reuse guards and regression coverage around planning-bound stage hashes.

Completed:

- Extracted workflow-local checkpoint compatibility checks for compiled planning checkpoints into a testable module.
- `TopicContentWorkflow` now treats stale compiled planning checkpoints as non-reusable and regenerates the affected planning stage instead of terminally failing the run solely because a ready checkpoint was present.
- Concept-plan checkpoint reuse is allowed only when subject/topic scope and backend-owned theory `sourceSpanId[]` match the current theory artifact.
- Card-plan checkpoint reuse is allowed only when subject/topic scope and compiled concept references match the current compiled concepts, including each concept's backend-owned ID, local concept key, and source-span set.
- Added workflow-level unit coverage for reusable versus stale planning checkpoints.
- Added stage input-hash coverage proving broad study-card and mini-game artifacts bind to the compiled card-plan checkpoint content hash, not just theory and study-card parent content.

This keeps the current broad-artifact workflow path operational while making retry/child-run planning reuse safer: stale checkpoint rows are ignored and overwritten by newly persisted checkpoints when the workflow regenerates the planning stage.

## Deterministic materialization policy

For legacy broad artifacts, the backend currently derives:

- `question_signature` from normalized semantic card content.
- `concept_id` from the subject/topic scope as an `unplanned-topic-concept:v1` placeholder.
- `card_spec_id` or `mini_game_spec_id` from the topic, artifact kind, card index, and question signature.
- `card_id` from the compiled spec ID and question signature.

For theory artifacts, the backend currently derives:

- `theory_span_id` from subject/topic scope, span kind, span index, optional difficulty, and span text.
- selected downstream grounding spans from deterministic token overlap against the target syllabus questions.

For planning artifacts, backend-local snapshots, the compiler, checkpoint helpers, and workflow wiring currently derive:

- `topic-concept-plan` input snapshots from backend-owned source spans, derived syllabus questions, and target difficulties.
- `concept_id` from subject/topic scope, normalized local concept key, and selected source spans.
- `card_spec_id` from compiled concept, normalized local card key, card type, difficulty, and selected source spans.
- `mini_game_spec_id` from compiled concept, normalized local mini-game key, game type, difficulty, and selected source spans.
- `topic-card-plan` input snapshots from compiled concept specs plus each concept's allowed source-span subset.
- `topic-concept-plan-checkpoint` input hashes from subject/topic scope, source-span IDs, and the parsed concept-plan payload.
- `topic-card-plan-checkpoint` input hashes from subject/topic scope, compiled concept references, and the parsed card-plan payload.
- broad content-stage input hashes from the compiled card-plan checkpoint content hash when full-pipeline stages consume planning state.
- planning checkpoint reuse from current subject/topic scope plus current theory source spans or compiled concept references.

This keeps existing stages operational while preventing LLM-generated IDs from entering the Learning Content Store, beginning to reduce downstream LLM context size, establishing the deterministic spec compiler needed before per-spec content jobs are wired into the workflow, adding a retry-safe persistence seam for compiled planning outputs, wiring that seam into the current broad-artifact workflow path, and preventing stale compiled planning checkpoints from being reused across changed theory or concept inputs.

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

1. Promote the backend-local planning schemas, response formats, and snapshot builders into the durable external `@contracts` artifact layer once the fan-out artifact set is ready:
   - `topic-concept-plan`
   - `topic-card-plan`
   - `topic-card-content`
   - `topic-mini-game-content`
2. Replace the broad `study-cards` artifact in `TopicContentWorkflow` with per-card-spec jobs driven by compiled `cardSpecId` values.
3. Replace unconditional mini-game fan-out with mini-game specs emitted by the compiled card plan.
4. Add bounded concurrency for per-spec content jobs once the workflow fans out beyond the current three mini-game stages.
5. Retire lexical source-span fallback after per-spec content jobs are live and every downstream prompt receives explicit compiled-spec `sourceSpanId[]` grounding.
6. Make topic readiness explicit, for example `theory`, `deck`, and `enrichment` readiness instead of a single `ready` flag.
7. Remove temporary LLM ID compatibility from external generation contracts once the contract source is updated to allow ID-free content outputs.
8. Add duplicate-repair retry jobs that regenerate only the failed card spec when `question_signature` conflicts.
9. Add end-to-end Worker/runtime tests with a mocked LLM provider for the full planning path, including stale checkpoint regeneration in a real D1/R2-backed workflow environment.
