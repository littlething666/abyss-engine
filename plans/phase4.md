<aside>
📌

**Status:** Phase 4 implementation started 2026-05-07. PR-A, PR-B, and the schema/repository core of PR-C are landed in this workspace; Phase 3.6 is complete per `plans/durable-workflow-orchestration.md`. Phase 4 remains a **destructive backend-authoritative generation and persistence reset**.

**Breaking-change posture:** no backwards compatibility, no local data migration, no browser-owned generation fallback. Existing local IndexedDB decks, local generation logs, client model bindings, client response-healing settings, local runners, and frontend pipeline prompt/snapshot builders may be deleted.

</aside>

## Overview

Phase 4 completes the Durable Workflow Orchestration program by making the backend the only authority for generation execution and generated learning content.

After Phase 4:

- the browser submits **generation intents**, not execution snapshots with model/provider policy;
- the backend expands intents into canonical `RunInputSnapshot`s;
- model choice, prompt construction, response-healing posture, strict parsing, semantic validation, retries, idempotency, budget accounting, and artifact persistence live behind backend seams;
- generated Subjects, Subject Graphs, Topic Content, study cards, and Crystal Trial question sets persist in the backend **Learning Content Store**;
- the frontend reads learning content from backend repositories and observes run events for UI state only;
- the frontend never runs pipeline LLM calls, never chooses pipeline models, never toggles provider response healing, and never applies durable artifacts into local IndexedDB as source of truth.

## Accepted Product/Architecture Decisions

1. **Backend owns pipeline model choice.** Pipeline model IDs are resolved from backend generation policy. Frontend study-explanation surfaces may keep their own local settings for now, but Subject Graph Generation, Topic Content Pipeline, Topic Expansion, and Crystal Trial generation cannot read `studySettingsStore` model bindings.
2. **Response healing is not user-toggleable.** The OpenRouter `response-healing` plugin is a backend generation-policy decision. Phase 4 v1 keeps it enabled in backend defaults and records `providerHealingRequested` in run/job metadata. There is no browser setting and no localStorage migration.
3. **Full backend learning-content persistence lands now.** The browser no longer owns generated deck persistence. Durable workflows write validated artifacts into backend learning-content tables before `run.completed` is emitted.
4. **Destructive reset is allowed.** Do not preserve old IndexedDB/localStorage generation data. Do not write compatibility adapters for old snapshots/settings.
5. **Strict failure at seams.** Invalid backend generation policy, invalid intents, missing backend learning content, unsupported model capabilities, and malformed model output fail loudly with structured errors. Do not add frontend fallbacks or downstream repair branches.
6. **Cloudflare infrastructure split is locked.** Workflows own durable execution, D1 owns queryable run/job/event/usage/artifact metadata state, R2 owns artifact/checkpoint blobs, and Durable Objects are optional coordination infrastructure only. See `docs/infrastructure-decisions.md`.
7. **R2 stores artifact bodies and checkpoints.** Supabase Storage is not part of the Phase 4 target. D1 keeps the `artifacts` metadata/cache index; JSON artifact envelopes and stage checkpoints live in R2.
8. **Backend generation settings are removed.** Pipeline model policy and response healing are backend-owned policy, not persisted device settings. If future product settings need backend persistence, D1 is their queryable store; generation-pipeline policy stays backend configuration.

## Compliance, Risk & Drift Assessment

### Misalignment Check

- The previous corrected Phase 4 plan was stale: it treated Phase 3.6 as open and focused mainly on deleting local runners. Current `plans/durable-workflow-orchestration.md` marks Phase 3.6 complete.
- Current code still contradicts the target architecture because browser modules resolve pipeline models (`resolveModelForSurface(...)`), persist `openRouterResponseHealing`, construct pipeline snapshots with `model_id`, and apply generated artifacts locally.
- No AGENTS.md contradiction in this rewritten scope: backend persistence stays in infrastructure/backend adapters; frontend feature modules communicate through public interfaces; direct frontend remote I/O remains isolated in repositories/clients.

