<aside>
📝

Concrete copy-paste patches for the seven `.prompt` files that drive the four durable pipelines. The agent's GitHub MCP write surface refuses every edit on files containing `\{\{\}\}` placeholders, so each file requires a manual patch. Each patch is lockstepped with the §Phase 0 step 9 semantic validators and §Phase 0 step 10 eval fixtures so the prompt cliff and the validator cliff line up exactly.

</aside>

## 📖 How to apply

1. Open each `.prompt` file under `src/prompts/` listed below.
2. Paste the *Patch* block at the location indicated by *Insertion point*. Strip the leading `+` markers; they are diff annotations, not part of the prompt text.
3. Wherever a patch references a placeholder name in `\<angle brackets\>` (for example `\<topicId\>`, `\<questionCount\>`), the actual `.prompt` source must use the matching `\{\{`-style template token (for example `\{\{topicId\}\}`, `\{\{questionCount\}\}`) so `interpolatePromptTemplate()` can substitute the runtime value before the model sees the prompt.
4. After all seven files are patched, run `pnpm run test:eval` (the §Phase 0 step 11 merge gate) and `pnpm run test:unit:run`. Confirm every pipeline's golden corpus still hits its declared `accept` / `parse-fail/\<code\>` / `semantic-fail/\<code\>` outcomes bit-for-bit.
5. Commit on `feat/durable-generation-contracts-phase0-step12` stacked on `feat/durable-generation-contracts-phase0-step11` and open PR #52 with title `feat: prompt-quality pass (Phase 0 step 12)`.
6. Once green and merged, mark `- [x] **Step 12.**` in §Phase 0 of the parent page; Phase 0 then closes.

## 1. `src/prompts/topic-theory-syllabus.prompt`

**Intent.** Add a final pre-emit checklist that mirrors the Zod schema and the §step 9 `topicTheory` semantic validator, and tighten the web-search instruction so the model stops emitting in-text citations the application is supposed to attach from provider annotations.

**Insertion point.** Immediately before the existing `Context:` line (after the *Use ASCII-only JSON string content...* paragraph).

**Patch.**

```diff
+Tighten the web-search instruction: use web search at least once and ground both `theory` and `coreQuestionsByDifficulty` entries in canonical / authoritative sources you actually consulted. Do not include in-text citations or a source list inside the JSON; the application attaches citations from provider annotations.
+
+Before emitting JSON, verify:
+1. `coreConcept` is 2–3 sentences.
+2. `theory` is 600–900 words and contains only ASCII characters.
+3. `keyTakeaways.length` is 4 to 6, with no case-insensitive duplicates.
+4. Each of `coreQuestionsByDifficulty["1"]`, `["2"]`, `["3"]`, `["4"]` is an array of 2 to 4 distinct learner-facing question strings, with no within-tier duplicates (case-insensitive).
+5. No Unicode math symbols anywhere in any string value (no π, ω, ≤, ≥, ≈, →, ∑, ∠, ·, ×, ÷, etc.). Use the LaTeX commands documented above.
+6. The output object has exactly four top-level keys: `coreConcept`, `theory`, `keyTakeaways`, `coreQuestionsByDifficulty`. No additional keys.
```

## 2. `src/prompts/topic-study-cards.prompt`

**Intent.** Add a final pre-emit checklist that pins every per-card-shape rule already enforced by the §step 9 `topicStudyCards` semantic validator (`validation:semantic-card-content-shape`, `validation:semantic-duplicate-concept`, `validation:semantic-card-pool-size`, `validation:semantic-difficulty-distribution`).

**Insertion point.** Immediately before the existing `Topic id: ...` context block at the bottom of the file.

**Patch.**

```diff
+Before emitting JSON, verify:
+1. `cards.length` is 8 to 12.
+2. Every `id` is unique, lowercase kebab-case, and starts with the literal prefix `<topicId>-` (the value injected above).
+3. `difficulty` is exactly `<targetDifficulty>` on every card.
+4. Every FLASHCARD card has `content` with exactly two string fields: `front` and `back`. Never use `question` / `answer` for FLASHCARD.
+5. Every SINGLE_CHOICE card has `content` with `question` (string), `options` (array of exactly 4 strings), `correctAnswer` (string verbatim equal to one entry in `options`), and `explanation` (string). Never use `answer`; always `correctAnswer`.
+6. Every MULTI_CHOICE card has `content` with `question`, `options`, `correctAnswers` (array of strings, length ≥ 2, every entry verbatim in `options`), and `explanation`. Never use `answer` / `correctAnswer`; always `correctAnswers`.
+7. No two cards share the same normalized concept stem (lowercased, whitespace-collapsed primary noun phrase). Treat near-duplicates as duplicates.
+8. The output object has exactly one top-level key: `cards`.
```

## 3. `src/prompts/topic-mini-game-cards.prompt`

**Intent.** Add a final pre-emit checklist that pins every playability rule from the §step 9 `topicMiniGameCategorySort` / `topicMiniGameSequenceBuild` / `topicMiniGameMatchPairs` semantic validators (`validation:semantic-mini-game-playability`).

