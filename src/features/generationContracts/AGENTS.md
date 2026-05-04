# Generation Contracts

Source-of-truth for durable generation contracts: schemas, snapshots, hashes,
failure codes, run events, prompt builders, semantic validators, and golden
eval fixtures.

## Boundary

- This module lives in the **feature layer** (`src/features/*`). The future
  Worker (`workers/`) and any durable-orchestration adapter consume the same
  module via TypeScript source — there is exactly one source of truth for
  prompt construction, schemas, semantic validators, hash algorithms, and
  failure-code policy.
- Public imports MUST go through `index.ts`. Cross-feature deep imports into
  the directory tree from outside `src/features/generationContracts/` are
  prohibited (matches the project-level rule in the root `AGENTS.md`).
- This module MUST NOT depend on any other feature module — only on
  `src/types/*` and pure standard-library / `zod` primitives. The Worker
  compiles the same files; pulling in feature-only code (zustand stores,
  R3F, etc.) would break the Worker build.
- Lockstep tests in `semanticValidators/semanticValidators.test.ts` import
  upstream feature constants (`TRIAL_QUESTION_COUNT`, `MAX_CARD_DIFFICULTY`,
  `TOPIC_ICON_NAMES`) and assert equality with locally-redeclared mirrors
  in `semanticValidators/_constants.ts`. Test files are excluded from the
  Worker build, so the lockstep imports do not violate the runtime
  feature-import boundary.

## Layout

```
src/features/generationContracts/
├── AGENTS.md
├── index.ts                         # only public import surface
├── canonicalHash.ts                 # deterministic input_hash + content_hash
├── failureCodes.ts                  # typed failure codes
├── runEvents.ts                     # RunEvent type union (durable & local)
├── artifacts/
│   └── types.ts                     # Artifact, ArtifactKind, ArtifactEnvelope
├── snapshots/
│   ├── types.ts                     # RunInputSnapshot discriminated union
│   └── build*Snapshot.ts            # per-pipeline snapshot builders
├── schemas/                         # strict Zod artifact schemas (Phase 0 step 3)
│   ├── _shared.ts
│   ├── subjectGraphTopics.ts
│   ├── subjectGraphEdges.ts
│   ├── topicTheory.ts
│   ├── topicStudyCards.ts
│   ├── topicMiniGameCategorySort.ts
│   ├── topicMiniGameSequenceBuild.ts
│   ├── topicMiniGameMatchPairs.ts
│   ├── topicExpansionCards.ts
│   └── crystalTrial.ts
├── strictParsers/                   # single-pass parsers + ArtifactKind registry (Phase 0 step 3)
│   ├── strictParse.ts
│   └── byKind.ts
└── semanticValidators/              # per-kind domain-rule validators (Phase 0 step 9)
    ├── _constants.ts                # locally-mirrored semantic constants (lockstep)
    ├── types.ts                     # SemanticValidatorResult, SemanticFailureCode
    ├── cardContentShape.ts          # shared per-card-content shape + concept stem
    ├── subjectGraphTopics.ts
    ├── subjectGraphEdges.ts
    ├── topicTheory.ts
    ├── topicStudyCards.ts
    ├── topicMiniGameCategorySort.ts
    ├── topicMiniGameSequenceBuild.ts
    ├── topicMiniGameMatchPairs.ts
    ├── topicExpansionCards.ts
    ├── crystalTrial.ts
    └── byKind.ts
```

Follow-up Phase 0 PRs will add `prompts/` and `evalFixtures/` here.

## Hashing rules

- `inp_<sha256-hex>` for `RunInputSnapshot` canonical hashes (artifact cache key).
- `cnt_<sha256-hex>` for artifact-payload canonical hashes (applier idempotency key).
- Canonical JSON: keys sorted lexicographically; arrays preserved in order;
  `undefined` properties omitted; `NaN` / `+/-Infinity` rejected with a thrown
  `Error`. The algorithm and tag are stable across browser WebCrypto and
  Worker WebCrypto.
- Migrating to a different digest in the future MUST change the prefix so
  cached artifacts cannot silently collide.

## Strict pipeline parser policy

1. Strict parsers (`strictParsers/`) consume EXACT JSON output from the LLM
   provider in strict `json_schema` mode. No markdown-fence stripping. No
   embedded-JSON extraction. No multi-shape acceptance.
2. The Zod schema for an `ArtifactKind` is the single source of truth for
   accepted shapes. Extra keys on `.strict()` objects are rejected with
   `parse:zod-shape`. JSON parse errors surface as `parse:json-mode-violation`.
3. No second parser. No fallback. No probabilistic recovery (the existing
   subject-graph Stage B `correctPrereqEdges` repair stays where it is and is
   the only documented exception in the root `AGENTS.md`).
4. Domain rules (card-pool size, difficulty distribution, mini-game
   playability, Crystal Trial question count, lattice/edge invariants) live
   in `semanticValidators/`, which runs AFTER the strict parser as a
   separate single pass and emits `validation:semantic-*` failure codes.

## Semantic validator policy

1. Validators receive the strict-parsed payload + an optional
   `SemanticValidatorContext` (e.g., `latticeTopicIds` for edges,
   `existingConceptStems` for expansion, `expectedQuestionCount` for the
   Crystal Trial). A validator that requires a context field but doesn't
   receive one fails loudly rather than silently passing.
2. Validators NEVER throw and NEVER mutate the payload. They return
   `SemanticValidatorResult` so the orchestrator decides whether the
   `validation:semantic-*` failure is terminal or surfaced via telemetry.
3. Authoritative semantic constants that live in feature code
   (`TRIAL_QUESTION_COUNT`, `MAX_CARD_DIFFICULTY`, `TOPIC_ICON_NAMES`) are
   redeclared locally in `semanticValidators/_constants.ts` to preserve
   the no-feature-import runtime boundary; lockstep tests assert equality
   with the upstream constants and fail CI on drift.

## Authoritative rules

1. No second parser. No fallback. No probabilistic recovery (the existing
   subject-graph Stage B repair stays where it is and is the only documented
   exception).
2. Failure modes use the codes in `failureCodes.ts`. Adding a code requires
   updating downstream consumers (Worker, telemetry, HUD copy) in lockstep.
3. Run events are the only contract between any orchestrator and the client.
   The legacy App Event Bus adapter consumes them; feature code must never
   reach into orchestrator internals.
4. Snapshots include `snapshot_version`, `pipeline_kind`, `schema_version`,
   `prompt_template_version`, `model_id`. Bumping any of those changes the
   `input_hash`.