### Architectural Risk

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Moving generated learning content to backend can strand UI reads if repository replacement is partial. | High | Land backend content routes and `BackendDeckRepository` before deleting Dexie deck reads. Add boundary tests that generation screens use repository interfaces only. |
| Removing client model settings may break generation submissions that still require `modelId`. | High | Introduce `RunIntent` and backend snapshot expansion first, then delete `modelId` parameters from frontend call sites. |
| Artifact cache hits may skip content-table writes. | High | Backend cache-hit path must materialize the cached artifact into the Learning Content Store, or prove it is already materialized, before marking run completed. |
| Backend prompt drift from frontend prompt templates can degrade output quality. | Medium | Move pipeline prompt templates into backend modules and run `pnpm run test:eval` / backend prompt tests on every prompt/schema/model-policy touch. |
| Study explanation settings get accidentally deleted with pipeline settings. | Medium | Split `studyInference` settings from backend generation policy. Delete only pipeline surfaces from frontend settings. |
| Treating R2 or Durable Objects as the database would blur ownership of run state. | High | D1 is the system of record for indexed run/job/event/usage/artifact metadata; R2 stores blobs only; Durable Objects coordinate only after a proven need. |

### Prompt Drift Prevention

Phase 4 must not normalize:

- browser model/provider/healing ownership for generation pipelines;
- frontend construction of canonical pipeline execution snapshots;
- local runner fallback after backend routing is mandatory;
- local IndexedDB as source of truth for generated learning content;
- permissive parser or markdown-fence extraction in pipeline/backend paths;
- response-healing as permission for parser fallback;
- backend model fallback strings (`snapshot.model_id ?? '...'`) instead of policy resolution;
- direct `fetch` outside infrastructure adapters;
- numbered DB migrations before release;
- Supabase Storage buckets for generation artifacts;
- backend device settings as a place to store generation-pipeline policy;
- R2 JSON objects as the run ledger or queryable database;
- Durable Objects as a homemade workflow engine or global source-of-truth database.

## Current Infrastructure Posture

Phase 4 targets a Cloudflare-native backend:

- **Workflows** own durable execution and retries.
- **D1** owns queryable state: `devices`, `runs`, `jobs`, `events`, `artifacts` metadata, `usage_counters`, and the Learning Content Store.
- **R2** owns generated artifact JSON, stage checkpoints, raw model outputs, eval snapshots, and replay/debug bundles.
- **Durable Objects** are optional v1.5 infrastructure for per-device locking, per-run live fanout, or low-latency sequence allocation after a concrete contention/fanout problem appears.

Do not add numbered DB migrations before release. The next schema artifact should be a canonical D1 schema/init path, not hosted Supabase migration history.

## Target Architecture

### Backend modules

Add these backend modules and keep their interfaces deep and narrow:

- `backend/src/generationPolicy/`
  - resolves model, provider-healing, temperature, and policy hash for each generation job kind;
  - validates the default/operator policy at the seam;
  - exposes `resolveGenerationJobPolicy(deviceId, jobKind)` and `generationPolicyHash(policy)`.
- `backend/src/learningContent/`
  - owns persistence of Subjects, Subject Graphs, Topic Content, study cards, and Crystal Trial question sets;
  - exposes repository methods used by routes, workflow intent expansion, and backend artifact appliers.
- `backend/src/runIntents/`
  - validates browser-submitted generation intents;
  - expands intents into canonical backend `RunInputSnapshot`s using Learning Content Store reads and generation policy;
  - rejects any client-supplied model/provider/healing fields.
- `backend/src/prompts/`
  - owns pipeline prompt construction for all four pipeline kinds;
  - uses source data from snapshots and prompt-template versions from backend constants.
- `backend/src/artifactAppliers/`
  - applies strict-validated artifact payloads into the Learning Content Store transactionally/atomically with workflow persistence.

### Frontend modules

- `src/features/contentGeneration/generationClient.ts` becomes a run-intent facade: `startTopicContent`, `startTopicExpansion`, `startSubjectGraph`, and `startCrystalTrial` submit intents and observe runs.
- `src/infrastructure/repositories/BackendDeckRepository.ts` implements `IDeckRepository` against backend learning-content routes.
- Local Dexie/IndexedDB deck writer code is deleted or narrowed to non-authoritative temporary UI cache only. It must not be used by generation pipelines.
- Pipeline settings are removed from `src/store/studySettingsStore.ts`, `src/types/llmInference.ts`, and `GlobalSettingsSheet.tsx`. Keep study-question/study-formula explanation settings only if still needed.