**Insertion point.** Immediately before the existing `Topic id: ...` context block at the bottom of the file.

**Patch.**

```diff
+Before emitting JSON, verify:
+1. `cards.length === 1`.
+2. `cards[0].type === "MINI_GAME"`.
+3. `cards[0].content.gameType` is verbatim equal to `<expectedGameType>`.
+4. `cards[0].id` is unique, kebab-case, and starts with `<topicId>-mg-`.
+5. `cards[0].difficulty` is exactly `<targetDifficulty>`.
+6. If `gameType === "CATEGORY_SORT"`: every category id is unique; every category has at least one item; every item's `categoryId` references a category declared in this card; every item id is unique.
+7. If `gameType === "SEQUENCE_BUILD"`: every step id is unique; the multiset of `order` values is exactly 1..N with no gaps and no duplicates (e.g. for 5 steps, `order` values are exactly the set 1, 2, 3, 4, 5).
+8. If `gameType === "MATCH_PAIRS"`: every pair id is unique; the set of `left` values is unique under case-insensitive trimmed comparison; the set of `right` values is unique under case-insensitive trimmed comparison.
+9. The output object has exactly one top-level key: `cards`.
```

## 4. `src/prompts/topic-expansion-cards.prompt`

**Intent.** Add a final pre-emit checklist + tighten the per-tier rubric so the §step 9 `topicExpansionCards` semantic validator (`validation:semantic-card-pool-size`, `validation:semantic-card-content-shape`, `validation:semantic-duplicate-concept`, `validation:semantic-difficulty-distribution`) finds the model already self-pruning the same drift modes.

**Insertion point #1.** Replace the existing tier-rubric bullets (`- Difficulty 2 should apply...`, `- Difficulty 3 should analyze...`, `- Difficulty 4 should synthesize...`) in the *Requirements* block.

**Patch #1.**

```diff
-- Difficulty 2 should apply, calculate, and classify in straightforward single-concept contexts.
-- Difficulty 3 should analyze, contrast, debug, and use multi-step reasoning across composed concepts.
-- Difficulty 4 should synthesize, design, critique, and transfer to novel scenarios.
+- Difficulty 2 = single-concept *apply / calculate / classify* in straightforward contexts. The card stem must require the learner to perform the operation, not merely recall its definition.
+- Difficulty 3 = multi-step *analyze / contrast / debug* across composed concepts. The card stem must require reasoning across at least two concepts from the theory, not a single-concept restatement.
+- Difficulty 4 = *synthesize / design / critique / transfer* to novel scenarios. The card stem must place the learner in a scenario not present verbatim in the theory and require them to combine concepts to produce the answer.
```

**Insertion point #2.** Immediately before the existing `Topic id: ...` context block at the bottom of the file.

**Patch #2.**

```diff
+Before emitting JSON, verify:
+1. `cards.length` is 6 to 10.
+2. The number of cards with `type === "MINI_GAME"` is 1 or 2.
+3. Every card's `difficulty` is exactly `<difficulty>`.
+4. Every card's `id` is unique, kebab-case, and starts with `<topicId>-d<difficulty>-`.
+5. No card's concept stem (lowercased, whitespace-collapsed primary noun phrase) appears in the *Existing concept stems to avoid* block above (case-insensitive normalized comparison; treat near-duplicates as duplicates).
+6. No mini-game card declares a category, item, sequence step, or pair label whose normalized form appears in the *Existing mini-game item labels to avoid* block above.
+7. Every FLASHCARD / SINGLE_CHOICE / MULTI_CHOICE card satisfies the same per-shape rules as `topic-study-cards.prompt`: FLASHCARD `\{ front, back \}`; SINGLE_CHOICE `\{ question, options[4], correctAnswer ∈ options, explanation \}`; MULTI_CHOICE `\{ question, options, correctAnswers (≥ 2, ⊆ options), explanation \}`.
+8. Every MINI_GAME card satisfies the playability rules from `topic-mini-game-cards.prompt`.
+9. The output object has exactly one top-level key: `cards`.
```

## 5. `src/prompts/crystal-trial.prompt`

**Intent.** Add a final pre-emit checklist that promotes the existing prose rule *“Every source card should be referenced by at least one question”* into a machine-checkable item, and pins the question count + id format + category enum + per-question option-uniqueness rules the §step 9 `crystalTrial` semantic validator already enforces (`validation:semantic-trial-question-count`).

**Insertion point.** Replace the existing `IMPORTANT:` block at the bottom of the file.

**Patch.**

