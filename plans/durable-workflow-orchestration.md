# Durable Workflow Orchestration Plan

Status: active cleanup plan, 2026-05-09

## Decision Records

Architecture and product decisions have been moved to ADRs:

- [ADR 0001: Subject Graph Generation Publishes Only Complete Subjects](../docs/adr/0001-subject-graph-publication-boundary.md)
- [ADR 0002: Durable Generation Infrastructure](../docs/adr/0002-durable-generation-infrastructure.md)
- [ADR 0003: Backend-Authoritative Generation and Learning Content](../docs/adr/0003-backend-authoritative-generation.md)

Do not duplicate accepted architecture decisions in this plan. Add or amend ADRs when a new durable-generation decision is accepted.

## Current Architecture

Durable generation is backend-authoritative:

- The browser submits compact `{ kind, intent }` generation requests.
- The Worker validates intents, rejects client-supplied snapshots and generation-policy fields, expands intents into canonical snapshots, and resolves backend generation policy.
- Cloudflare Workflows execute durable generation.
- D1 stores queryable run, job, event, artifact metadata, usage, and Learning Content Store read-model rows.
- R2 stores generated artifact bodies, checkpoints, and debug/replay bundles.
- Browser durable observation persists only SSE cursors, invalidates backend-backed reads, and emits product notifications.
- Generated learning content is read from the backend Learning Content Store, not local generation logs, frontend artifact appliers, or browser-owned generated question storage.

## Completed Work

The following work is complete and should not remain as active plan tasks:

- Phase 0 through Phase 3.6 durable orchestration, contract, retry, idempotency, typed-event, SSE, and strict transport gates.
- Backend Generation Policy module.
- D1 repository and Learning Content Store foundation.
- Backend Learning Content routes and frontend backend-read repository wiring.
- Intent-only runtime submission.
- Durable-only frontend routing and unconditional durable observation.
- GenerationProgressHud, frontend generation log/store, local runner, navigation-abort, and frontend artifact-applier removal.
- Browser pipeline model/provider/response-healing settings removal.
- Backend-owned Subject Graph strategy expansion.
- Backend-resolved current Crystal Trial question-set read path.
- Consolidation of durable infrastructure and generation-ownership decisions into ADRs.
- Removal of duplicate infrastructure decision and historical-planning decision files as active sources.
- Decoupled `loadTheoryPayloadFromTopicDetails()` from deprecated permissive parser types; pipeline reconstruction now owns its persisted Learning Content payload shape.
- Expanded durable generation boundary tests for backend/pipeline parser seams, deleted frontend generation surfaces, durable routing flags, navigation abort reasons, intent-only frontend submission, frontend snapshot/hash import drift, browser pipeline-settings drift, and retired infrastructure decision/plan archive files.
- Backend route tests now explicitly reject client-built snapshots, nested client generation-policy fields, and top-level client generation-policy fields at `POST /v1/runs`.
- Removed retired frontend permissive prompt builders, response-format helpers, and parser modules under `src/features/contentGeneration/{messages,parsers,schemas}`.
- Removed retired Subject Graph Stage A/local graph prompt-parser remnants: `buildTopicLatticeMessages`, `parseTopicLatticeResponse`, `parseGraphResponse`, and the unused `subject-graph-topics.prompt` template.
- Added a durable boundary guard that keeps retired frontend permissive prompt/parser paths deleted.

Historical implementation logs are available in Git history. Keep this file focused on remaining executable work.

## Remaining Work

### 1. Stage B deterministic repair exception audit

The broad frontend prompt/parser cleanup is complete for unsupported durable-generation surfaces. The remaining prompt/parser-adjacent follow-up is the narrow Subject Graph Stage B deterministic edge-repair exception.

- Confirm whether `src/features/subjectGeneration/graph/prereqWiring/prerequisiteEdgeRules.ts` is still required by supported backend workflow code or only by retired in-tab Subject Graph tests.
- If unsupported, remove `prereqWiring/prerequisiteEdgeRules.ts`, its tests, and `src/prompts/subject-graph-edges.prompt`.
- If still required, move the correction seam into the backend/contract-owned durable Subject Graph Stage B path and keep its no-second-parser/no-fallback boundary tests.

### 2. Final drift and boundary guards

Most repository-wide guard coverage now lives in `src/features/generationContracts/durableGenerationBoundary.test.ts`:

- No local generation runner files or imports return.
- No `GenerationProgressHud`, frontend generation log/store, or store-backed generation attention surface returns.
- No frontend artifact appliers or `AppliedArtifactsStore` return for backend-generated artifacts.
- No `NEXT_PUBLIC_DURABLE_RUNS*` routing flags return.
- No `kind: 'navigation'` or navigation cancel reason can be constructed in runtime code.
- Frontend run submission remains intent-only and excludes `modelId`, `model_id`, `providerHealingRequested`, `responseHealing`, `plugins`, `response_format`, or snapshots.
- Frontend runtime code cannot import snapshot builders or `inputHash` outside shared contract/test seams.
- Runtime features/components/hooks do not import `ApiClient`, `DurableGenerationRunRepository`, or SSE primitives directly.
- Backend and pipeline code cannot import `extractJsonString()` or deprecated permissive parsers.
- Retired frontend permissive prompt/parser paths cannot return.
- Browser settings cannot reintroduce generation pipeline model/provider/response-healing controls.
- `docs/infrastructure-decisions.md` and historical durable plan archive filenames remain deleted.

Remaining follow-ups:

- Keep guard fragments current if new browser settings surfaces are added for non-generation study tools.
- Keep retired prompt/parser path guards current if additional unsupported local generation seams are removed.
- Complete the verification batch and manual close/reopen checks below.

### 3. Verification

Run:

```bash
pnpm test:unit:run
pnpm test:eval
pnpm check:compile
pnpm test:e2e:smoke
```

Manually verify:

1. Generate Subject Graph, Topic Content, Topic Expansion, and Crystal Trial.
2. Close and reopen the tab during a run.
3. Confirm generated content renders from backend Learning Content Store reads exactly once.
4. Confirm Crystal Trial questions load from backend current-set reads.
5. Confirm no browser IndexedDB/localStorage generation-log, generated-question, artifact-application, or card-pool-hash writes occur.
6. Confirm no `crystal-trial:completed` assessment event fires from question-generation success.

## Close Criteria

The Durable Workflow Orchestration program is complete when:

- All remaining prompt/parser cleanup and drift guards are in place.
- The verification batch passes.
- Manual close/reopen durable checks pass for all four generation pipelines.
- Generated content is backend-read-only in the browser.
- ADRs, not plan prose, contain all accepted architecture decisions.