## Data Model: Learning Content Store

The Learning Content Store lives in D1 as queryable read-model state. Because no released database exists, obsolete generated-content tables should be replaced in the canonical D1 schema/init path rather than migrated forward.

Recommended tables:

- `subjects`
  - `device_id uuid not null references devices(id)`
  - `subject_id text not null`
  - `title text not null`
  - `metadata_json jsonb not null default '{}'::jsonb`
  - `content_source text not null check (...)`
  - `created_by_run_id uuid null references runs(id)`
  - `created_at`, `updated_at`
  - `primary key (device_id, subject_id)`
- `subject_graphs`
  - `device_id`, `subject_id`
  - `graph_json jsonb not null`
  - `content_hash text not null`
  - `updated_by_run_id uuid not null references runs(id)`
  - `primary key (device_id, subject_id)`
- `topic_contents`
  - `device_id`, `subject_id`, `topic_id`
  - `details_json jsonb not null`
  - `content_hash text not null`
  - `status text not null check (status in ('ready','generating','unavailable'))`
  - `updated_by_run_id uuid not null references runs(id)`
  - `primary key (device_id, subject_id, topic_id)`
- `topic_cards`
  - `device_id`, `subject_id`, `topic_id`, `card_id`
  - `card_json jsonb not null`
  - `difficulty integer not null`
  - `source_artifact_kind text not null`
  - `created_by_run_id uuid not null references runs(id)`
  - `primary key (device_id, subject_id, topic_id, card_id)`
- `crystal_trial_sets`
  - `device_id`, `subject_id`, `topic_id`, `target_level integer not null`
  - `card_pool_hash text not null`
  - `questions_json jsonb not null`
  - `content_hash text not null`
  - `created_by_run_id uuid not null references runs(id)`
  - `primary key (device_id, subject_id, topic_id, target_level, card_pool_hash)`

Keep `artifacts` as the immutable audit/cache metadata layer in D1. R2 stores artifact JSON blobs and checkpoints. The Learning Content Store is the application read model.

## Backend API Shape

### Learning content routes

Add routes behind `X-Abyss-Device`:

- `GET /v1/library/manifest`
- `GET /v1/subjects/:subjectId/graph`
- `GET /v1/subjects/:subjectId/topics/:topicId/details`
- `GET /v1/subjects/:subjectId/topics/:topicId/cards`
- `GET /v1/subjects/:subjectId/topics/:topicId/trials/:targetLevel?cardPoolHash=...`

Optional subject bootstrap route if the UI creates a Subject before generation:

- `POST /v1/subjects` with `{ subjectId, title, metadata }`; no model/provider fields.

### Run submission route

Change `POST /v1/runs` from snapshot submission to intent submission:

```ts
{
  "kind": "topic-content" | "topic-expansion" | "subject-graph" | "crystal-trial",
  "intent": { /* kind-specific source request, no model/provider/healing */ }
}
```

Allowed intent shapes:

- Subject Graph Generation:
  - `{ subjectId, checklist }`
- Topic Content Pipeline:
  - `{ subjectId, topicId, stage?: 'theory' | 'study-cards' | 'mini-games' | 'full', forceRegenerate?: boolean }`
- Topic Expansion:
  - `{ subjectId, topicId, nextLevel }`
- Crystal Trial generation:
  - `{ subjectId, topicId, currentLevel }`

The route must reject intents containing any of these fields at any depth where they would affect pipeline policy: `model`, `modelId`, `model_id`, `provider`, `providerHealingRequested`, `responseHealing`, `openRouterResponseHealing`, `plugins`, `response_format`.

The backend expands the intent into a `RunInputSnapshot` with:

- source fields loaded from Learning Content Store;
- backend `schema_version`;
- backend `prompt_template_version`;
- resolved `model_id` from generation policy;
- `provider_healing_requested` from generation policy;
- `generation_policy_hash`.

