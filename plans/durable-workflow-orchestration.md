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

## Completed Cleanup

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

Historical implementation logs are available in Git history. Keep this file focused on remaining executable work.

## Remaining Work

### 1. Final shared prompt/parser cleanup

- Audit `src/features/contentGeneration/messages/**`, `src/features/contentGeneration/parsers/**`, and Subject Graph local prompt/parser remnants.
- Delete frontend-only permissive pipeline parser/prompt modules that no backend/shared test or supported read-model validation still imports.
- Keep the documented Subject Graph Stage B deterministic edge-repair exception only where still required by backend workflow code.
- Add or update guards proving no pipeline/backend path imports `extractJsonString()` or deprecated permissive parsers.

### 2. Final drift and boundary guards

Add repository-wide guards for these invariants:

- No local generation runner files or imports return.
- No `GenerationProgressHud`, frontend generation log/store, or store-backed generation attention surface returns.
- No frontend artifact appliers or `AppliedArtifactsStore` return for backend-generated artifacts.
- No `NEXT_PUBLIC_DURABLE_RUNS*` routing flags return.
- No `kind: 'navigation'` generation abort reason can be constructed.
- No frontend runtime generation submission contains `modelId`, `model_id`, `providerHealingRequested`, `responseHealing`, `plugins`, `response_format`, or snapshots.
- No frontend runtime imports snapshot builders or `inputHash` outside shared contract/test seams.
- No pipeline model/healing settings return to browser settings.
- `POST /v1/runs` rejects snapshots and policy fields.
- Runtime components/hooks do not import `ApiClient`, `DurableGenerationRunRepository`, or SSE primitives directly.
- No hosted Supabase migration/storage target, R2-as-database pattern, or Durable-Objects-as-workflow-engine pattern returns.

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

## Questions / Recommended Answers

### Q1. Should `docs/infrastructure-decisions.md` stay?

Recommended answer: keep it only as a superseded pointer to ADRs for discoverability. Do not add new decisions there.

### Q2. Should deleted historical plans be preserved somewhere?

Recommended answer: no separate archive file. Git history already preserves them, and duplicate planning documents caused drift. Keep this plan as the only active plan.

### Q3. Should future retry/cancel UI return after HUD deletion?

Recommended answer: only as a backend-run consumer with explicit run IDs and backend diagnostics. Do not resurrect frontend generation logs or local runner state.

### Q4. Should frontend prompt/parser modules survive if used only by tests?

Recommended answer: only if they are testing shared contracts that remain intentionally supported. Otherwise delete them and move coverage to backend/shared contract tests.

## Close Criteria

The Durable Workflow Orchestration program is complete when:

- All remaining prompt/parser cleanup and drift guards are in place.
- The verification batch passes.
- Manual close/reopen durable checks pass for all four generation pipelines.
- Generated content is backend-read-only in the browser.
- ADRs, not plan prose, contain all accepted architecture decisions.