```diff
-IMPORTANT:
-- `correctAnswer` MUST exactly match one of the `options` strings
-- `category` MUST be one of: "interview", "troubleshooting", "architecture"
-- Generate exactly <questionCount> questions with ids trial-q1 through trial-q<questionCount>
-- Each `sourceCardSummaries` should have 2-3 entries referencing specific card concepts
+IMPORTANT — before emitting JSON, verify:
+1. `questions.length` equals exactly `<questionCount>`.
+2. The `id` values are exactly `trial-q1`, `trial-q2`, …, `trial-q<questionCount>` in order. No gaps, no duplicates.
+3. Every `correctAnswer` is verbatim equal to one entry in the same question's `options`.
+4. Every `category` is exactly one of `"interview"`, `"troubleshooting"`, `"architecture"`.
+5. Within every question, the `options` array contains 4 strings that are pairwise distinct under case-insensitive trimmed comparison.
+6. Every `sourceCardSummaries` array has length 2 or 3.
+7. Every input card supplied in the *Source Material* block above is referenced by at least one question's `sourceCardSummaries`. If a card is not referenced anywhere, regenerate.
+8. The output object has exactly one top-level key: `questions`.
```

## 6. `src/prompts/subject-graph-topics.prompt`

**Intent.** Add a final pre-emit checklist that pins every rule the §step 9 `subjectGraphTopics` semantic validator already enforces (`validation:semantic-subject-graph` for icon-allowlist drift, duplicate `topicId`, duplicate title case-insensitive).

**Insertion point.** Append immediately after the existing trailing sentence *“There must be exactly `<topicCount>` objects in `topics`, with tiers ranging from 1 through `<tierCount>` and counts per tier exactly `<topicsPerTier>` each.”*

**Patch.**

```diff
+
+Before emitting JSON, verify:
+1. `topics.length` equals exactly `<topicCount>`.
+2. The multiset of `tier` values is exactly `<topicsPerTier>` copies each of `1`, `2`, …, `<tierCount>`.
+3. Every `iconName` is a verbatim string from the curated allowlist above. No invented names; no spelling drift.
+4. Every `topicId` is unique across the array.
+5. Every `title` is unique across the array under case-insensitive trimmed comparison.
+6. Every `learningObjective` is a single non-empty learner-facing sentence and is NOT a verbatim rewording of its `title` (e.g. "Learners can explain Foo" for a topic titled "Foo" is a verbatim rewording — produce a more specific objective that names what the learner can DO).
+7. The output object has exactly one top-level key: `topics`. No `prerequisites` field on any topic — edges are generated in a later step.
```

## 7. `src/prompts/subject-graph-edges.prompt`

**Intent.** Add a final pre-emit checklist that pins the lattice referential-integrity rules already enforced by the §step 9 `subjectGraphEdges` semantic validator (`validation:semantic-subject-graph` self-loop, unknown source/target, duplicate `(source, target)` exact + with different `minLevel`).

**Insertion point.** Append immediately after the existing `Rules (must all hold):` numbered list.

**Patch.**

```diff
+
+Before emitting JSON, verify:
+1. The `edges` object has exactly one key for every tier-2 topic id and every tier-3 topic id from the injected lattice. No tier-1 keys.
+2. For every tier-2 key, every prerequisite (whether bare string or `\{ "topicId", "minLevel" \}`) references a tier-1 topic id from the injected lattice. No tier-2 or tier-3 ids on the right-hand side of a tier-2 key.
+3. For every tier-3 key, every prerequisite references a tier-1 or tier-2 topic id from the injected lattice. At least one prerequisite per tier-3 key is tier-2. No tier-3 ids on the right-hand side of any key.
+4. No edge is a self-loop (`source === target`).
+5. No `(source, target)` pair is duplicated within a key's prerequisites array — even if the duplicates declare different `minLevel` values.
+6. Every prerequisite topic id is verbatim equal to a topic id in the injected lattice. No invented ids; no spelling drift.
+7. The output object has exactly one top-level key: `edges`.
```

The Stage B `correctPrereqEdges` deterministic-repair narrow exception in [AGENTS.md](http://AGENTS.md) remains in force unchanged; this checklist shifts the cliff up at prompt time, the deterministic repair pass continues to handle residual structural mistakes that survive the prompt.

## ✅ Verification

1. `pnpm run test:eval` — must stay green; bit-for-bit fixture outcomes (`accept`, `parse-fail/\<code\>`, `semantic-fail/\<code\>`) come from the harness landed in §Phase 0 step 10.
2. `pnpm run test:unit:run` — must stay green.
3. Open PR #52 with title `feat: prompt-quality pass (Phase 0 step 12)` against base `feat/durable-generation-contracts-phase0-step11`.
4. Once green and merged, mark `- [x] **Step 12.**` in §Phase 0 of the parent page; Phase 0 closes.

## 🎯 Acceptance gate

The §Phase 0 acceptance criterion *“Golden set ≥ 90% pass rate per pipeline”* is the empirical gate this step targets. With the structural eval contract from step 10 already locked in (every fixture asserts a specific accept / parse-fail / semantic-fail outcome with a specific failure code), any prompt-induced regression in pass rate surfaces on the same workflow without further infra. If the gate is red after applying these patches, iterate on the offending checklist item rather than relaxing the validator — the validator and the prompt cliff must stay aligned.