`inputHash(snapshot)` remains the idempotency/cache key. Model or response-healing policy changes therefore invalidate artifact cache deterministically.

## Generation Policy Details

Files:

- `backend/src/generationPolicy/types.ts`
- `backend/src/generationPolicy/defaultPolicy.ts`
- `backend/src/generationPolicy/parseGenerationPolicy.ts`
- `backend/src/generationPolicy/resolveGenerationPolicy.ts`
- `backend/src/generationPolicy/generationPolicy.test.ts`

Recommended shape:

```ts
type BackendGenerationJobKind =
  | 'subject-graph-topics'
  | 'subject-graph-edges'
  | 'topic-theory'
  | 'topic-study-cards'
  | 'topic-mini-game-category-sort'
  | 'topic-mini-game-sequence-build'
  | 'topic-mini-game-match-pairs'
  | 'topic-expansion-cards'
  | 'crystal-trial';

type GenerationPolicy = {
  version: 1;
  provider: 'openrouter';
  responseHealing: { enabled: true };
  jobs: Record<BackendGenerationJobKind, {
    modelId: string;
    temperature?: number;
  }>;
};
```

Rules:

- v1 response healing is fixed as `{ enabled: true }`; there is no user setting and no device setting.
- If an operator override is later introduced, it must be backend-only and validated by `parseGenerationPolicy`; do not expose it in browser settings.
- Pipeline workflows must never use default model string fallbacks. Missing/invalid policy throws `WorkflowFail('config:invalid', ...)`.
- Job metadata and traces record `modelId`, `generationPolicyHash`, and `providerHealingRequested`.

## PR Sequencing

### Current implementation status (2026-05-07)

- [x] **PR-A** — Plan/status and destructive-reset declaration, including `CHANGELOG.md` skeleton.
- [x] **PR-B** — Backend Generation Policy module (`backend/src/generationPolicy/*`) with strict parser/resolver/hash tests. Workflow snapshot expansion/wiring remains in PR-E/PR-F before the global no-fallback exit criterion can close.
- [x] **PR-C** — Active backend repository adapters are now D1-backed (`backend/src/repositories/*`, `backend/src/learningContent/*`, `Repos.learningContent`) with canonical D1 schema in `backend/d1/init.sql`.
- [~] **PR-D** — Backend Learning Content routes landed in workspace 2026-05-07 (`backend/src/routes/learningContent.ts`) with route-level per-device/not-found tests. Frontend `BackendDeckRepository` and durable-mode read-path wiring are now implemented; production bootstrap failure for missing Worker URL remains open until the legacy local-runner path is deleted.
- [ ] **PR-E+** — Not started.

### PR-A — Plan/status and destructive-reset declaration ✅

Files: `plans/phase4.md`, docs/changelog skeleton.

- Mark Phase 3.6 complete.
- Record accepted decisions: backend model policy, non-toggleable response healing, full backend Learning Content Store, no migration.
- Add boundary-test checklist before implementation starts.

Exit:

- Plan no longer references localStorage-to-Worker migration for response healing.
- Plan no longer treats Phase 3.6 as open.

### PR-B — Backend Generation Policy module ✅

Files: `backend/src/generationPolicy/*`, workflow tests.

- Add policy types, default policy, parser, resolver, and policy hash.
- Include all nine artifact/job kinds.
- Hard-code response healing enabled in v1 policy.
- Add tests proving invalid policy fails loudly and every job kind resolves.

Exit:

- `resolveGenerationJobPolicy()` is the only backend source for pipeline model/healing decisions.

### PR-C — Learning Content Store schema and repositories ✅

Files: D1 schema/init path, `backend/src/learningContent/*`, `backend/src/repositories/index.ts`.

- Add tables listed above to the canonical D1 schema/init path.
- Add repository methods for manifest, subject graph, topic details, cards, and trial sets.
- Add backend route tests around per-device scoping and not-found behavior.

Exit:

- Backend can read/write generated learning content without browser IndexedDB.

### PR-D — Backend learning-content routes and frontend repository adapter ◑

