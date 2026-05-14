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

### Plan-gated legacy mini-game fan-out

This patch adds the next workflow slice: broad mini-game artifact generation is now gated by compiled mini-game specs from the card-plan checkpoint.

Completed:

- Added a workflow-local mini-game planning helper that maps compiled `miniGameSpecs` to legacy broad mini-game workflow stages.
- `TopicContentWorkflow` no longer fans out to all three mini-game artifact kinds unconditionally when compiled planning state is available.
- Full and mini-game runs now generate only the legacy broad mini-game stages whose `gameType` appears in the compiled card plan.
- The workflow keeps the previous all-requested mini-game behavior when no compiled card-plan checkpoint is available, preserving compatibility for legacy/single-stage paths.
- Mini-game prompt snapshots now carry the compiled mini-game specs selected for the legacy broad artifact, including backend-owned `miniGameSpecId`, concept linkage, difficulty, prompt, and `sourceSpanId[]` grounding.
- Mini-game prompts instruct the model to generate cards only for those compiled specs and to match each spec's difficulty and grounding.
- Added unit coverage for plan-gated mini-game stage resolution, deterministic spec ordering, source-span selection, and prompt text.

This still does not create one durable `topic-mini-game-content` artifact per `miniGameSpecId`; the current artifact kinds remain the legacy broad mini-game contracts. The workflow now avoids generating unplanned mini-game types and passes explicit compiled-spec intent into those remaining broad jobs.

### Plan-guided legacy study-card generation

This patch adds a parallel compatibility slice for study cards: broad `topic-study-cards` generation is now guided by compiled `cardSpecs` from the card-plan checkpoint while the durable artifact kind remains unchanged.

Completed:

- Added a workflow-local study-card planning helper that maps compiled `cardSpecs` to prompt records and derives a deterministic card-only `sourceSpanId[]` allow-list.
- `TopicContentWorkflow` now builds study-card prompt grounding from compiled card specs when planning state is available, instead of using the union of study-card and mini-game source spans.
- Study-card prompt snapshots now carry compiled study-card specs selected by the backend card plan, including backend-owned `cardSpecId`, concept linkage, card type, difficulty, prompt, and `sourceSpanId[]` grounding.
- Study-card prompts instruct the model to generate cards only for the compiled specs and to match each spec's card type, difficulty, and grounding.
- The legacy fallback path is preserved when no compiled card-plan checkpoint is available.
- Added unit coverage for deterministic study-card spec ordering, source-span selection, and prompt text containing the compiled-spec rules.

This still does not create one durable `topic-card-content` artifact per `cardSpecId`. The workflow now passes explicit compiled-spec intent into the broad study-card job so the later per-card fan-out slice can replace the broad artifact with narrower content jobs.

### Plan-bound legacy card materialization IDs

This patch closes the ID-boundary gap left by the plan-guided broad artifact compatibility path: generated broad artifacts can now materialize cards against compiled planning IDs when a compiled-spec prompt snapshot is present.

Completed:

- `TopicContentWorkflow` now passes the exact plan-guided prompt snapshot into both generation and Learning Content Store application for broad study-card and plan-gated mini-game stages.
- Cached broad study-card and mini-game artifacts are also applied with the same compiled-spec snapshot context, so retry/cache paths use the same materialization boundary as fresh generation.
- `topic-study-cards` materialization now binds generated cards to compiled `conceptId` and `cardSpecId` values from `compiled_study_card_specs` when present.
- Legacy broad mini-game materialization now binds generated cards to compiled `conceptId` and `miniGameSpecId` values from `compiled_mini_game_specs` when present.
- Plan-bound materialization enforces that generated output count matches compiled spec count, generated study-card type matches the compiled `cardType`, generated mini-game `content.gameType` matches the compiled `gameType`, and generated difficulty matches the compiled spec difficulty.
- Prompt rules for plan-guided broad study-card and mini-game stages now require exactly one generated card per compiled spec, in compiled-spec order.
- Legacy fallback remains unchanged for unplanned broad artifacts and expansion cards: those paths still derive deterministic placeholder concept/spec IDs from generated card content and position.

