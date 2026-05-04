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
└── strictParsers/                   # single-pass parsers + ArtifactKind registry (Phase 0 step 3)
    ├── strictParse.ts
    └── byKind.ts
```

Follow-up Phase 0 PRs will add `semanticValidators/`, `prompts/`, and
`evalFixtures/` here.

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
   in `semanticValidators/` (Phase 0 step 9), which runs AFTER the strict
   parser as a separate single pass.

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