Files: backend content routes, `src/infrastructure/repositories/BackendDeckRepository.ts`, `src/infrastructure/di.ts`, repository tests.

- ✅ Implement backend Learning Content routes:
  - `GET /v1/library/manifest`
  - `GET /v1/subjects/:subjectId/graph`
  - `GET /v1/subjects/:subjectId/topics/:topicId/details`
  - `GET /v1/subjects/:subjectId/topics/:topicId/cards`
  - `GET /v1/subjects/:subjectId/topics/:topicId/trials/:targetLevel?cardPoolHash=...`
- ✅ Add route-level per-device scoping and not-found tests.
- ✅ Implement `IDeckRepository` reads through backend routes using `ApiClient` (`BackendDeckRepository`).
- ✅ Keep all direct HTTP inside infrastructure adapters; hooks/features continue through `IDeckRepository`.
- ✅ Wire `deckRepository` to backend Learning Content reads when `NEXT_PUBLIC_DURABLE_RUNS=true` and `NEXT_PUBLIC_DURABLE_GENERATION_URL` is configured; legacy local-runner builds still use IndexedDB until PR-J.
- ✅ Share the anonymous device id between durable generation and backend deck reads via `src/infrastructure/deviceIdentity.ts`.
- ⏳ Fail loudly at app bootstrap in production when `NEXT_PUBLIC_DURABLE_GENERATION_URL` is missing. Current wiring keeps the legacy IndexedDB path when durable runs are not enabled so the pre-PR-J local runner path remains operational.

Backend manifest contract now required by the frontend adapter:

- `subjects.metadata_json.subject.description: string`
- `subjects.metadata_json.subject.color: string`
- `subjects.metadata_json.subject.geometry.gridTile: GeometryType`
- optional `subjects.metadata_json.subject.topicIds: string[]`
- optional `subjects.metadata_json.subject.metadata: SubjectMetadata`

The frontend adapter intentionally throws if this envelope is missing; backend subject bootstrap / artifact appliers must materialize it instead of relying on frontend defaults.

Exit:

- Frontend read paths can load Subject manifest, Subject Graph, Topic Content, and cards from backend when durable backend mode is configured.

### PR-E — RunIntent submission and backend snapshot expansion

Files: `backend/src/runIntents/*`, `backend/src/routes/runs.ts`, `backend/src/types/api.ts`, `src/features/contentGeneration/generationClient.ts`.

- Change `POST /v1/runs` to accept `{ kind, intent }`.
- Add intent validators with forbidden policy-field rejection.
- Expand intents to snapshots in backend using Learning Content Store and Generation Policy.
- Add `generation_policy_hash` and `provider_healing_requested` to snapshots.
- Update frontend `GenerationClient` to submit intents only.

Exit:

- No frontend runtime path passes `modelId` into pipeline run submission.
- Backend route tests prove client-supplied model/healing fields are rejected.

### PR-F — Backend prompt modules and workflow policy wiring

Files: `backend/src/prompts/*`, `backend/src/workflows/*Workflow.ts`, `backend/src/llm/openrouterClient.ts`.

- Move pipeline prompt construction into backend prompt modules.
- Replace inline workflow prompts with prompt-module calls.
- Replace every `snapshot.model_id ?? ...` and `providerHealingRequested: true` with resolved snapshot/policy fields.
- Assert snapshots contain `model_id`, `generation_policy_hash`, and `provider_healing_requested` after backend expansion.

Exit:

- Backend workflows contain no model fallback strings and no hard-coded provider-healing booleans.

### PR-G — Backend artifact appliers write the Learning Content Store

Files: `backend/src/artifactAppliers/*`, workflow persist steps, tests.

- After strict parse + semantic validation, apply artifacts into the Learning Content Store before `run.completed`.
- Subject Graph Stage A writes graph nodes without edges; Stage B wires prerequisites into the same graph row.
- Topic Theory writes `topic_contents`; study cards and mini-games upsert/append `topic_cards` as appropriate.
- Topic Expansion appends cards with supersession checks.
- Crystal Trial writes `crystal_trial_sets` and does not emit player-assessment completion.
- Cache-hit runs must materialize cached artifacts into the Learning Content Store if the read model is missing.