This still does not create one durable `topic-card-content` artifact per `cardSpecId` or one durable `topic-mini-game-content` artifact per `miniGameSpecId`. It does, however, ensure the current compatibility broad artifacts no longer overwrite compiled planning IDs during Learning Content Store materialization.

### Per-card study-card content fan-out

This patch replaces the plan-guided broad study-card content path with durable per-card content jobs whenever compiled card planning state is available.

Completed:

- Added a durable external `@contracts` artifact kind for `topic-card-content`:
  - strict Zod schema and schema version,
  - strict parser registry entry,
  - semantic validator registry entry,
  - OpenRouter JSON Schema response format,
  - golden eval fixtures covering accept, JSON-mode parse failure, Zod-shape parse failure, and semantic card-content failure.
- Added backend generation policy and contract-adapter exports for `topic-card-content`.
- Added a `topic-card-content` prompt builder that prompts exactly one card for exactly one compiled `cardSpecId` and preserves the backend-owned ID boundary.
- `TopicContentWorkflow` now fans out planned study cards to one `topic-card-content` stage per compiled `cardSpecId` when a compiled card-plan checkpoint is available.
- Per-card content stage input hashes bind to the compiled card-plan checkpoint content hash and the individual `cardSpecId`, preventing cache hits from crossing plan or spec changes.
- `topic-card-content` materialization persists exactly one generated card against the selected compiled `conceptId` and `cardSpecId` from the prompt snapshot.
- The legacy broad `topic-study-cards` path remains only for unplanned/legacy runs where no compiled card specs are available.
- Added regression coverage for per-card content materialization and contract eval coverage for the new artifact kind.

This did not yet promote mini-game generation to per-`miniGameSpecId` jobs. Mini-games still used the plan-gated legacy broad artifact contracts.

### Per-mini-game content fan-out

This patch replaces the plan-gated legacy broad mini-game content path with durable per-mini-game content jobs whenever compiled card planning state is available.

Completed:

- Added a durable external `@contracts` artifact kind for `topic-mini-game-content`:
  - strict Zod schema and schema version,
  - strict parser registry entry,
  - semantic validator registry entry,
  - OpenRouter JSON Schema response format,
  - golden eval fixtures covering accept, JSON-mode parse failure, Zod-shape parse failure, and semantic mini-game playability failure.
- Added backend generation policy and contract-adapter exports for `topic-mini-game-content`.
- Added a `topic-mini-game-content` prompt builder that prompts exactly one mini-game card for exactly one compiled `miniGameSpecId` and preserves the backend-owned ID boundary.
- `TopicContentWorkflow` now fans out planned mini-games to one `topic-mini-game-content` stage per compiled `miniGameSpecId` when a compiled card-plan checkpoint is available.
- Per-mini-game content stage input hashes bind to the compiled card-plan checkpoint content hash and the individual `miniGameSpecId`, preventing cache hits from crossing plan or spec changes.
- `topic-mini-game-content` materialization persists exactly one generated mini-game card against the selected compiled `conceptId` and `miniGameSpecId` from the prompt snapshot.
- The legacy broad `topic-mini-game-*` path remains only for unplanned/legacy runs where no compiled mini-game specs are available.
- Added regression coverage for per-mini-game content materialization and prompt construction, and contract eval coverage for the new artifact kind.

The intended per-spec content fan-out now exists for both study cards and mini-games. Remaining work is mostly durability hardening, readiness semantics, and retiring compatibility surfaces.

### Bounded per-spec content fan-out

This patch adds workflow-level concurrency control for planned per-spec card and mini-game content jobs.

Completed:

