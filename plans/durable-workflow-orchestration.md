<aside>
📌

**Status:** Plan v3, 2026-05-04. Rewritten after architecture review and user decisions: feature-owned generation contracts, Supabase Postgres v1 state, `RunInputSnapshot`, strict pipeline parsers with legacy parser deprecation, OpenRouter response-healing retained for v1, [AGENTS.md](http://AGENTS.md) durable-run composition exception, corrected Crystal Trial event semantics, Phase 1 budget guard, and complete Generation Client routing coverage.

</aside>

## Implementation Status

Last updated: 2026-05-05. Reflects Phase 0 complete, Phase 0.5 complete, Phase 1 PRs A–G landed. PRs are stacked: each step's PR targets the previous step's branch as its base.

### Phase 0 — Reliability hardening + shared contracts

- [x]  **Step 1.** Create `src/features/generationContracts/` with public `index.ts` — landed in [PR #41](https://github.com/littlething666/abyss-engine/pull/41) (draft, base `main`). Adds `canonicalHash.ts` (`canonicalJson`, `inputHash` → `inp_<64-hex>`, `contentHash` → `cnt_<64-hex>`), `failureCodes.ts`, `runEvents.ts`, `artifacts/types.ts`, `snapshots/types.ts` (7 per-pipeline `RunInputSnapshot` variants), public barrel, and module `AGENTS.md` boundary doc.
- [x]  **Step 2.** Add `RunInputSnapshot` builders and canonical hash test vectors for all four pipelines — landed in [PR #42](https://github.com/littlething666/abyss-engine/pull/42) (draft, stacked on `feat/durable-generation-contracts-phase0`). Adds 7 builders (one per pipeline kind, including the 3 mini-game variants), private field validators, builder unit tests with shape + validation-rejection coverage, and canonical-hash determinism / sensitivity / key-order / pinned-literal vectors.
- [x]  **Step 3.** Strict Zod schemas + strict parsers for every pipeline job/artifact kind — landed in [PR #43](https://github.com/littlething666/abyss-engine/pull/43) (draft, stacked on `feat/durable-generation-contracts-phase0-step2`). Adds `schemas/` (one strict Zod schema per durable `ArtifactKind`: `subject-graph-topics`, `subject-graph-edges`, `topic-theory`, `topic-study-cards`, all three `topic-mini-game-*` variants, `topic-expansion-cards`, `crystal-trial`) and `strictParsers/` (single-pass `strictParse(raw, schema)` + `strictParseArtifact(kind, raw)` with an `ArtifactKind` → schema registry). Strict-parser contract: exact JSON in, no markdown-fence stripping, no embedded-JSON extraction, no multi-shape acceptance — invalid JSON yields `parse:json-mode-violation`, schema mismatch yields `parse:zod-shape`. Each schema is `.strict()` at the envelope level so extra keys are rejected. Mini-game variants pin `content.gameType` to a literal that matches the pipeline kind. Crystal Trial schema embeds a `.refine` ensuring `correctAnswer` matches one of `options` (case-insensitive). Per-card-content shape (cloze blanks, multiple-choice options, etc.), card-pool size, difficulty distribution, mini-game playability, and `TRIAL_QUESTION_COUNT` enforcement are deferred to the Phase 0 step 9 semantic validators (those constants live in feature code, and pulling them here would cross the contracts → feature boundary the module's `AGENTS.md` forbids). Module-level `index.ts` re-exports schemas + payload types + schema-version constants + the strict-parser API. Zero new runtime deps; uses the already-pinned `zod@^4.3.6`.
- [x]  **Step 4.** Mark legacy permissive parsers `@deprecated` for pipeline paths — landed in [PR #44](https://github.com/littlething666/abyss-engine/pull/44) (draft, stacked on `feat/durable-generation-contracts-phase0-step3`). Adds `@deprecated` JSDoc to `extractJsonString()` in `src/lib/llmResponseText.ts` and to the four legacy permissive parsers (`parseTopicCardsPayload` + `diagnoseTopicCardsPayload`, `parseTopicTheoryContentPayload`, `parseCrystalTrialPayload`, `parseTopicLatticeResponse`). Each `@deprecated` block names the forbidden code path (durable pipelines), the exact migration target (`strictParseArtifact('<kind>', raw)` from `@/features/generationContracts`), allowed remaining callers (legacy in-tab runners + non-pipeline display surfaces), and the Phase 4 removal target. Adds `src/features/generationContracts/strictParsers/legacyParserBoundary.test.ts` (mirroring the `lucideImportBoundary.test.ts` pattern) which walks `src/features/generationContracts/**/*.{ts,tsx}` and asserts no contracts-module file imports any of the five forbidden specifier fragments — combined with the strict-parser tests landed in #43, this satisfies the plan's Legacy parser deprecation gate (*"Tests prove durable strict paths do not call `extractJsonString()` or permissive pipeline parsers"*). The Subject Graph Stage B `correctPrereqEdges` deterministic-repair exception ([AGENTS.md](http://agents.md/) curriculum-prerequisite-edges narrow exception) is explicitly preserved and called out in the `parseTopicLatticeResponse.ts` deprecation comment. JSDoc-only changes; zero runtime behavior changes; no MCP-write-blocked files touched.
- [x]  **Step 5.** Add `requireJsonSchema` / `allowProviderHealing` options to `resolveOpenRouterStructuredChatExtrasForJob` — landed in [PR #45](https://github.com/littlething666/abyss-engine/pull/45) (draft, stacked on `feat/durable-generation-contracts-phase0-step4`). Adds two narrowly-scoped options to `OpenRouterStructuredChatExtrasOptions`: `requireJsonSchema?: boolean` (default `false`) — when `true`, the function never returns `json_object` extras and instead returns `null` if the bound model lacks `structured_outputs` or no `jsonSchemaResponseFormat` is supplied, so durable pipeline callers fail at the boundary; and `allowProviderHealing?: boolean` (default `true`) — when `false`, the OpenRouter `response-healing` plugin is suppressed regardless of the workspace `openRouterResponseHealing` setting. Defaults preserve current call-site behavior bit-for-bit for non-pipeline surfaces. JSDoc cites Plan v3 Q5 / Q22 and explicitly forwards binding-time enforcement to step 6, `providerHealingRequested` metadata recording to step 7, and full `json_object` removal from pipeline paths to step 8 — preventing future agents from misinterpreting this PR as the strict-config-failure or json_object-removal step. The `@deprecated resolveOpenRouterStructuredJsonChatExtras` shim is preserved unchanged. Six new tests in `llmInferenceSurfaceProviders.test.ts` cover both new options end-to-end (require=true with `structured_outputs` supported, require=true without `structured_outputs` returning null, require=true without `jsonSchemaResponseFormat` returning null, allowProviderHealing=false suppressing healing plugin, allowProviderHealing=true preserving healing plugin, allowProviderHealing=false with healing already disabled). All seven pre-existing tests continue to pass without modification, proving default behavior preserved. Zero feature call sites updated (deferred to steps 6/7/8); zero MCP-write-blocked files touched.
- [x]  **Step 6.** Enforce strict JSON Schema for pipeline-bound surfaces at config-validation time — landed in [PR #46](https://github.com/littlething666/abyss-engine/pull/46) (draft, stacked on `feat/durable-generation-contracts-phase0-step5`). Adds `PIPELINE_INFERENCE_SURFACE_IDS` (single source of truth covering exactly `subjectGenerationTopics`, `subjectGenerationEdges`, `topicContent`, and `crystalTrial`, declared `as const satisfies readonly InferenceSurfaceId[]`) plus `isPipelineInferenceSurfaceId` type guard in `src/types/llmInference.ts`. Adds `validatePipelineSurfaceConfig(surfaceId)` and `assertPipelineSurfaceConfigValid(surfaceId)` (with typed `PipelineSurfaceConfigValidationError` carrying both surface id and structured failure code) in `src/infrastructure/llmInferenceSurfaceProviders.ts`. The validator returns `{ ok: true }` for non-pipeline surfaces unconditionally; for pipeline surfaces it walks the binding + bound config and returns `{ ok: false, code, message }` with one of three structured codes — `config:invalid` when bound to the local provider (no strict JSON Schema capability declaration), `config:missing-model-binding` when bound to OpenRouter without a config or with an unknown configId, `config:missing-structured-output` when the bound config does not declare both `response_format` and `structured_outputs` among its supported parameters. Failure-code strings are redeclared as a local `PipelineSurfaceConfigFailureCode` literal union (rather than imported from `@/features/generationContracts`) to preserve the existing `infrastructure → features` boundary that root [AGENTS.md](http://agents.md/) keeps as `eventBusHandlers`only; the JSDoc explicitly documents the lockstep policy with `GENERATION_FAILURE_CODES` consistent with the per-string maintenance pattern already used by the Worker / telemetry / HUD / mentor consumers. JSDoc on `resolveOpenRouterStructuredChatExtrasForJob` and the inline `requireJsonSchema && !useJsonSchema → null` branch comment are updated to cross-reference `assertPipelineSurfaceConfigValid` so the layered fail-loud sequence (config-validation throw → resolve null at runtime) is locked in against future drift. Eleven new tests across three describe blocks: `PIPELINE_INFERENCE_SURFACE_IDS` exact-set sanity + type guard coverage; validator coverage for non-pipeline early-return on degenerate bindings, all three failure modes per pipeline surface (local, missing/unknown configId, missing `response_format`, json_object-only without `structured_outputs`), and ok=true for ALL four pipeline surfaces on a schema-capable config; assert coverage for typed Error identity (code + surfaceId + name), `config:invalid` throw on local binding, no-throw for non-pipeline surfaces, no-throw for valid pipeline binding. All twelve pre-existing tests in `llmInferenceSurfaceProviders.test.ts` continue to pass without modification. Zero feature call sites updated — pipeline composition-root wiring (calling `assertPipelineSurfaceConfigValid` from each pipeline's run-event handler) is deferred to Phase 1's `generationRunEventHandlers.ts` per the architecture amendment. Zero MCP-write-blocked files touched.
- [x]  **Step 7.** Record `providerHealingRequested` metadata on jobs/runs — landed in [PR #47](https://github.com/littlething666/abyss-engine/pull/47) (draft, stacked on `feat/durable-generation-contracts-phase0-step6`). Adds `providerHealingRequested: boolean` as a required field on `OpenRouterStructuredChatExtras` in `src/infrastructure/llmInferenceSurfaceProviders.ts`, computed authoritatively as `allowProviderHealing && healingEnabledByStore` and ALWAYS mirroring `plugins` presence — the OpenRouter `response-healing` plugin attaches iff this flag is `true`. The lockstep policy is documented on the resolver JSDoc, on the field JSDoc, and on the `allowProviderHealing` option JSDoc, and is enforced by a property-style test that asserts `providerHealingRequested === (plugins?.length > 0) === (allow && store)` across the full option × store matrix. Local in-tab job runner (`runContentGenerationJob.ts`) records the flag on `ContentGenerationJob.metadata` whenever the resolver returns OpenRouter structured extras — recording is decoupled from `json_schema`only mode (kept narrowly scoped to `structuredOutputMode`/`structuredOutputSchemaName`) because Plan v3 Q22 records the request, not the response-format shape. The contract-violation `mergeJobMetadata` block on json_schema parse-fail also threads the flag through to telemetry/failure dashboards so Phase 3 observability cannot disagree with the initial-metadata path. The previous indirect `responseHealingEnabled: Boolean(structured.plugins?.length)` field is deleted outright per [AGENTS.md](http://agents.md/) `No Legacy Burden`; since `ContentGenerationJob.metadata` is `Record<string, unknown>` this is a pure value-shape change with no type-system fan-out and no persisted-data migration. Six new tests in `llmInferenceSurfaceProviders.test.ts` under a new `providerHealingRequested (Phase 0 step 7)` describe block cover the full `allowProviderHealing` × store-healing matrix, recording in legacy permissive `json_object` fallback mode (pinning the metadata behavior on the path step 8 will retire from pipelines while preserving it for non-pipeline callers during the transition), and the lockstep invariant. One new test in `runContentGenerationJob.test.ts` asserts the flag is recorded on json_object mode while `structuredOutputMode` stays absent. Three pre-existing job-runner test mocks updated to include the new field; two `toMatchObject` assertions renamed `responseHealingEnabled` → `providerHealingRequested`. All 19 pre-existing resolver tests + all 7 pre-existing job-runner tests untouched and remain passing. JSDoc on `resolveOpenRouterStructuredChatExtrasForJob` updated to reflect that step 7 is THIS PR (not deferred) and to preserve cross-references to step 6 (`assertPipelineSurfaceConfigValid`) and step 8 (json_object removal still pending) — preventing future agents from misinterpreting this PR as the pipeline json_object-removal step. Phase 1 durable Worker `jobs.metadata_json` recording from `RunEvent`s remains deferred to `src/infrastructure/generationRunEventHandlers.ts` per the [AGENTS.md](http://agents.md/) durable-run composition root amendment; this PR delivers the local in-tab primitive only, mirroring the Phase 0 step 6 pattern. Zero MCP-write-blocked files touched; zero prompt/schema/model surface touched (eval CI gate does not need to re-run).
- [x]  **Step 8.** Remove pipeline reliance on `json_object` fallback — landed in [PR #48](https://github.com/littlething666/abyss-engine/pull/48) (draft, stacked on `feat/durable-generation-contracts-phase0-step7`). Flips the four pipeline-bound surfaces (`subjectGenerationTopics`, `subjectGenerationEdges`, `topicContent`, `crystalTrial`) to strict JSON Schema mode at the in-tab `runContentGenerationJob` boundary, eliminating their reliance on the permissive `{ type: 'json_object' }` resolver fallback. Two complementary gates land in `src/features/contentGeneration/runContentGenerationJob.ts`: (1) `validatePipelineSurfaceConfig(surfaceId)` from Phase 0 step 6 is invoked for pipeline-bound surfaces — when the binding is incapable of strict JSON Schema mode (no provider binding / unknown config / missing `response_format` / missing `structured_outputs`) the job is registered, tagged with the structured `configValidationFailureCode` on `metadata`, finalized as `failed`, and `streamChat` / resolver / `persistOutput` are all skipped BEFORE any LLM call; (2) `resolveOpenRouterStructuredChatExtrasForJob` is now called with `requireJsonSchema: isPipelineSurface` and `allowProviderHealing: true`, so pipeline surfaces NEVER receive `{ type: 'json_object' }` extras while non-pipeline surfaces (`studyQuestionExplain`, `studyFormulaExplain`) keep their existing permissive shape (default `requireJsonSchema: false`). When the resolver returns null for a pipeline surface (no `responseFormatOverride` JSON Schema supplied OR model lacks `structured_outputs`), the chat-completions request body carries NO `responseFormat` at all — the strict parser still runs against raw text and fails loudly per Plan v3 Q5, strictly preferable to the prior `json_object` fallback. The `responseFormatOverride?: ChatResponseFormat` parameter remains the seam through which pipeline composition roots will eventually supply their artifact-kind-specific JSON Schemas as the durable contracts module's `schemas/` directory grows; this PR does not yet wire those at call sites. JSDoc on `llmSurfaceId` and `responseFormatOverride` updated to call out the new gate and the strict-mode contract. Two existing `json_object` tests re-pointed from `topicContent` (pipeline) to `studyQuestionExplain` (non-pipeline) so the legacy permissive shape is exercised at the layer where it remains valid; the *forwards JSON Schema override and pipeline strictness flags* test was tightened to assert the resolver is now called with `{ requireJsonSchema: true, allowProviderHealing: true, jsonSchemaResponseFormat: schemaFormat }` for `topicContent`. Five new tests under a *Phase 0 step 8 — pipeline strictness gate at the in-tab boundary* heading: (a) validator invoked for each of the four pipeline surfaces; (b) validator NOT invoked for non-pipeline surfaces; (c) pipeline surface fails BEFORE any LLM call when validation fails — `streamChat` / resolver / `persistOutput` not called, `metadata.configValidationFailureCode === 'config:missing-structured-output'`, error message surfaced; (d) pipeline surface passes `requireJsonSchema=true, allowProviderHealing=true` to the resolver even with no `responseFormatOverride` (`crystalTrial`); (e) drift-prevention pin — when the resolver returns null for a pipeline surface, the chat-completions request body has `responseFormat === undefined` and `plugins === undefined` and the job metadata carries no `structuredOutputMode` / `responseFormat` keys (any future regression that re-adds the json_object fallback fails CI). Phase 0 acceptance criterion *“No pipeline surface emits or requests `metadata.structuredOutputMode === 'json_object'`.”* is satisfied at the in-tab boundary; the durable Worker handler will mirror this gate in Phase 1 via `src/infrastructure/generationRunEventHandlers.ts` per the [AGENTS.md](http://agents.md/) durable-run composition root amendment. Pipeline call sites supplying concrete JSON Schemas via `responseFormatOverride` remain deferred to Phase 1+ (and the Phase 0 step 12 prompt-quality pass when prompt builders are touched). Zero MCP-write-blocked files touched; zero prompt/schema/model surface touched (eval CI gate does not need to re-run).
- [x]  **Step 9.** Add semantic validators (card pool size, difficulty distribution, grounding, duplicate concepts, mini-game playability, Crystal Trial question count, lattice/edge rules) — landed in [PR #49](https://github.com/littlething666/abyss-engine/pull/49) (draft, stacked on `feat/durable-generation-contracts-phase0-step8`). Adds `src/features/generationContracts/semanticValidators/` (14 new files: `_constants.ts`, `types.ts`, `cardContentShape.ts`, one validator per `ArtifactKind` — `subjectGraphTopics`, `subjectGraphEdges`, `topicTheory`, `topicStudyCards`, `topicMiniGameCategorySort`, `topicMiniGameSequenceBuild`, `topicMiniGameMatchPairs`, `topicExpansionCards`, `crystalTrial` — plus `byKind.ts` + `index.ts` + `semanticValidators.test.ts`). Validators run AFTER the strict Zod parser as a separate single pass and return a structured `SemanticValidatorResult` rather than throwing — the orchestrator decides whether each `validation:semantic-*` failure is terminal or surfaced through telemetry. Domain rules covered: subject-graph icon allowlist (40-entry mirror of `TOPIC_ICON_NAMES`) + duplicate `topicId` / `title`; subject-graph edges referential integrity vs the Stage A lattice (passed via `SemanticValidatorContext.latticeTopicIds` — hard-fails if the field is missing rather than silently passing) + no self-loops + no duplicate `(source,target)`; topic-theory duplicate `keyTakeaways` and duplicate syllabus questions per difficulty bucket; topic-study-cards / topic-expansion-cards pool-size floor + per-card-content shape (FLASHCARD `{front, back}`, CLOZE `{text, blanks[≥1]}`, MULTIPLE_CHOICE `{question, options[≥2], correctAnswer ∈ options}`) + concept-stem de-duplication within the artifact AND vs `context.existingConceptStems` (Phase 1 will feed this from the snapshot's `existing_concept_stems`) + minimum-2-distinct-difficulty-tiers drift floor; mini-game playability — CategorySort: every `categoryId` references a declared category, every category has ≥1 item, unique ids; SequenceBuild: `order` values form contiguous `1..N` (no gaps, no duplicates), unique step ids; MatchPairs: strict 1:1 permutation per `MatchPairsContent` JSDoc in `src/types/core.ts` — unique pair ids + unique left + unique right (case-insensitive trim); Crystal Trial total `questions.length === context.expectedQuestionCount ?? SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT` (snapshot `question_count` flows in via context) + unique question ids + unique options per question. Authoritative semantic constants that live in feature code (`TRIAL_QUESTION_COUNT`, `MAX_CARD_DIFFICULTY`, `TOPIC_ICON_NAMES`) are redeclared locally in `_constants.ts` with JSDoc citing the upstream source — preserves the contracts-module-must-not-import-from-features runtime boundary the module's [AGENTS.md](http://agents.md/) requires for future Worker compilation, and lockstep tests in `semanticValidators.test.ts` import the upstream feature constants and assert equality with the redeclared mirrors so CI fails the moment they drift (test files are excluded from the Worker bundle, so their feature imports are safe). Adds one new failure code `validation:semantic-card-content-shape` to `GENERATION_FAILURE_CODES` (slotted between `card-pool-size` and `difficulty-distribution` to preserve the validation-code grouping) so card-content-shape failures route distinctly from card-pool-size, difficulty-distribution, duplicate-concept, mini-game-playability, trial-question-count, and subject-graph codes; the new code is also added to the `SemanticFailureCode` literal union and a coverage assertion in the test file checks the union is a subset of `GENERATION_FAILURE_CODES`. The `SEMANTIC_VALIDATORS_BY_KIND` registry covers all 9 `ArtifactKind` literals and is exported through the contracts module's public `index.ts` alongside the `semanticValidateArtifact(kind, payload, context?)` dispatcher; pipeline composition roots call this directly after `strictParseArtifact` returns `ok: true`. Tests: 34 across 9 describe blocks — lockstep (3) + failure-code subset coverage + registry coverage + per-kind happy-path + at least one failure case per failure code each validator can emit. Provider-grounding annotation extraction (`validation:bad-grounding`) is intentionally NOT in `topicTheory.ts` because it runs against provider metadata in the Worker, not on the parsed artifact. Pipeline composition wiring of these validators (assembling `SemanticValidatorContext` from the snapshot's `existing_concept_stems` / `lattice_artifact_content_hash` / `question_count` fields and invoking `semanticValidateArtifact` after `strictParseArtifact`) is deferred to Phase 1's `src/infrastructure/generationRunEventHandlers.ts` per the [AGENTS.md](http://agents.md/) durable-run composition root amendment, mirroring the same primitive-only pattern Phase 0 steps 6 + 7 used. Per-tier card-balance targets (e.g., 25% per tier) deferred to the Phase 0 step 12 prompt-quality pass; this PR enforces only the drift floor of ≥2 distinct difficulty tiers. Updates contracts module [AGENTS.md](http://agents.md/) to drop the *Follow-up Phase 0 PRs will add `semanticValidators/`* marker, refresh the layout block to include the 14 new files, and add a *Semantic validator policy* section documenting the no-throw contract, the `SemanticValidatorContext`required-fields-fail-loud rule, and the lockstep-redeclaration policy for upstream constants. Zero MCP-write-blocked files touched; zero prompt/schema/model surface touched (eval CI gate does not need to re-run).
- [x]  **Step 10.** Build golden eval harness — 30–50 fixtures per pipeline including parse-fail and semantic-fail fixtures — landed in [PR #50](https://github.com/littlething666/abyss-engine/pull/50) (draft, stacked on `feat/durable-generation-contracts-phase0-step9`). Adds `src/features/generationContracts/evalFixtures/` (15 new files: `_helpers.ts`, `types.ts`, `runFixture.ts`, `byKind.ts`, `evalHarness.test.ts`, plus one `<kind>.fixtures.ts` file for each of the nine `ArtifactKind` literals — `subjectGraphTopics`, `subjectGraphEdges`, `topicTheory`, `topicStudyCards`, `topicExpansionCards`, `topicMiniGameCategorySort`, `topicMiniGameSequenceBuild`, `topicMiniGameMatchPairs`, `crystalTrial`). Each fixture file ships ≥25 golden fixtures (current totals: 26/26/26/26/27/26/26/26/26 = 235 across the corpus) covering all four pipeline outcomes — `accept`, `parse-fail/<code>`, `semantic-fail/<code>`. The harness (`evalHarness.test.ts`) enforces three locks: (a) every `ArtifactKind` ships ≥25 fixtures; (b) the `accept`, `parse-fail`, and `semantic-fail` buckets are each non-empty per kind so no kind can silently lose coverage of a whole outcome; (c) every fixture round-trips through `strictParseArtifact` + `semanticValidateArtifact` (when the parse succeeds) and asserts bit-for-bit identity with the declared expected outcome including the structured failure code, with a clear actual-vs-expected diff on mismatch. Semantic-fail fixtures cover every locally-relevant failure code: `validation:semantic-subject-graph` (icon-allowlist drift, duplicate `topicId`, duplicate title case-insensitive, self-loop, unknown source/target, duplicate `(source,target)` exact + with different `minLevel`, missing context); `validation:semantic-duplicate-concept` (takeaways exact + case-insensitive, per-tier syllabus questions, study-card concept stems, expansion-vs-existing concept stems with normalization, Crystal Trial duplicate question id and case-insensitive duplicate option); `validation:semantic-card-pool-size`; `validation:semantic-card-content-shape` (FLASHCARD `back` non-string); `validation:semantic-difficulty-distribution` (every card on tier 1); `validation:semantic-mini-game-playability` (CategorySort: dup category id, dup item id, item references unknown category, declared category with no items; SequenceBuild: dup step id, ordering with gap / duplicate / wrong start / multi-skip; MatchPairs: dup pair id, dup `left`/`right` exact + case-insensitive); `validation:semantic-trial-question-count` (default-count too few, default-count too many, context-supplied `expectedQuestionCount` mismatch). The `_helpers.ts` builders (`fx`, `mut`, `acc`, `pfJson`, `pfShape`, `sf`, `ser`) are deliberately verbose so each fixture's diff stays localized to the field under test: `mut` JSON-clones a per-kind base before applying the mutation closure so cross-fixture state cannot leak, and deliberately malformed `raw` strings — markdown fences, embedded prose, trailing commas, truncated JSON, single-quoted JSON, HTML wrappers — are embedded literally as TypeScript strings so a JSON-on-disk loader cannot mask them. The `byKind.ts` registry (`EVAL_FIXTURES_BY_KIND: Record<ArtifactKind, ReadonlyArray<EvalFixture>>` plus the `fixturesForKind(kind)` accessor) covers all 9 `ArtifactKind` literals via the same exhaustive-mapping pattern step 9's `SEMANTIC_VALIDATORS_BY_KIND` already established, so adding a new pipeline kind to `ArtifactKind` will fail the build until the corresponding fixture file exists. Public `index.ts` re-exports `EVAL_FIXTURES_BY_KIND`, `fixturesForKind`, `runFixture`, `EvalFixture`, `EvalFixtureRunResult`, `EvalFixturesByKind`, and `EvalOutcome` so consumers (the future Worker-side eval runner, CI dashboards) go through the single barrel. Updates contracts module [AGENTS.md](http://agents.md/) to drop the *Follow-up Phase 0 PRs will add `evalFixtures/`* marker (now reads `prompts/` only), refresh the layout block to include the 15 new files, and add an *Eval fixture policy* section codifying the four-outcome coverage matrix, the no-feature-import boundary (fixtures import only from `./*`, `../strictParsers`, `../semanticValidators`, `../artifacts/types`), the TypeScript-not-JSON-on-disk requirement, and the lockstep policy that adding a new failure code or schema constraint requires extending the relevant fixture file in the same PR. Step 11 (eval CI as merge gate) is intentionally NOT in this PR — it wires the harness into the GitHub Actions matrix as a required check on prompt/schema/model touches, which involves CI YAML and `package.json` script changes that this contracts-only step deliberately avoided. Test-only addition; zero runtime imports change; zero feature-module dependencies; the Worker build target is unaffected. Zero MCP-write-blocked files touched; zero prompt/schema/model surface touched (eval CI gate does not need to re-run yet, by definition).
- [x]  **Step 11.** Wire eval CI as merge gate for prompt/schema/model changes — landed in [PR #51](https://github.com/littlething666/abyss-engine/pull/51) (draft, stacked on `feat/durable-generation-contracts-phase0-step10`). Adds `.github/workflows/eval-gate.yml` — a new GitHub Actions workflow `Eval Gate` that triggers on `pull_request` with a path filter covering the four surface categories the eval harness is the system-of-record for: (1) the entire generation-contracts surface (`src/features/generationContracts/**`) so schemas, strict parsers, semantic validators, eval fixtures, failure codes, snapshots, and any future `prompts/` directory all re-fire the harness; (2) the legacy prompt builders that still drive today's in-tab pipeline output (`src/features/contentGeneration/messages/**`, `src/features/contentGeneration/parsers/**`, `src/features/subjectGeneration/graph/topicLattice/**`, `src/features/subjectGeneration/graph/prerequisiteEdges/**`) — deprecated for durable pipeline paths since Phase 0 step 4 but still control today's content shape, so a change there must re-run the harness against the matching `ArtifactKind` fixtures; (3) the model bindings + inference-surface providers (`src/infrastructure/llmInferenceSurfaceProviders.ts`, `src/types/llmInference.ts`) through which `model_id`, `response_format`, `structured_outputs` capability, pipeline-vs-non-pipeline routing, and the `providerHealingRequested` flag all flow; (4) the gate itself (`.github/workflows/eval-gate.yml` and `package.json`) so a change to the workflow or to the script it invokes must re-run on the same PR — preventing a regression in the gate from silently landing alongside the change it was supposed to cover. The job runs on `ubuntu-latest` with a 15-minute timeout and `permissions: contents: read`; mirrors `.github/workflows/pr-unit-tests.yml` step-for-step (checkout @ v4, pnpm/action-setup @ v4, actions/setup-node @ v4 with Node 22 + pnpm cache, `pnpm install --frozen-lockfile` with `id: install`, `pnpm run test:eval` guarded by `if: "!cancelled() && steps.install.outcome == 'success'"` in bare-expression form so the YAML survives any future round-trips through tooling that treats double-curly sequences as placeholders). No `${ }` placeholders introduced; no secrets required. Adds `"test:eval": "vitest run src/features/generationContracts/evalFixtures"` to `package.json` directly under the existing `test:unit:*` block — scopes the merge gate to the harness directory rather than the full Vitest suite so the required check stays fast and the failure surface stays actionable, and gives local iteration on a fixture or schema bump a single command. Adds a fifth bullet to the *Eval fixture policy* section in `src/features/generationContracts/AGENTS.md` codifying the CI merge gate: names the workflow file, the `pnpm run test:eval` invocation, enumerates the four path-filter categories canonically, and states the contract verbatim — *“A change to any of these surfaces MUST land alongside the matching fixture updates in the same PR or the gate fails red.”* — so future agents reading the module's own boundary doc see the rule alongside the existing fixture-policy bullets. The existing `pr-unit-tests.yml` job (path filter `'src/**'`) continues to run the full Vitest suite (which includes the harness) on every src-touching PR; this gate is additive and narrows the required-check scope to the subset of paths where a green eval is the explicit Phase 0 acceptance criterion, giving a faster, more targeted required check that the user can promote to a branch-protection requirement without forcing the full Vitest suite to also be required. Branch-protection wiring (turning *Eval Gate / Golden Eval Harness* into a *required* status check on `main`) is a workspace-admin action against the branch protection ruleset, not a code change — once this PR is green and merged the user can promote it via repo settings. Phase 0 step 12 (prompt-quality pass) is intentionally NOT in this PR; it will fire this gate automatically when the manual user patches to the MCP-write-blocked prompt-builder files (`buildTopicTheoryMessages.ts`, `buildTopicStudyCardsMessages.ts`, `buildTopicMiniGameCardsMessages.ts`, `buildTopicExpansionCardsMessages.ts`, `buildCrystalTrialMessages.ts`, `promptBlocks.ts`, Subject Graph topic-lattice + prerequisite-edges builders) land. Pure CI addition; zero source-tree edits; existing `pr-unit-tests.yml` and `e2e-headless-ci.yml` untouched; the new script delegates to the same Vitest binary already used by `test:unit:run`. Phase 0 acceptance criterion *“Eval CI is a merge gate on prompt/schema/model changes.”* is satisfied. Zero MCP-write-blocked files touched.
- [x]  **Step 12.** Prompt-quality pass — landed in [PR #52](https://github.com/littlething666/abyss-engine/pull/52) (open, stacked on `feat/durable-generation-contracts-phase0-step11`). Updates all seven durable pipeline `.prompt` templates under `src/prompts/` (`topic-theory-syllabus`, `topic-study-cards`, `topic-mini-game-cards`, `topic-expansion-cards`, `crystal-trial`, `subject-graph-topics`, `subject-graph-edges`) with final *Before emitting JSON, verify* checklists and tightened prose lockstep with the Phase 0 step 9 semantic validators and step 10 golden eval harness: theory syllabus (web-search grounding, no in-text citations in JSON, ASCII/LaTeX rules, envelope keys, syllabus buckets); study / expansion / mini-game cards (pool sizes, per-shape field rules, duplicate concept stems, mini-game playability by `gameType`); Crystal Trial (exact question count, ordered `trial-q*` ids, categories, pairwise-distinct options, mandatory coverage of every source card via `sourceCardSummaries`); subject-graph topics (tier multiset vs `{{maxTier}}` / `{{topicsPerTier}}`, icon allowlist, id/title uniqueness, learning objectives vs titles); subject-graph edges (key coverage for tier 2/3 lattice ids, tier constraints on prerequisite targets, no self-loops, no duplicate `(source, target)` including differing `minLevel`). Expansion prompts add an explicit difficulty 2–4 rubric (apply vs analyze vs synthesize). Stage B `correctPrereqEdges` deterministic repair in [AGENTS.md](http://agents.md/) remains unchanged. Authoritative copy-paste patch specification for agents blocked on `{{}}` MCP edits: [Phase 0 Step 12 — Concrete Prompt-Quality Patches](https://www.notion.so/phase0-step12.md). `pnpm run test:eval` and `pnpm run test:unit:run` green on the prompt changes.

### Phase 0.5 — Generation Client seam

- [x]  **Step 1.** `IGenerationRunRepository` contract — landed in [PR #53](https://github.com/littlething666/abyss-engine/pull/53) (draft, stacked on `feat/durable-generation-contracts-phase0-step12`). Extends `src/types/repository.ts` with the durable-generation contract types: `PipelineKind` (the four Workflow classes — `topic-content`, `topic-expansion`, `subject-graph`, `crystal-trial`), `CancelReason` (`'user' | 'superseded'` with the locked `cancel-acknowledged ≠ cancelled` semantics), `TopicContentRunInputSnapshot` (local union of the three already-public Topic Content stage snapshots from Phase 0 step 2), `RunInput` (discriminated over `pipelineKind`, carrying subject / topic / level / stage routing context), `JobSnapshot` (mirrors the durable Worker's `jobs` table; `kind` matches the existing `ContentGenerationJobKind` literal union), `RunSnapshot` (top-level run row with `parentRunId` retry lineage and `snapshotJson` carrying the deterministic input snapshot), `RunListQuery` (`status: 'active' | 'recent' | 'all'`), and the seven-method `IGenerationRunRepository` interface (`submitRun` / `getRun` / `streamRunEvents` / `cancelRun` / `retryRun` / `listRuns` / `getArtifact`). JSDoc cites Plan v3 Q16 for cooperative-cancel semantics and Q21 for the *Crystal Trial generation success MUST NOT emit `crystal-trial:completed`* rule. Imports only from `@/features/generationContracts` (the public barrel) and sibling `@/types/*` files. Adds `src/types/repository.boundary.test.ts` enforcing the import surface at the boundary level: every `@/features/*` import must target `@/features/generationContracts`; imports from `@/hooks/*` / `@/components/*` / `@/infrastructure/*` are forbidden; imports referencing the four legacy runner entry points (`runTopicGenerationPipeline`, `runExpansionJob`, the Subject Graph orchestrator, `generateTrialQuestions`) are forbidden anywhere under `src/types/`. Boundary test mirrors the `lucideImportBoundary.test.ts` / `legacyParserBoundary.test.ts` pattern from PRs #43–#44 (fragment literals concatenated at runtime so the test's own source does not self-match). Pure additive contract — zero runtime consumers in this PR; consumers land in steps 2 / 3 / 4.
- [x]  **Step 2.** `LocalGenerationRunRepository` adapter wrapping the existing in-tab runners with per-run `seq`-numbered `RunEvent` synthesis, idempotency-key dedupe, cooperative cancel, and retry lineage. Landed on branch `feat/durable-generation-client-phase0_5-step1` (PR #53 stack).
    - [x]  **Step 2a.** Adapter scaffold + state machinery — landed in commit `af190d4` on `feat/durable-generation-client-phase0_5-step1` ([PR #53](https://github.com/littlething666/abyss-engine/pull/53)). Adds `src/infrastructure/repositories/LocalGenerationRunRepository.ts` implementing `IGenerationRunRepository` with: per-run monotonic `seq` ring buffer (200-event cap) of `RunEvent`s, 24h idempotency-key dedupe with lazy expiry sweep, cooperative cancel emitting `run.cancel-acknowledged` immediately and terminal `run.cancelled` once the dispatcher promise settles (Plan v3 Q16), retry minting a fresh `runId` with `parentRunId` lineage and the same `inputHash`, topic-expansion supersession that cancels the prior in-flight run with reason `'superseded'` before starting the replacement (Plan v3 Q21 supersession semantics; the prior `Map<string, AbortController>` in `eventBusHandlers.ts` migrates here), per-run `AbortController` forwarded to the legacy runner via `LocalRunnerInvocation.signal`, structured failure on dispatcher exception (`llm:upstream-5xx`), artifact persistence keyed by minted `artifactId` with full `ArtifactEnvelope` round-trip via `getArtifact`, and a `streamRunEvents(runId, lastSeq?)` async iterator that replays buffered events with `seq > lastSeq`, then yields live events through a subscriber-callback queue, terminating on `run.completed` / `run.failed` / `run.cancelled`. The four legacy runner adapters are reached through an injectable `LocalRunnerDispatchers` seam (`{ topicContent, topicExpansion, subjectGraph, crystalTrial }: LocalRunnerDispatch`) so this commit imports zero legacy runner entry points and the state machinery is fully testable against fakes. Public seam types exported: `LocalRunnerOutcome` (`success` with artifacts[] | `failure` with structured `GenerationFailureCode` + message | `cancelled`), `LocalRunnerInvocation` (runId, input, `emitProgress` for `stage.progress` events, `signal`), `LocalRunnerDispatch`, `LocalRunnerDispatchers`, `LocalGenerationRunRepositoryDeps` (deviceId, now, dispatchers, optional `supersessionKey` override). Default `supersessionKey` returns `'te:${subjectId}:${topicId}'` for `topic-expansion` and `undefined` for everything else. Distributed-Omit type trick (`type RunEventBody<T extends RunEvent = RunEvent> = T extends T ? Omit<T, 'runId' | 'seq' | 'ts'> : never`) preserves discriminant-specific fields when emitting events. `crypto.randomUUID()` mints `runId` and `artifactId`; `inputHash` is computed from `input.snapshot` via `@/features/generationContracts`. Adds 11-test suite in `LocalGenerationRunRepository.test.ts` covering: `submitRun` returns `runId` with proper deviceId/kind/inputHash; idempotency-key 24h dedupe + post-TTL fresh `runId` (mocked clock); success event sequence (`run.queued` → `run.status:planning` → `run.status:generating-stage` → `stage.progress` → `artifact.ready` → `run.status:ready` → `run.completed`) with persisted `ArtifactEnvelope` round-trip via `getArtifact`; structured `run.failed` with `GenerationFailureCode`; cancel-before-start (terminal `cancelled` with **no** dispatcher invocation, satisfying the *cancel-before-start: no LLM call billed* gate); cancel-mid-dispatch (`cancel-acknowledged` lands before terminal, `run.cancelled` emitted when dispatcher settles via abort-signal-driven outcome); `retryRun` preserves `parentRunId` and dispatches afresh; supersession cancels prior `topic-expansion` with reason `'superseded'`; `streamRunEvents(runId, lastSeq=2)` replays only events with `seq > 2` and yields live until `run.completed`; `listRuns` filters by `status: 'active' | 'recent'`, `kind`, `subjectId`, `topicId`; `getArtifact` throws on unknown id. The `legacyRunnerBoundary.test.ts` scope (`src/**` excluding `LocalGenerationRunRepository.ts`) remains deferred to **Phase 0.5 step 4** until every entry path routes through `GenerationClient` (plan lock).
    - [x]  **Step 2b.** Wire the four real legacy runner adapters (`runTopicGenerationPipeline`, `runExpansionJob`, Subject Graph orchestrator, `generateTrialQuestions`) — **landed in workspace 2026-05-05** (same PR stack target). Adds `createLegacyLocalRunnerDispatchers({ chat, deckRepository, writer })` exporting default `LocalRunnerDispatchers` that call the legacy runners with `AbortSignal`, map terminal outcomes to structured `LocalRunnerOutcome`, and rebuild strict-parseable artifact payloads after success: helper module `src/infrastructure/repositories/localGenerationRunArtifactCapture.ts` (deck/trial reads + `strictParseArtifact` + `contentHash`); topic-content artifacts derived from persisted topic details/cards via `loadTheoryPayloadFromTopicDetails`; topic expansion uses `generatedCards` captured in `runExpansionJob.persistOutput`; subject graph seals Stage A + B (`subject-graph-topics` + `subject-graph-edges`) from orchestrator `lattice` + `graph` (`SubjectGenerationResult` success now includes `lattice`); crystal trial seals questions from `useCrystalTrialStore.getCurrentTrial` after `generateTrialQuestions`. `generateTrialQuestions` accepts optional `signal` → `externalSignal` on the job; `submitRun` awaits async `inputHash` and defers dispatch via `scheduleDispatch` (`setTimeout(0)`) so cooperative cancel-before-start wins over microtask ordering. In-tab subject-graph runs require `snapshot.pipeline_kind === 'subject-graph-topics'` (edges-only snapshots fail with `precondition:missing-topic` until Worker routing). Tests updated for macrotask deferral where dispatch must be observable.
- [x]  **Step 3.** `GenerationClient` facade — singleton with `start*` / `cancel` / `retry` / `observe` / `listActive` / `listRecent` surface, snapshot-builder dispatch, and default Idempotency-Key derivation — landed in workspace 2026-05-05. Adds `src/features/contentGeneration/generationClient.ts`: `createGenerationClient({ deviceId, now, flags, localRepo, durableRepo })` delegates to `localRepo` unless `flags.durableRuns`, typed `TopicContentStartInput` / `SubjectGraphStartInput` / `TopicExpansionStartInput` / `CrystalTrialStartInput` → canonical builders (`buildTopicTheorySnapshot`, `buildTopicStudyCardsSnapshot`, `buildTopicMiniGameCardsSnapshot`, `buildTopicExpansionSnapshot`, `buildSubjectGraphTopicsSnapshot` | `buildSubjectGraphEdgesSnapshot`, `buildCrystalTrialSnapshot`), default keys `tc:|te:|sg:|ct:` + `await inputHash(snapshot)` per plan §3.3, `registerGenerationClient` / `getGenerationClient` module singleton (throws if unset). Barrel exports from `src/features/contentGeneration/index.ts`. Tests in `generationClient.test.ts` (submit delegations, flag routing, idempotency shapes, stream/list parity). Call-site routing remains **Phase 0.5 step 4**.
- [x]  **Step 4.** Route generation entry paths through `GenerationClient` — **landed in workspace 2026-05-05** for all runtime dispatch sites that previously called the four legacy runners directly: `src/infrastructure/eventBusHandlers.ts` (`topic-content:generation-requested`, `subject-graph:generation-requested`, `crystal-trial:pregeneration-requested`, `crystal:leveled` expansion branch, `card:reviewed` cooldown regeneration, `pubSubClient` `topic-cards:updated`), `src/features/contentGeneration/retryContentGeneration.ts` (job + pipeline retries via `submitRun` + explicit `retry:*` idempotency keys), and `src/components/AbyssCommandPalette.tsx` (failed/cooldown trial regeneration). Adds `src/features/contentGeneration/prepareGenerationRunSubmit.ts` (deck-backed `RunInput` assembly + snapshot builders), extends `RunInput` in `src/types/repository.ts` with narrow `*LegacyOptions` bags consumed only by `LocalGenerationRunRepository` dispatchers (`topicContentLegacyOptions` including `legacyStage` / `forceRegenerate` / `retryContext` / `resumeFromStage` / `miniGameKindsOverride`; `topicExpansionLegacyOptions`; `subjectGraphLegacyOptions.orchestratorRetryOf`; `crystalTrialLegacyOptions.retryOf`), fixes topic-content dispatcher defaults (`forceRegenerate` now defaults **false** when legacy options omitted; matches `runTopicGenerationPipeline`), adds `crystalTrialChat` override to `createLegacyLocalRunnerDispatchers`, and adds `GenerationClient.submitRun` + default per-pipeline idempotency-key derivation in `generationClient.ts`. Browser bootstrap: `src/infrastructure/wireGenerationClient.ts` (`ensureGenerationClientRegistered` + `abyss.deviceId` localStorage mint) invoked at the top of the `eventBusHandlers` registration block so `getGenerationClient()` is always defined before any listener runs. **Deferred (same plan §4.3–4.4 / step 7):** `useContentGenerationLifecycle.ts` / `useContentGenerationHydration.ts` durable-flag branches (no `NEXT_PUBLIC_DURABLE_RUNS` wiring yet) and `legacyRunnerBoundary.test.ts` (still deferred per plan lock until every path is verified in CI).
- [x]  **Step 5.** Feature-owned `ArtifactApplier`s for `topic-content`, `topic-expansion`, `subject-graph`, `crystal-trial` plus the `applied_artifacts` Dexie dedupe store — **landed in workspace 2026-05-05**. Adds `src/features/generationContracts/artifacts/applier.ts` (shared `ArtifactApplier` / `ArtifactApplyContext` / `AppliedArtifactsStore` / `AppliedArtifactRecordScope`), `src/features/contentGeneration/appliers/topicContentApplier.ts` (composite applier for `topic-theory` / `topic-study-cards` / `topic-mini-game-*`; canonical→deck Card conversion; `deckWriter.upsertTopicDetails` / `upsertTopicCards` / `appendTopicCards`), `src/features/contentGeneration/appliers/topicExpansionApplier.ts` (`topic-expansion-cards` via `deckWriter.appendTopicCards`; supersession uses `topicExpansionTargetLevel` + `getLatestTopicExpansionScope` / scoped Dexie rows — stale same-level expansion returns `reason: 'superseded'`), `src/features/subjectGeneration/appliers/subjectGraphApplier.ts` (composite applier for Stage A `subject-graph-topics` → `deckWriter.upsertGraph` with node merge + Stage B `subject-graph-edges` → prerequisite wiring; Stage B gates on `subjectGraphLatticeContentHash` present in dedupe store), `src/features/crystalTrial/appliers/crystalTrialApplier.ts` (`crystal-trial` → `useCrystalTrialStore.setTrialQuestions` + `setCardPoolHash`; pregen-status gate; NEVER emits `crystal-trial:completed`), and `src/infrastructure/repositories/appliedArtifactsStore.ts` (Dexie `abyss-applied-artifacts` **v2** with `topicScopeKey` index, `getLatestTopicExpansionScope`, 500-row hygiene cap). All four applier public APIs exported via their feature barrels (`contentGeneration/index.ts`, `crystalTrial/index.ts`, `subjectGeneration/index.ts`) and `generationContracts/index.ts` re-exports the shared interface types. Unit tests (5 test files, 40+ cases) green. **`generationRunEventHandlers` composition root (step 6) must pass `topicExpansionTargetLevel` and `subjectGraphLatticeContentHash` from the active run snapshot when invoking appliers.**
- [x]  **Step 6.** `src/infrastructure/generationRunEventHandlers.ts` composition root: typed `RunEvent → AppEventMap` adapter + applier composition — **landed in workspace 2026-05-05**. Adds `src/infrastructure/generationRunEventHandlers.ts` (the sanctioned durable-run composition root per the AGENTS.md amendment; `createGenerationRunEventHandlers({ client, appliers, eventBus, dedupeStore, deckRepository })` returns `{ observeRun(runId, runInput), stop() }`; `observeRun` opens the RunEvent stream via `client.observe(runId)`, fetches artifacts on `artifact.ready` and applies them through the appropriate feature-owned applier — idempotent by `contentHash` via `AppliedArtifactsStore` — and fires legacy `AppEventBus` events on `run.completed`/`run.failed`/`run.cancelled` matching today's runner emissions so `eventBusHandlers.ts` listeners continue to work; `crystal-trial:completed` is NEVER emitted from question generation success per Plan v3 Q21; superseded topic-expansion cancellation suppresses player-facing failure copy; subject-graph `run.failed` with validation codes routes to `subject-graph:validation-failed` vs generic `subject-graph:generation-failed`; `buildApplyContext` derives `topicExpansionTargetLevel` and `subjectGraphLatticeContentHash` from the active run snapshot for the respective appliers) and `src/infrastructure/generationRunEventHandlers.test.ts` (12 tests: topic-content completion + failure, topic-expansion completion + failure + superseded silence, subject-graph topics + edges + validation-fail routing, crystal-trial apply + no `crystal-trial:completed` + failure, duplicate/idempotency, stop() halts in-flight loops, missing-stage-a for subject-graph edges, unknown artifact kind log-and-continue, artifact fetch failure log-and-continue). Extends `GenerationClient` interface with `listRuns(query: RunListQuery)` and `getArtifact(artifactId: string)` (delegates to `repo().listRuns` / `repo().getArtifact`) so the composition root can discover run state and fetch artifact envelopes without direct repository access. Zero MCP-write-blocked files touched.
- [x]  **Step 7.** `NEXT_PUBLIC_DURABLE_RUNS` flag, app-boot bootstrap, and `deviceId` minting — **landed in workspace 2026-05-05**. Extends `src/infrastructure/wireGenerationClient.ts` to create and wire the `GenerationRunEventHandlers` instance post-client-registration (appliers: `createTopicContentApplier`, `createTopicExpansionApplier`, `createSubjectGraphApplier`, `createCrystalTrialApplier`; dedupe store: `appliedArtifactsStore`; event bus: `appEventBus`; deck: `deckRepository`). Exports `observeGenerationRun(runId, runInput)` — a no-op when `NEXT_PUBLIC_DURABLE_RUNS` is OFF (legacy in-tab runners still own store writes and event emission), activated when the flag is ON for Phase 1+. Wires `observeGenerationRun` into all six `submitRun` call sites in `src/infrastructure/eventBusHandlers.ts` (`topic-content:generation-requested`, `subject-graph:generation-requested`, `crystal-trial:pregeneration-requested`, `crystal:leveled` expansion branch, `card:reviewed` cooldown regeneration, `pubSubClient` `topic-cards:updated`). `deviceId` minting already existed in `wireGenerationClient.ts` (`readOrMintDeviceId`, localStorage key `abyss.deviceId`); `DurableGenerationRunRepositoryStub` already existed as `unreachableDurableRepo` throwing `'Durable generation runs are not wired in this build'` for every method. No `src/app/_bootstrap/wireGeneration.ts` or `src/infrastructure/identity/deviceId.ts` separate files needed — the existing `wireGenerationClient.ts` already serves as the single app-boot bootstrap. Deferred to Phase 1: `useContentGenerationLifecycle.ts` / `useContentGenerationHydration.ts` durable-flag branches and `legacyRunnerBoundary.test.ts`. Zero MCP-write-blocked files touched.

### Phase 1 — Durable orchestrator + Crystal Trial pilot

Last updated: 2026-05-05. PRs are stacked on `feat/durable-generation-client-phase0_5-step1`.

- [x] **PR-A (`backend/` skeleton).** Workspace scaffold, `wrangler.toml`, `tsconfig.json` with `@contracts/*` path-mapping, minimal Hono app (`GET /health` + 404 catch-all), `Env` type, Vitest config, CI workflow (`backend-ci.yml`). All 2 smoke tests green; root 182-file / 1686-test suite unchanged. **Landed in workspace 2026-05-05.**
- [x] **PR-B (Supabase schema).** Landed in workspace 2026-05-05. Adds `migrations/0001_init.sql` (full schema: devices, runs, jobs, events, artifacts, usage_counters + `allocate_event_seq`, `increment_runs_started`, `record_tokens` RPC functions + all Phase 1 indexes) and `migrations/0002_indexes.sql` (placeholder for future indexes). Adds `backend/src/repositories/` with shared types (`types.ts`), Supabase client factory (`supabaseClient.ts`), and four repos (`devicesRepo`, `runsRepo`, `artifactsRepo`, `usageCountersRepo`) bundled via `makeRepos(env)` barrel. 18 unit tests against manual DI mock clients (no `vi.mock` needed). Root 1706-test suite + 254 eval tests green.
- [x] **PR-C (HTTP surface, no workflow yet).** Landed in workspace 2026-05-05. Adds full Hono API surface: `POST /v1/runs` (cache-hit path works, Workflow creation stubbed), `GET /v1/runs`, `GET /v1/runs/:id`, `POST /v1/runs/:id/cancel` (cooperative cancel with `requestCancel` repo method), `POST /v1/runs/:id/retry`, `GET /v1/runs/:id/events` (SSE replay of persisted events, live tail stubbed), `GET /v1/artifacts/:id`, `PUT /v1/settings` (Phase 1 mirror). Middleware chain: CORS → device-id (UUID validation + devices upsert) → idempotency (POST /v1/runs only). Budget guard (minimal Phase 1 caps: 10 runs/day, 500K tokens/day) returns 429 before run creation. Added `findByIdempotencyKey` and `requestCancel` to `IRunsRepo`. 22 tests pass, 1 skipped (idempotency integration test needs mock Supabase). Root 1708-test suite + 254 eval tests green.
- [x] **PR-D (Workflow class).** Landed in workspace 2026-05-05. Adds `CrystalTrialWorkflow` extending `WorkflowEntrypoint` with all six steps (plan → generate → parse → validate → persist → ready), cooperative cancel via `checkCancel` before every boundary, `WorkflowFail`/`WorkflowAbort` error classes, server-side `openrouterClient.callCrystalTrial` (strict `json_schema` + response-healing plugin), `budgetGuard.assertBelowDailyCap` (10 runs/day, 500K tokens/day), `[build]` esbuild alias for `@contracts`, and `cloudflare:workers` type integration. Parse step carries `@ts-expect-error` for `Serializable<Record<string, unknown>>` constraint (safe at runtime — DB stores `jsonb`). 15 new tests (7 budget guard + 8 openrouter client) all green. Root 186 files / 1723 tests + 254 eval tests green.
- [x] **PR-E (Frontend wiring).** Landed in workspace 2026-05-05. Adds `src/infrastructure/http/apiClient.ts` (base fetch wrapper with `X-Abyss-Device` header, JSON request/response, timeout handling, and `ApiError` class), `src/infrastructure/http/sseClient.ts` (SSE stream client: opens `GET /v1/runs/:id/events`, parses SSE frames into typed `RunEvent`s via `rowToRunEvent` normalizer that handles Worker-side column naming, supports `Last-Event-ID` / `lastSeq` resumption), and `src/infrastructure/repositories/DurableGenerationRunRepository.ts` (implements `IGenerationRunRepository` against the Hono Worker API — `submitRun` sends `POST /v1/runs` with `Idempotency-Key` header, `streamRunEvents` delegates to `openSseStream`, `cancelRun` POSTs `/:id/cancel`, `retryRun` POSTs `/:id/retry`, `listRuns` parses Worker `{ runs: [...] }` response, `getArtifact` returns inline `ArtifactEnvelope` from `GET /v1/artifacts/:id`; normalises Worker column names to camelCase client types via `workerRunToSnapshot` and `mapWorkerJobStatus`). Updates `src/infrastructure/wireGenerationClient.ts` to replace the `unreachableDurableRepo` stub with a real `DurableGenerationRunRepository` when both `NEXT_PUBLIC_DURABLE_RUNS` and `NEXT_PUBLIC_DURABLE_GENERATION_URL` are configured (fallback stub preserved for builds where the Worker is unreachable). `ApiClient` interface now exposes `baseUrl` and `deviceId` as read-only fields for SSE wiring. Adds `src/features/generationContracts/durableGenerationBoundary.test.ts` enforcing that features, components, and hooks NEVER import `DurableGenerationRunRepository`, `@/infrastructure/http/apiClient`, or `@/infrastructure/http/sseClient` directly — only `wireGenerationClient.ts` is allowlisted. All 186 existing test files (1716 tests) continue to pass.
- [x] **PR-F (Hydration + lifecycle).** Landed in workspace 2026-05-05. Rewrites `useContentGenerationHydration` with backend-driven hydration: fetches active durable runs from the Worker via `client.listActive()`, reconstructs `RunInput` from each run's `snapshotJson`, and calls `handlers.observeRun()` to open SSE event streams, apply artifacts through the idempotent `AppliedArtifactsStore` (dedupe by `contentHash`), and fire legacy AppEventBus events. Patches `useContentGenerationLifecycle` with explicit documentation that backend-routed (durable) runs naturally skip abort — `DurableGenerationRunRepository` never registers `AbortController` instances in the content generation store, so `beforeunload` abort only touches local-run controllers. Demotes `contentGenerationLogRepository` JSDoc to *UI read-cache only* (the Dexie `abyss-content-generation-logs` store is no longer authoritative for generation run state). Adds `src/utils/consumeAsync.ts` utility with cooperative cancellation (returns `[stop, done]` tuple). Extends `GenerationRunEventHandlers` interface with `getLastAppliedSeq(runId)` for resumable hydration tracking and monotonic per-run seq recording in the `observeRun` event loop. Exports `getGenerationRunEventHandlers()` and `isDurableRunsEnabled()` from `wireGenerationClient.ts` for hydration hook access. 25 new/updated tests across `generationRunEventHandlers.test.ts` (3 new seq-tracking tests) and `consumeAsync.test.ts` (7 tests) all green. Root 139 files / 1448 tests + 254 eval tests green.
- [x] **PR-G (E2E + cancel + SSE-resume tests).** **Landed in workspace 2026-05-05.**
  - **Backend cancel race tests** (`backend/src/routes/runs.cancel.test.ts`, 4 tests): cancel-before-start (queued → 200 cancel_acknowledged), cancel-after-completion (terminal → 409), device-ownership enforcement (404 for different device), cancel-mid-stage (generating_stage → 200). All mocked at the Supabase client layer via `vi.doMock('@supabase/supabase-js')` with per-test fake query-builder chains; full middleware → route → repo integration coverage.
  - **Backend SSE resume tests** (`backend/src/routes/runEvents.sse.test.ts`, 5 tests): correct SSE Content-Type + cache headers, Last-Event-ID header replays only `seq > lastSeq` events, `?lastSeq=` query parameter parity, 404 on device-ownership mismatch, keepalive comment emitted for active runs.
  - **Frontend SSE client unit tests** (`src/infrastructure/http/sseClient.test.ts`, 11 tests): single/multi-event frame parsing, keepalive comment suppression, `artifact.ready` payload normalization (including `run.artifact-ready` alias), `run.cancel-acknowledged` / `run.cancelled` / `superseded` reason routing, `run.failed` failure-code mapping, non-200 HTTP error handling, Last-Event-ID header forwarding, and AbortSignal propagation. Also fixes `openSseStream` to flush the remaining buffer on stream end (trailing blank-line termination).
  - **OpenRouter request-shape lockstep test** (`src/infrastructure/llm/openrouterRequestShapeLockstep.test.ts`, 7 tests): asserts shared core body keys match (model, messages, response_format, plugins), response_format uses `json_schema` (not `json_object`), plugins shape identical when healing is on/off, browser excludes server-only `usage` field, Worker includes `usage.include`, and neither client sets `stream: true` for pipeline calls. Snapshots the Worker's `callCrystalTrial` canonical shape against the browser's `HttpChatCompletionsRepository` expected keys.
  - **E2E tab-close spec** (`tests/crystal-trial/durable-tab-close.spec.ts`, 2 tests): tab-close-survival (submit trial generation → close tab → reopen → verify trial status is 'available' or 'cooldown') and cancel-before-start smoke (verify abort controller maps are plumbed to the store). Both skip when `NEXT_PUBLIC_DURABLE_RUNS` is false or the Worker is unreachable, with clear skip messages.
  - **Root test suite**: 191 files / 1753 tests + 254 eval tests green (+4 new test files, +27 new vitest tests vs PR-F). Backend: 6 test files, 46 passed + 1 skipped.

### Phase 2 — Migrate remaining pipelines

- [ ]  Pending.

### Phase 3 — Observability + full budgets

- [ ]  Pending.

### Phase 4 — Productionization + cleanup

- [ ]  Pending.

### MCP-write-blocked files (require manual user patches in later phases)

The agent's GitHub MCP write surface refuses any file containing `{{}}` template strings. The seven `.prompt` template files under `src/prompts/` consumed by `interpolatePromptTemplate()` carry every `var` placeholder in the durable pipeline path — edits require a local editor or agent outside that MCP constraint (Phase 0 step 12 landed in [PR #52](https://github.com/littlething666/abyss-engine/pull/52)):

- `src/prompts/topic-theory-syllabus.prompt`
- `src/prompts/topic-study-cards.prompt`
- `src/prompts/topic-mini-game-cards.prompt`
- `src/prompts/topic-expansion-cards.prompt`
- `src/prompts/crystal-trial.prompt`
- `src/prompts/subject-graph-topics.prompt`
- `src/prompts/subject-graph-edges.prompt`

The TypeScript prompt-builder files originally listed in this section (`buildTopicTheoryMessages.ts`, `buildTopicStudyCardsMessages.ts`, `buildTopicMiniGameCardsMessages.ts`, `buildTopicExpansionCardsMessages.ts`, `buildCrystalTrialMessages.ts`, `promptBlocks.ts`, plus the Subject Graph `topicLattice/buildTopicLatticeMessages.ts` and prerequisite-edges builders) themselves contain **no** `{{}}` tokens and are agent-writable; they are pure interpolation glue calling `interpolatePromptTemplate(template, vars)` against the `.prompt` files above. Phase 0 steps 1–11 never required any `{{}}`-bearing edits and landed entirely through the agent. Step 12 content for the seven `.prompt` files landed in [PR #52](https://github.com/littlething666/abyss-engine/pull/52) via local/IDE edits (GitHub MCP and similar tools still refuse automated writes to files containing `{{}}`). The list was corrected on 2026-05-04; this note updated when step 12 completed.

## Architectural rule

**The backend owns durable execution, authoritative run/artifact/event state, budgets, and server-side model access. The frontend owns intent capture, source-data snapshot submission, visual progress, local read-cache application, and compatibility event emission.**

Browser `CustomEvent`s on the App Event Bus are no longer orchestration for backend-routed generation. They become UI/domain notifications derived from backend `RunEvent`s. Closing the tab must not stop a backend-routed run; reopening the tab must rehydrate progress from the backend and apply artifacts exactly once.

## Architecture amendments now locked

- `[AGENTS.md](http://AGENTS.md)` now authorizes one durable-run composition root: `src/infrastructure/generationRunEventHandlers.ts`.
- That file may import **only feature public APIs** to translate backend `RunEvent`s into local artifact application, legacy App Event Bus notifications, generation HUD state, mentor triggers, and telemetry.
- It must not deep-import feature internals, own generation rules, perform remote I/O directly, or mutate stores except through exported feature actions/appliers.

## Migration risk acknowledged

1. **Today's app is a static-export, browser-owned generation system.** `next.config.mjs` uses `output: 'export'`. Durable generation is not an infra swap; it introduces a backend application boundary with its own contracts, auth posture, budgets, and failure modes.
2. **Live code paths conflict with the target.** `useContentGenerationLifecycle` aborts every in-flight local pipeline/job on `beforeunload`; `useContentGenerationHydration` hydrates only terminal Dexie logs; generation is dispatched through App Event Bus handlers and retry bridges. These must be reshaped, not flag-gated around.
3. **The Worker cannot read browser IndexedDB after tab close.** Durable runs must submit a versioned `RunInputSnapshot` containing every deterministic input required to build prompts and hashes.
4. **Phase 0 must produce shared contracts, not just better in-tab parsing.** Otherwise the backend re-implements prompt builders, schemas, semantic validators, hashes, and failure-code policy.
5. **Provider response healing is a v1 platform decision, not parser recovery.** OpenRouter `response-healing` stays enabled for strict JSON Schema pipeline calls in v1. Downstream parsers must still fail loudly after one Zod/semantic validation pass.

## Decisions locked in

| # | Decision | Implication |
| --- | --- | --- |
| Q1 | Cloudflare-first orchestration; Supabase persistence for v1 | Cloudflare Workflows + Hono Workers execute durable runs. Supabase Postgres stores runs/jobs/events/artifacts/usage. Supabase Storage stores JSON artifacts unless R2 is explicitly selected later. |
| Q2 | Multi-user, no auth yet; persist a `deviceId` per device | Every row scoped by `device_id`. `deviceId` is **not a security boundary**. Future Supabase Auth migration planned from day one. |
| Q3 | Backend portability remains required | Hono stays the API surface. Supabase Postgres is the v1 relational adapter; future self-hosted Postgres should require repository-adapter replacement, not feature rewrites. |
| Q4 | **Hard** durability | Backend orchestrator is in scope from Phase 1. No “in-tab durability” intermediate phase. |
| Q5 | Parse fail-loud; raise generation correctness from ~50% to ≥90% | Reliability hardening gates backend work. Strict `json_schema`; OpenRouter response-healing requested in v1; one strict parse and one semantic validation pass after provider return. |
| Q6 | All four generation surfaces are high-cost and load-bearing | In scope: Subject Graph Generation, Topic Content Pipeline, Topic Expansion, Crystal Trial. Minimal per-device budget guard ships with Phase 1; full observability in Phase 3. |
| Q7 | `input_hash` dedupe acceptable | Artifacts keyed by deterministic `input_hash`; identical input snapshots short-circuit to cached artifact and emit synthetic run events. |
| Q8 | Schemas, validators, prompts, fixtures live in a feature-owned contract module | New `src/features/generationContracts/` consumed through public API by local and backend adapters. No root-level domain module. |
| Q9 | Phase 0 = no durable orchestrator, but backend-ready contracts | `runContentGenerationJob` stops owning parser policy exclusively. Policy moves behind generation-contract public APIs. |
| Q10 | Backend artifacts are authoritative; client applies through explicit appliers | Add feature-owned `ArtifactApplier`s, composed by `src/infrastructure/generationRunEventHandlers.ts`. Idempotent by `content_hash`. |
| Q11 | Existing App Event Bus events stay during migration | Request events route to `GenerationClient`; completion/failure/progress notifications are emitted from durable `RunEvent`s or local synthetic `RunEvent`s. |
| Q12 | Shell/precondition failures become structured run failures | Failure codes include `precondition:*`, `validation:*`, `parse:zod-*`, `llm:*`, `budget:over-cap`, `cancel:*`, `config:*`. |
| Q13 | `'navigation'` abort reason is removed only after full cutover | Keep local abort union while any pipeline can use `LocalGenerationClient`. Remove in Phase 4. |
| Q14 | `RunEvent → AppEventMap` mapper is a typed adapter | Lives behind `generationRunEventHandlers.ts`; coverage tests assert legacy events still fire where semantically correct. |
| Q15 | Budget clock is UTC | `usage_[counters.day](http://counters.day)` is `YYYY-MM-DD` UTC for enforcement; UI may display local time only. |
| Q16 | Cancel is cooperative | `runs.cancel_requested_at`; workflow checks between steps. `cancel_acknowledged` and terminal `cancelled` are distinct. |
| Q17 | Artifact dedupe is per-device for v1 | `(device_id, kind, input_hash)` unique. Global dedupe deferred until auth/threat model is ready. |
| Q18 | Retries preserve run/job lineage | `POST /v1/runs/:id/retry` creates a new run with `parent_run_id`; rerun job carries `retry_of`. |
| Q19 | Supabase is v1 system of record | Worker uses Supabase service-role credentials server-side only. Browser never talks directly to Supabase for generation runs. |
| Q20 | Legacy permissive parsers are deprecated | Strict pipeline parsers replace them for durable surfaces; permissive parsers are marked legacy and removed after Phase 4. |
| Q21 | Crystal Trial generation is not trial completion | Durable Crystal Trial artifact application prepares questions and may trigger availability. It must not emit `crystal-trial:completed`; that remains player assessment completion only. |
| Q22 | OpenRouter response healing remains enabled for v1 pipelines | `response-healing` may be requested together with strict `json_schema`. It is provider-side structured-output support, not downstream parser fallback. |

## Target stack v1

| Layer | Choice | Notes |
| --- | --- | --- |
| Orchestration | Cloudflare Workflows | Durable execution; sleeps/retries survive Worker restarts. One Workflow class per pipeline kind. |
| API gateway | Hono on Cloudflare Workers | Portable HTTP interface. No Next.js API routes while static export remains. |
| State of record | Supabase Postgres | `devices`, `runs`, `jobs`, `events`, `artifacts`, `usage_counters`. Accessed only from Worker/server adapters. Local artifact application remains an IndexedDB read-cache concern. |
| Artifact store | Supabase Storage v1 | JSON artifacts keyed by device/kind/input hash. R2 remains an optional later storage adapter. |
| LLM gateway | Cloudflare AI Gateway → OpenRouter, or Worker → OpenRouter if AI Gateway blocks response-healing | Must preserve strict `json_schema` and OpenRouter `response-healing` for v1 pipeline calls. |
| Live updates | SSE from Worker (`/v1/runs/:id/events`) | Closing SSE never cancels a run. Replays missed events via `Last-Event-ID`. |
| Validation | Zod + OpenRouter `json_schema` strict + semantic validators | Fail-loud after provider return. No broad downstream parsers in durable path. |
| Provider healing | OpenRouter `response-healing` plugin | Enabled for v1 pipelines when configured; logged as requested metadata. No custom healing package in v1. |
| Evals + observability | Golden-set CI + Worker traces | Eval gate on prompt/schema/model changes. Langfuse or equivalent Worker-only tracing in Phase 3. |

## Feature-owned generation contracts

New module:

```txt
src/features/generationContracts/
├── index.ts                         // only public import surface
├── schemas/                         // Zod response schemas per artifact/job kind + version
├── strictParsers/                   // exact JSON + Zod only; no markdown extraction or shape fallback
├── semanticValidators/              // post-parse domain checks
├── prompts/                         // versioned prompt builders + few-shot fixtures
├── snapshots/                       // RunInputSnapshot builders/types/hash inputs
├── artifacts/                       // Artifact types, ArtifactKind, content_hash helpers
├── canonicalHash.ts                 // deterministic input_hash + content_hash
├── failureCodes.ts                  // structured failure codes
├── runEvents.ts                     // RunEvent types
└── evalFixtures/                    // golden set per pipeline
```

Rules:

- Runtime/domain generation logic stays under `src/features/*`.
- Consumers import through `src/features/generationContracts/index.ts`; no cross-feature deep imports.
- The Worker consumes the same source via monorepo build or a published internal package. There is exactly one source of truth.
- Pure data shapes that multiple infrastructure adapters need may also be re-exported from `src/types`, but prompt builders, validators, hash algorithms, and parser behavior stay feature-owned.

## Repository and client seams

Remote I/O contracts live in `src/types/repository.ts`:

```ts
interface IGenerationRunRepository {
  submitRun(input: RunInput, idempotencyKey: string): Promise<{ runId: string }>;
  getRun(runId: string): Promise<RunSnapshot>;
  streamRunEvents(runId: string, lastSeq?: number): AsyncIterable<RunEvent>;
  cancelRun(runId: string): Promise<void>;
  retryRun(runId: string, opts?: { stage?: string; jobId?: string }): Promise<{ runId: string }>;
  listRuns(query: RunListQuery): Promise<RunSnapshot[]>;
  getArtifact(artifactId: string): Promise<ArtifactEnvelope>;
}
```

Concrete adapters:

- `src/infrastructure/repositories/LocalGenerationRunRepository.ts` wraps legacy in-tab runners and synthesizes `RunEvent`s.
- `src/infrastructure/repositories/DurableGenerationRunRepository.ts` calls the Hono Worker.
- `src/features/contentGeneration/generationClient.ts` or equivalent provides the application-facing `GenerationClient` facade.

No feature/component/hook performs direct `fetch` for durable runs.

## `RunInputSnapshot`: the durable input contract

Every durable run submits a snapshot that contains all deterministic prompt-building inputs. The Worker must not infer hidden browser state.

```ts
type RunInputSnapshot =
  | SubjectGraphRunInputSnapshot
  | TopicContentRunInputSnapshot
  | TopicExpansionRunInputSnapshot
  | CrystalTrialRunInputSnapshot;
```

Snapshot rules:

- Includes `snapshot_version`, `pipeline_kind`, `schema_version`, `prompt_template_version`, `model_id`, and all grounding/source data used by the prompt.
- Built in feature code from repository reads before `submitRun`.
- Canonicalized by `canonicalHash`.
- `input_hash = sha256(canonical_json(snapshot))`.
- A model, prompt, schema, or source-data change changes `input_hash`.

Minimum snapshot contents:

| Pipeline | Required snapshot inputs |
| --- | --- |
| Subject Graph Generation | subjectId, checklist, resolved strategy, target lattice dimensions, prompt versions. |
| Topic Content Pipeline | subject title, topic node, learning objective, content strategy/brief, existing topic details/cards needed for skip/resume, grounding policy. |
| Topic Expansion | subject/topic ids, topic title, target Crystal Level, difficulty bucket, theory excerpt, syllabus questions, existing cards/registry, grounding sources, content strategy. |
| Crystal Trial | subject/topic ids, topic title, current/target Crystal Level, card pool snapshot, card pool hash, question count, content brief. |

## Strict parser policy and legacy parser deprecation

### Durable pipeline parser policy

Strict pipeline parsers must:

1. parse exact JSON returned by strict `json_schema` mode;
2. use one Zod schema for the declared artifact/job kind;
3. run one semantic validation pass;
4. fail loudly with a structured failure code;
5. never strip markdown fences, extract embedded JSON, accept multiple shapes, default missing semantic fields, silently drop invalid records, or broaden schemas to accommodate model drift.

### Legacy/deprecated parsers

These existing permissive helpers are explicitly **legacy/deprecated for durable pipeline paths** and must be marked in code during Phase 0 with `@deprecated` comments and tests proving strict paths do not call them:

- `src/lib/llmResponseText.ts` `extractJsonString()` for pipeline parsing.
- `src/features/contentGeneration/parsers/parseTopicCardsPayload.ts`.
- `src/features/contentGeneration/parsers/parseTopicTheoryContentPayload.ts`.
- `src/features/contentGeneration/parsers/parseCrystalTrialPayload.ts`.
- `src/features/subjectGeneration/graph/topicLattice/parseTopicLatticeResponse.ts`.
- Any normalizer that silently reshapes invalid model output for pipeline artifacts.

Allowed temporary use:

- Local legacy runners may continue using deprecated parsers until their pipeline migrates.
- Non-pipeline study explain surfaces may keep permissive display parsing if needed.
- Subject Graph Stage B keeps the [AGENTS.md](http://AGENTS.md) prerequisite-edge deterministic correction exception.

Removal target: Phase 4 deletes legacy in-tab runners and removes permissive parsers from generation pipeline code paths. Any remaining parser must either be strict or explicitly scoped to non-pipeline UI display.

## OpenRouter structured output and response healing policy

For the four generation pipelines:

- `response_format.type` must be `json_schema`.
- `json_schema.strict` must be `true`.
- The bound model must declare `response_format` and `structured_outputs` before a run can reach an LLM call.
- OpenRouter `response-healing` stays enabled for v1 when configured because OpenRouter supports response healing with JSON Schema mode and it avoids building an in-house healing package for v1.
- `response-healing` must be recorded as `providerHealingRequested: true` in job/run metadata and telemetry.
- Provider healing does **not** permit downstream parser fallback. After provider return, strict parser + semantic validator either accept the artifact or fail loudly.

For non-pipeline surfaces:

- Existing `json_object` fallback may remain.
- Existing `openRouterResponseHealing` setting may continue to apply until settings move server-side.

Planned config signature:

```ts
resolveOpenRouterStructuredChatExtrasForJob(surfaceId, {
  jsonSchemaResponseFormat,
  requireJsonSchema: true,
  allowProviderHealing: true,
});
```

Pipeline-bound config without strict JSON Schema support throws at binding/config-validation time, not mid-run.

## Reliability strategy

Worker and local synthetic runs use the same contract pipeline:

```txt
Build RunInputSnapshot
  → canonical input_hash
  → check budget and per-device artifact cache
  → build prompt from generationContracts/prompts
  → call OpenRouter with strict json_schema and response-healing requested
  → strict Zod parse
  → semantic validation
  → persist artifact envelope + content_hash
  → emit artifact_ready/completed RunEvent
  → client artifact applier mutates local read cache exactly once
```

Failure is explicit and terminal at the boundary:

- `config:missing-structured-output`
- `config:missing-model-binding`
- `precondition:no-card-pool`
- `precondition:missing-topic`
- `precondition:empty-grounding`
- `validation:bad-grounding`
- `validation:semantic-*`
- `parse:zod-*`
- `llm:rate-limit`
- `llm:upstream-5xx`
- `budget:over-cap`
- `cancel:user`
- `cancel:superseded`

## Frontend HTTP contract

```txt
POST   /v1/runs                         create run, returns { runId }    (Idempotency-Key header)
GET    /v1/runs/:id                     current run + step states
GET    /v1/runs/:id/events              SSE stream (resumable, Last-Event-ID)
POST   /v1/runs/:id/cancel              cooperative user cancel
POST   /v1/runs/:id/retry               { stage?, jobId? } → new run, parent_run_id
GET    /v1/runs?status=active           hydrate on app boot
GET    /v1/runs?status=recent&limit=N   HUD/history
GET    /v1/artifacts/:id                signed Supabase Storage download URL or artifact JSON envelope
PUT    /v1/settings                     mirror surface bindings + healing flag
```

Every request carries `X-Abyss-Device: <uuid>`. The Worker upserts `devices` and scopes every query by `device_id`.

## Identity model

- On first load the client mints `crypto.randomUUID()` and persists it in `localStorage` as `abyss.deviceId`.
- Worker upserts `devices(id, created_at, last_seen_at, user_id NULL)`.
- All run data is scoped by `device_id`.
- Pre-auth disclaimer: anyone with a device UUID can read that device's generation runs. Acceptable for v1 only and documented in threat model.
- Supabase Auth migration: populate `devices.user_id`, add RLS/auth checks, and allow queries by user-owned devices.

## Supabase data model v1

Supabase Postgres schema, simplified:

```sql
devices (
  id uuid primary key,
  user_id uuid null,
  created_at timestamptz not null,
  last_seen_at timestamptz not null
);

runs (
  id uuid primary key,
  device_id uuid not null references devices(id),
  kind text not null,
  status text not null,
  input_hash text not null,
  idempotency_key text null,
  parent_run_id uuid null,
  cancel_requested_at timestamptz null,
  cancel_reason text null,
  subject_id text null,
  topic_id text null,
  created_at timestamptz not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null,
  snapshot_json jsonb not null
);
create index idx_runs_device_status_created on runs(device_id, status, created_at desc);
create unique index idx_runs_device_idempotency on runs(device_id, idempotency_key) where idempotency_key is not null;

jobs (
  id uuid primary key,
  run_id uuid not null references runs(id),
  kind text not null,
  stage text not null,
  status text not null,
  retry_of uuid null,
  input_hash text not null,
  model text not null,
  metadata_json jsonb null,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null
);
create index idx_jobs_run on jobs(run_id);

events (
  id bigserial primary key,
  run_id uuid not null references runs(id),
  device_id uuid not null references devices(id),
  seq integer not null,
  ts timestamptz not null,
  type text not null,
  payload_json jsonb not null,
  unique(run_id, seq)
);
create index idx_events_run_seq on events(run_id, seq);

artifacts (
  id uuid primary key,
  device_id uuid not null references devices(id),
  created_by_run_id uuid not null references runs(id),
  kind text not null,
  input_hash text not null,
  storage_key text not null,
  content_hash text not null,
  schema_version integer not null,
  created_at timestamptz not null,
  unique(device_id, kind, input_hash)
);

usage_counters (
  device_id uuid not null references devices(id),
  day text not null,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  runs_started integer not null default 0,
  primary key (device_id, day)
);
```

Supabase access rules:

- Worker uses service-role credentials server-side only.
- Browser never receives service-role credentials.
- Pre-auth v1 checks `device_id`; post-auth migration adds Supabase Auth/RLS.

## Idempotency and artifact cache

Two distinct concepts:

- **`Idempotency-Key`** prevents duplicate HTTP submits. Unique `(device_id, idempotency_key)`; same key within 24h returns existing `runId`.
- **`input_hash`** dedupes artifacts from identical snapshots.

```txt
input_hash = sha256(canonical_json(RunInputSnapshot))
content_hash = sha256(canonical_json(ArtifactPayload))
```

Artifact path:

```txt
supabase://generation-artifacts/{deviceId}/{kind}/{input_hash}.json
```

Cache-hit rules:

- Worker checks `artifacts(device_id, kind, input_hash)` before Workflow creation.
- On hit, create a run, emit synthetic events, and reference existing artifact.
- `artifacts.created_by_run_id` records the first producing run.
- Cache-hit increments `runs_started` but not token counters.
- Stage-level checkpoints are required for Topic Content Pipeline and Subject Graph Generation.

## Artifact application

Backend persistence is authoritative, but current UI still expects local stores and IndexedDB deck caches to update. Therefore artifacts apply through explicit appliers.

```ts
interface ArtifactApplier<K extends ArtifactKind> {
  kind: K;
  apply(artifact: Artifact<K>): Promise<{ applied: boolean; reason?: string }>;
}
```

Ownership:

- `src/features/contentGeneration/index.ts` exports Topic Content and Topic Expansion appliers.
- `src/features/subjectGeneration/index.ts` exports Subject Graph applier.
- `src/features/crystalTrial/index.ts` exports Crystal Trial applier.
- `src/infrastructure/generationRunEventHandlers.ts` composes these public APIs with RunEvent transport.

Rules:

- Idempotent by `content_hash`.
- `ArtifactApplier` is the only post-Phase 0.5 path that mutates local stores/deck caches from generation results.
- Local IndexedDB `applied_artifacts` records `content_hash → appliedAt`.
- UI-facing `*:generation-completed` events fire only after local artifact application succeeds.
- Crystal Trial artifact application prepares questions and status; it must not emit `crystal-trial:completed`.

## RunEvent to App Event Bus compatibility

`src/infrastructure/generationRunEventHandlers.ts` maps durable/local synthetic `RunEvent`s to legacy App Event Bus notifications.

Required semantics:

- `topic-content:generation-completed` fires after Topic Content artifact application.
- `topic-content:generation-failed` fires for terminal Topic Content failure.
- `topic-expansion:generation-completed/failed` preserve current mentor/HUD behavior.
- `subject-graph:generated` fires after Subject Graph artifact application.
- `subject-graph:generation-failed` and `subject-graph:validation-failed` preserve stage/job metadata.
- `crystal-trial:generation-failed` fires for question-generation failure.
- `crystal-trial:completed` is **not** mapped from generation success; it remains assessment completion.

## Cooperative cancel and supersession

Cancel is best-effort, not a kill switch.

1. User cancel: `POST /v1/runs/:id/cancel` writes `runs.cancel_requested_at`, `cancel_reason='user'`.
2. System supersession: expansion replacement writes `cancel_reason='superseded'` through an internal Worker endpoint/action.
3. Worker emits `cancel_acknowledged` immediately.
4. Workflow checks cancellation before every step boundary.
5. Already-started LLM calls may complete; artifact is discarded if cancellation won the race.
6. Terminal `cancelled` event fires when workflow stops.
7. Superseded expansion cancellation must not produce player-facing failure mentor copy.

Tests cover cancel-before-start, cancel-mid-stage, cancel-after-completion, and superseded expansion.

## Hydration replacement

`useContentGenerationHydration` becomes:

```ts
useContentGenerationHydration() {
  // 1. ensure deviceId
  // 2. GET /v1/runs?status=active
  // 3. open SSE from last known seq for each active run
  // 4. GET /v1/runs?status=recent&limit=N for HUD/history
  // 5. apply RunEvents through generationRunEventHandlers
}
```

Dexie `abyss-content-generation-logs` is demoted to a UI read-cache. Its 15-job cap stays for hygiene but is no longer authoritative.

## State machine

```txt
QUEUED
  → PLANNING            // validate snapshot, budget, cache, preconditions
  → GENERATING_STAGE    // strict json_schema call; OpenRouter response-healing requested when enabled
  → PARSING             // exact JSON + Zod
  → VALIDATING          // semantic validators
  → PERSISTING          // Supabase Storage + Postgres artifact row
  → READY               // artifact ready for client application
  → APPLIED_LOCAL       // client-side read-cache/store application succeeded (client event/cache state)
  → FAILED_FINAL        // structured failure code
  → CANCELLED           // after cancel_acknowledged
```

Every backend transition writes one `events` row with monotonic `seq`. SSE replays from `seq`.

## Phased migration

### Phase 0 — Reliability hardening + shared contracts. Blocks backend orchestration.

1. Create `src/features/generationContracts/` with public `index.ts`.
2. Add `RunInputSnapshot` builders and canonical hash test vectors for all four pipelines.
3. Add strict Zod schemas and strict parsers for every pipeline job/artifact kind:
   - `subject-graph-topics`
   - `subject-graph-edges`
   - `topic-theory`
   - `topic-study-cards`
   - all topic mini-game kinds
   - `topic-expansion-cards`
   - `crystal-trial`
4. Mark existing permissive parsers/helpers as legacy/deprecated for pipeline paths.
5. Add `requireJsonSchema` and `allowProviderHealing` options to `resolveOpenRouterStructuredChatExtrasForJob`.
6. Enforce strict JSON Schema support for pipeline-bound surfaces at config validation time.
7. Keep OpenRouter `response-healing` enabled for v1 pipelines when configured; record `providerHealingRequested` metadata.
8. Remove pipeline reliance on `json_object` fallback.
9. Add semantic validators: card pool size, difficulty distribution, grounding, duplicate concepts, mini-game playability, Crystal Trial question count, Subject Graph lattice/edge rules.
10. Build golden eval harness: 30–50 fixtures per pipeline, including parse-fail and semantic-fail fixtures.
11. Wire eval CI as a merge gate for prompt/schema/model changes.
12. Prompt-quality pass: tighter system prompts, in-prompt constraints, few-shots, explicit checklist.

Exit criteria:

- Golden set ≥90% pass rate per pipeline.
- No pipeline surface emits or requests `metadata.structuredOutputMode === 'json_object'`.
- Pipeline-bound model config without `structured_outputs` fails before LLM call.
- Provider healing is requested only as explicit OpenRouter plugin metadata, not parser fallback.
- Deprecated parser tests prove durable strict paths do not call legacy parsers.

### Phase 0.5 — Generation Client seam and local synthetic RunEvents.

1. Add `IGenerationRunRepository` to `src/types/repository.ts`.
2. Implement `LocalGenerationRunRepository` around existing in-tab runners; synthesize seq-numbered `RunEvent`s.
3. Implement feature-level `GenerationClient` facade.
4. Route **all** generation entry paths through `GenerationClient`:
   - `topic-content:generation-requested`
   - `subject-graph:generation-requested`
   - `crystal-trial:pregeneration-requested`
   - Crystal Trial cooldown regeneration
   - card-pool invalidation regeneration from `topic-cards:updated`
   - level-up Topic Expansion
   - `retryContentGeneration.ts` job and pipeline retry paths
5. Implement `src/infrastructure/generationRunEventHandlers.ts` with typed `RunEvent → AppEventMap` adapter and artifact applier composition.
6. Add feature-owned Artifact Appliers and route legacy in-tab final writes through them.
7. Add `NEXT_PUBLIC_DURABLE_RUNS`, default off.

Exit criteria:

- Zero app paths directly call `runTopicGenerationPipeline`, Subject Graph orchestrator, `generateTrialQuestions`, or `runExpansionJob` except inside `LocalGenerationRunRepository`.
- `ArtifactApplier` is the only path that mutates local stores/deck caches from generation results.
- Adapter tests prove legacy event semantics, including no false `crystal-trial:completed` on question generation.

### Phase 1 — Durable orchestrator skeleton + Crystal Trial pilot.

1. Stand up Hono Worker, Cloudflare Workflow class for `crystal-trial`, Supabase Postgres schema, Supabase Storage bucket, and server-side OpenRouter access.
2. Implement minimal per-device budget guard before Workflow creation:
   - daily run count cap;
   - conservative estimated token cap;
   - `budget:over-cap` returns `429` before Workflow creation.
3. Implement `DurableGenerationRunRepository`.
4. Implement Crystal Trial `RunInputSnapshot`, strict schema, semantic validator, artifact persistence, and artifact applier.
5. Rewrite `useContentGenerationHydration` to query active/recent durable runs and reopen SSE streams.
6. SSE supports `Last-Event-ID`; client suppresses duplicates by `seq` and applier suppresses duplicates by `content_hash`.
7. Idempotency-Key test: same key returns existing `runId`.
8. Cooperative cancel end-to-end with race tests.
9. `useContentGenerationLifecycle` becomes no-op for backend-routed runs only. Keep `'navigation'` for local runs.
10. Crystal Trial success prepares questions and preserves existing availability watcher behavior; it does not emit `crystal-trial:completed`.

Exit criteria:

- Start Crystal Trial generation, close tab, wait for completion, reopen app.
- App rehydrates active/recent run, applies questions exactly once, and mentor availability behavior remains correct.
- Minimal budget guard blocks over-cap requests before Workflow creation.

### Phase 2 — Migrate remaining pipelines.

One pipeline per PR behind `NEXT_PUBLIC_DURABLE_RUNS`:

1. Topic Content Pipeline with stage-level checkpoints: theory → study-cards → mini-games.
2. Topic Expansion, including superseded expansion cancellation semantics.
3. Subject Graph Generation: Topic Lattice then Prerequisite Edges; edges `input_hash` includes lattice artifact hash.

Exit criteria per pipeline:

- Snapshot determinism tests.
- Strict schema/semantic validation tests.
- Artifact apply idempotency tests.
- Legacy App Event Bus compatibility tests.
- Retry lineage tests.

### Phase 3 — Observability + full budgets.

1. Worker-only tracing (Langfuse or equivalent) for every LLM call with `device_id`, `run_id`, `job_id`, model, prompt version, schema version, input hash, output hash, and provider-healing requested flag.
2. Token accounting from provider metadata.
3. Full per-device daily budget enforcement using UTC `usage_[counters.day](http://counters.day)`.
4. Failure dashboard by pipeline, model, prompt version, schema version, and failure code.
5. Settings endpoint persists model bindings and OpenRouter response-healing preference server-side per device.

### Phase 4 — Productionization + cleanup.

1. CORS allowlist for production domains.
2. Threat-model doc covering pre-auth `deviceId`, Supabase service role, artifact URLs, and auth migration.
3. Supabase Storage retention/lifecycle policy.
4. Remove `'navigation'` from `ContentGenerationAbortReason` after all four pipelines are backend-routed.
5. Delete `LocalGenerationRunRepository` and legacy in-tab runners.
6. Remove deprecated permissive parsers from generation pipeline code paths.
7. Remove client-side `openRouterResponseHealing` ownership after server-side settings are authoritative.
8. Plan Supabase Auth migration from `deviceId` to `user_id`.

## What changes in the existing codebase

- **New:** `src/features/generationContracts/` — strict schemas, parsers, validators, prompt builders, snapshots, hashes, failure codes, run events, eval fixtures.
- **New:** `src/infrastructure/generationRunEventHandlers.ts` — sanctioned durable-run composition root.
- **New:** `src/infrastructure/repositories/LocalGenerationRunRepository.ts`.
- **New:** `src/infrastructure/repositories/DurableGenerationRunRepository.ts`.
- **Updated:** `src/types/repository.ts` — `IGenerationRunRepository` and generation run data contracts.
- **Updated:** `src/infrastructure/llmInferenceSurfaceProviders.ts` — `requireJsonSchema`, `allowProviderHealing`, strict config failure.
- **Updated:** existing parsers — marked `@deprecated` for pipeline paths; strict replacements introduced.
- **Updated:** `src/infrastructure/eventBusHandlers.ts` — generation request paths route through `GenerationClient`.
- **Updated:** `src/features/contentGeneration/retryContentGeneration.ts` — retries route through `GenerationClient`.
- **Updated:** `src/hooks/useContentGenerationLifecycle.ts` — no-op for backend-routed runs until deleted.
- **Updated:** `src/hooks/useContentGenerationHydration.ts` — backend active/recent run hydration.
- **Updated:** `src/infrastructure/repositories/contentGenerationLogRepository.ts` — UI read-cache only.
- **Phase 4 delete:** local runners and deprecated generation parsers no longer needed by generation pipelines.

## Acceptance criteria

### Strict structured-output gate

- Every pipeline job kind has a strict JSON Schema response format.
- Pipeline-bound OpenRouter config without `structured_outputs` fails before LLM call.
- No pipeline path requests `json_object`.
- OpenRouter `response-healing` may be requested with strict JSON Schema and is recorded as metadata.

### Legacy parser deprecation gate

- Legacy permissive parsers carry explicit `@deprecated` comments for pipeline paths.
- Tests prove durable strict paths do not call `extractJsonString()` or permissive pipeline parsers.
- Phase 4 removes legacy parser usage from generation pipeline code paths.

### Snapshot/hash gate

- Every pipeline builds a `RunInputSnapshot`.
- Canonical hash test vectors cover all pipeline kinds.
- Snapshot changes to model, prompt version, schema version, or source data alter `input_hash`.

### Seam gate

- All generation requests, retries, cooldown regeneration, pubsub invalidation regeneration, and expansion starts route through `GenerationClient`.
- No direct runner calls remain outside local repository adapter.
- `generationRunEventHandlers.ts` imports only feature public APIs.

### Crystal Trial gate

- Durable question generation survives tab close.
- Reopen applies questions exactly once.
- Availability watcher/mentor behavior remains correct.
- No `crystal-trial:completed` event fires from question generation success.

### SSE gate

- Client reconnects with `Last-Event-ID`.
- Worker replays only `seq > lastSeq`.
- Duplicate events do not double-apply artifacts or double-fire mentor triggers.

### Cancel/supersession gate

- Cancel-before-start: terminal `cancelled`, no LLM call billed.
- Cancel-mid-stage: `cancel_acknowledged` immediate, terminal `cancelled` after boundary stop.
- Cancel-after-completion: no-op; run remains terminal completed.
- Superseded expansion cancels without player-facing failure copy.

### Budget gate

- Phase 1 minimal cap blocks overuse before Workflow creation.
- Phase 3 records primary call tokens and provider-healing request metadata.
- Cache-hit increments `runs_started` but not token counters.
- UTC rollover tests cover `23:59:59 UTC` and `00:00:01 UTC`.

## Highest-priority guardrails

<aside>
⚠️

1. **Phase 0 is a hard gate.** No durable backend work until strict contracts, snapshots, parser deprecations, and eval gate exist.
2. **No root-level domain contract module.** Generation contracts live under `src/features/generationContracts/`.
3. **Strict JSON Schema only for pipelines.** No `json_object` fallback on Subject Graph Generation, Topic Content Pipeline, Topic Expansion, or Crystal Trial.
4. **OpenRouter response-healing stays enabled for v1 when configured.** It is provider-side structured-output support; downstream parsers still fail loudly.
5. **Legacy permissive parsers are deprecated.** They are compatibility surfaces for local legacy/non-pipeline paths only and are removed after cutover.
6. **`RunInputSnapshot` is mandatory.** The Worker never infers browser IndexedDB state.
7. **`deviceId` is not a security boundary.** Document it and migrate to Supabase Auth later.
8. **Hard durability is the contract.** Closing the tab never stops backend-routed runs.
9. **Artifact Appliers are the only local writers** from generation artifacts after Phase 0.5.
10. **Crystal Trial generation is not trial completion.** Never emit `crystal-trial:completed` from question generation success.
11. **Minimal budget guard ships in Phase 1.** Full token accounting lands in Phase 3.
12. **`input_hash` and Idempotency-Key stay separate.** Cache key vs duplicate-submit protection.
13. **Cancel is cooperative.** `cancel_acknowledged` is not terminal `cancelled`.
14. **One Workflow per pipeline kind.** No branching mega-workflow.
15. **Supabase access stays server-side.** Browser never talks directly to Supabase for generation runs.
16. **`'navigation'` abort reason stays until full cutover.** Removal lives in Phase 4.
17. **Eval CI is a merge gate** on prompt/schema/model changes.
18. **No direct remote I/O in features/components/hooks.** Durable run I/O goes through repository contracts and infrastructure adapters.

</aside>

[Phase 0.5 — Generation Client Seam: Concrete Implementation](phase05.md)

[Phase 1 — Durable Orchestrator + Crystal Trial Pilot: Concrete Implementation](phase1.md)

[Phase 0 Step 12 — Concrete Prompt-Quality Patches](phase0-step12.md)