Exit:

- A close-tab/reopen after backend `ready` can render content from backend reads without local artifact application.

### PR-H — Delete frontend artifact appliers and local deck persistence authority

Files: frontend appliers, `appliedArtifactsStore`, Dexie deck writer/repository wiring, hydration/event handlers.

- Remove frontend artifact appliers as source-of-truth writers.
- `generationRunEventHandlers` observes run events, emits legacy AppEventBus notifications, and invalidates/refetches backend-backed queries; it does not write generated learning content to IndexedDB.
- Delete or quarantine local deck persistence so it cannot serve generated content for pipeline paths.

Exit:

- No generated learning-content pipeline path writes to browser IndexedDB/localStorage.

### PR-I — Remove frontend pipeline model/provider/healing settings

Files: `src/store/studySettingsStore.ts`, `src/types/llmInference.ts`, `src/components/settings/GlobalSettingsSheet.tsx`, `src/infrastructure/llmInferenceSurfaceProviders.ts`.

- Delete `openRouterResponseHealing`.
- Delete pipeline inference surface IDs from frontend settings: `subjectGenerationTopics`, `subjectGenerationEdges`, `topicContent`, `crystalTrial`.
- Keep or rename study-only settings for `studyQuestionExplain` and `studyFormulaExplain`.
- Remove `validatePipelineSurfaceConfig`, `assertPipelineSurfaceConfigValid`, and OpenRouter structured-output helpers from frontend pipeline paths.

Exit:

- Global Settings only exposes study-explanation inference preferences, not generation-pipeline model policy.

### PR-J — Remove local in-tab runners and durable routing flags

Files to delete/refactor:

- `src/infrastructure/repositories/LocalGenerationRunRepository.ts`
- `src/infrastructure/repositories/localGenerationRunArtifactCapture.ts`
- `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts`
- `src/features/contentGeneration/jobs/runExpansionJob.ts`
- `src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.ts`
- `src/features/crystalTrial/generateTrialQuestions.ts`
- local-runner tests
- `NEXT_PUBLIC_DURABLE_RUNS`
- `NEXT_PUBLIC_DURABLE_RUNS_KINDS`

Recommended implementation:

- `createGenerationClient()` accepts a single durable repository/intent adapter.
- `wireGenerationClient.ts` registers durable-only clients unconditionally when backend URL exists.
- Production build fails loudly if backend URL is missing.

Exit:

- No local generation runner import specifiers remain.

### PR-K — Drop navigation abort

Files: `src/types/contentGenerationAbort.ts`, `src/hooks/useContentGenerationLifecycle.ts`, call sites.

- Remove `{ kind: 'navigation'; source: 'beforeunload' }`.
- Delete `useContentGenerationLifecycle.ts` if its only remaining purpose is beforeunload cancellation.
- Preserve user cancel and superseded cancel through Worker routes.

Exit:

- No beforeunload path aborts generation.

### PR-L — Delete permissive pipeline parsers and frontend prompt/snapshot builders

Candidate files:

- `src/features/contentGeneration/parsers/*Payload.ts`
- `src/features/subjectGeneration/graph/topicLattice/parseTopicLatticeResponse.ts`
- `src/lib/llmResponseText.ts` if no display-only caller remains
- frontend pipeline prompt templates/builders that moved to backend
- frontend pipeline snapshot builders no longer used by runtime submission

Keep only:

- shared transport/event/artifact types needed by the frontend;
- strict contracts/eval fixtures if still intentionally shared by frontend tests;
- the documented `correctPrereqEdges` backend Stage B repair exception.

Exit:

- No pipeline/backend path imports permissive parsers or frontend prompt builders.

### PR-M — Final docs, changelog, and boundary tests

Files: `README.md`, `docs/security/*`, `CHANGELOG.md`, boundary tests.

- Document durable-only backend generation.
- Document Learning Content Store as the source of truth.
- Document no migration / destructive reset via the canonical D1 schema/init path.
- Document Workflows + D1 + R2 default infrastructure and Durable Objects as optional coordination only.
- Clarify `deviceId` remains an identifier, not a credential, until auth migration.