- Added a reusable deterministic bounded fan-out helper for workflow content jobs.
- Planned `topic-card-content` stages now run through the bounded fan-out helper instead of unbounded `Promise.all` over every compiled `cardSpecId`.
- Planned `topic-mini-game-content` stages now run through the same bounded fan-out helper instead of unbounded `Promise.all` over every compiled `miniGameSpecId`.
- The helper preserves result ordering for aggregate study-card content hashing while limiting active LLM/cache/materialization tasks to the named per-spec content fan-out policy.
- The helper rejects invalid concurrency configuration explicitly instead of silently falling back to unbounded or serial execution.
- Added unit coverage for order preservation, active-task limiting, and invalid concurrency rejection.

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
- per-card `topic-card-content` input hashes from the compiled card-plan checkpoint content hash plus the individual compiled `cardSpecId`.
- per-mini-game `topic-mini-game-content` input hashes from the compiled card-plan checkpoint content hash plus the individual compiled `miniGameSpecId`.
- planning checkpoint reuse from current subject/topic scope plus current theory source spans or compiled concept references.
- per-card study-card prompt grounding and instructions from the selected compiled `cardSpec` when planning state is available.
- bounded per-spec content fan-out from the named topic-content concurrency policy for planned study-card and mini-game jobs.
- legacy broad study-card prompt grounding and instructions from compiled `cardSpecs` only for unplanned/legacy fallback paths.
- legacy broad mini-game stage selection from compiled `miniGameSpecs.gameType` values only for unplanned/legacy fallback paths.
- `topic-card-content` materialization from the selected compiled `conceptId` and `cardSpecId` values.
- `topic-mini-game-content` materialization from the selected compiled `conceptId` and `miniGameSpecId` values.
- legacy broad study-card and mini-game materialization from compiled `conceptId`, `cardSpecId`, and `miniGameSpecId` values when compiled-spec snapshots are present on fallback paths.

This keeps legacy stages operational for unplanned runs while preventing LLM-generated IDs from entering the Learning Content Store, reducing downstream LLM context size, establishing the deterministic spec compiler and retry-safe compiled-planning persistence seam, preventing stale compiled planning checkpoints from being reused across changed theory or concept inputs, replacing planned broad study-card generation with per-card content jobs, replacing planned broad mini-game generation with per-mini-game content jobs, and binding planned materialization to compiled spec IDs when planning state is available.

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

1. Promote the remaining backend-local planning schemas, response formats, and snapshot builders into the durable external `@contracts` artifact layer:
   - `topic-concept-plan`
   - `topic-card-plan`
   - `topic-card-content` and `topic-mini-game-content` are now durable, but their prompt snapshot builders still live in the backend workflow seam.
2. Retire lexical source-span fallback after legacy broad fallback stages are no longer needed and every downstream prompt receives explicit compiled-spec `sourceSpanId[]` grounding.
3. Make topic readiness explicit, for example `theory`, `deck`, and `enrichment` readiness instead of a single `ready` flag. Per-card study-card fan-out currently marks the topic ready after all card-content stages complete; mini-game enrichment completion is still implicit in workflow completion.
4. Remove temporary LLM ID compatibility from external generation contracts once the contract source is updated to allow ID-free content outputs.
5. Add duplicate-repair retry jobs that regenerate only the failed card or mini-game spec when `question_signature` conflicts.
6. Add end-to-end Worker/runtime tests with a mocked LLM provider for the full planning path, including stale checkpoint regeneration, per-card study-card fan-out, and per-mini-game fan-out in a real D1/R2-backed workflow environment.
7. Tighten retry/resume checkpoint semantics for per-spec study-card and mini-game fan-out so a child run can distinguish already-materialized individual `cardSpecId` / `miniGameSpecId` stages from aggregate legacy stages without relying only on artifact cache hits.
8. Retire the planned broad mini-game prompt guidance path after confidence in per-mini-game fan-out and retry behavior is covered by runtime tests.
9. Make the per-spec fan-out concurrency policy environment-tunable if production telemetry shows that a static Worker-safe limit is either too conservative or too aggressive for deployed LLM/R2/D1 capacity.