Exit:

- Docs match implemented behavior.

## Boundary Tests Required

Add repository-wide tests that fail if any of these regressions appear:

- No `resolveModelForSurface('subjectGenerationTopics' | 'subjectGenerationEdges' | 'topicContent' | 'crystalTrial')` under `src/**`.
- No `openRouterResponseHealing` under `src/**`.
- No pipeline surface IDs in frontend settings UI/state.
- No frontend generation submission type contains `modelId`, `model_id`, `providerHealingRequested`, `responseHealing`, `plugins`, or `response_format`.
- No backend workflow contains `providerHealingRequested: true` literals.
- No backend workflow contains model fallback expressions like `snapshot.model_id ??`.
- `POST /v1/runs` rejects policy fields in intents.
- `generation_policy_hash` changes when backend model policy changes.
- Backend cache-hit path materializes Learning Content Store rows before emitting completion.
- No local runner files exist.
- No `NEXT_PUBLIC_DURABLE_RUNS` / `NEXT_PUBLIC_DURABLE_RUNS_KINDS` references remain.
- No `kind: 'navigation'` content-generation abort reason can be constructed.
- No pipeline/backend path imports `extractJsonString()` or deprecated permissive parsers.
- No component/hook imports `ApiClient`, `DurableGenerationRunRepository`, or SSE primitives directly.
- No `backend/migrations/*.sql`, Supabase Storage bucket setup, backend generation-settings route/table, R2-as-database pattern, or Durable-Objects-as-workflow-engine pattern returns.

## Exit Criteria

- [ ] Frontend submits only generation intents for all four pipeline kinds.
- [ ] Backend expands intents into canonical snapshots with model/policy/healing fields.
- [ ] Backend Generation Policy is the only model/response-healing authority for pipelines.
- [ ] Response healing has no user-facing toggle or frontend persisted state.
- [ ] Backend workflows use backend prompt modules and contain no inline model fallbacks.
- [ ] Learning Content Store persists generated Subjects, Subject Graphs, Topic Content, study cards, and Crystal Trial question sets.
- [ ] Frontend reads generated learning content from backend repositories.
- [ ] Frontend artifact appliers and local generated-content writers are deleted or non-authoritative and unreachable from pipeline paths.
- [ ] Local in-tab runners are deleted.
- [ ] Durable routing flags are deleted.
- [ ] Navigation abort is deleted.
- [ ] Permissive pipeline parsers are deleted or unreachable from pipeline/backend paths.
- [ ] Close-tab/reopen verification passes for Subject Graph Generation, Topic Content Pipeline, Topic Expansion, and Crystal Trial generation using backend content reads.
- [ ] Docs/changelog clearly state the destructive reset, Workflows + D1 + R2 infrastructure split, optional Durable Objects posture, and backend-authoritative architecture.

## Manual Verification Before Program Close

1. Reset local browser storage, reset the D1 development database from the canonical schema/init path, and clear the R2 artifact bucket if testing cache-free generation.
2. Create a Subject; confirm the backend Learning Content Store has a `subjects` row.
3. Run Subject Graph Generation; close the tab before completion; reopen and confirm graph renders from backend rows exactly once.
4. Run Topic Content Pipeline; close the tab before completion; reopen and confirm theory/cards/mini-games render from backend rows exactly once.
5. Trigger Topic Expansion; confirm new cards append in backend `topic_cards` and superseded runs do not show player-facing failures.
6. Generate a Crystal Trial; confirm questions load from backend `crystal_trial_sets` and no `crystal-trial:completed` assessment event fires.
7. Change backend model policy in a test environment; submit the same intent and confirm `generation_policy_hash` and `input_hash` change.
8. Confirm OpenRouter request bodies include `response-healing` from backend policy and that no frontend setting controls it.
9. Run boundary searches for local runners, durable flags, navigation abort, frontend pipeline model resolution, frontend response-healing settings, and permissive parser imports.

When these checks pass, the Durable Workflow Orchestration program is complete and the browser is no longer responsible for content-generation pipelines. Auth, multi-device account sync, richer observability, and new generation surfaces proceed as follow-on initiatives.
