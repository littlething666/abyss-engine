# Phase 4 Temporary Recommended Next Steps

Last updated: 2026-05-07.

## Status review

The previous ordering is still broadly correct, with two updates from this pass:

1. **Stale root-owned SQL files remain blocked by filesystem permissions.** `backend/db/init.sql` and `backend/db/reset.sql` are owned by `root:root` and cannot be removed by the current agent user. `backend/d1/init.sql` and `backend/d1/reset.sql` remain the canonical D1 schema/reset paths.
2. **Backend Learning Content routes are implemented.** `backend/src/routes/learningContent.ts` now exposes the read routes below, mounted under `/v1`, with route-level per-device/not-found tests in `backend/src/routes/learningContent.test.ts`.
3. **Frontend backend deck reads are wired for durable mode.** `src/infrastructure/repositories/BackendDeckRepository.ts` implements `IDeckRepository` against the Learning Content routes via `ApiClient`, and `src/infrastructure/deckRepositoryFactory.ts` switches `deckRepository` to backend reads when `NEXT_PUBLIC_DURABLE_RUNS=true` and `NEXT_PUBLIC_DURABLE_GENERATION_URL` is configured. Legacy local-runner builds still use IndexedDB until Phase 4 deletes local runners.

## Completed in this pass

- `GET /v1/library/manifest`
- `GET /v1/subjects/:subjectId/graph`
- `GET /v1/subjects/:subjectId/topics/:topicId/details`
- `GET /v1/subjects/:subjectId/topics/:topicId/cards`
- `GET /v1/subjects/:subjectId/topics/:topicId/trials/:targetLevel?cardPoolHash=...`
- Tests for device-scoped repository calls, missing read-model rows returning `404`, and malformed Crystal Trial route inputs returning `400`.
- `BackendDeckRepository` with strict Learning Content transport wrappers, encoded route paths, card wrapper/id mismatch checks, and manifest mapping from backend subject rows to frontend `Subject` values.
- Shared frontend device identity helper (`src/infrastructure/deviceIdentity.ts`) so backend deck reads and durable run submission use the same anonymous `X-Abyss-Device` value.
- Repository factory tests proving backend deck reads activate only when durable runs and the Worker URL are both configured.

## Recommended next steps

1. **Resolve stale root-owned SQL files outside the agent sandbox**
   - Remove `backend/db/init.sql` and `backend/db/reset.sql`, or fix ownership so the agent can remove them.
   - Keep `backend/d1/init.sql` as the only canonical schema path.

2. **Backend subject read-model materialization contract**
   - Ensure backend artifact appliers / subject bootstrap write `subjects.metadata_json.subject` with the frontend manifest envelope required by `BackendDeckRepository`: `description`, `color`, `geometry`, optional `topicIds`, and optional domain `metadata`.
   - Keep this as an explicit seam contract; do not add frontend defaults for missing subject presentation fields.

3. **Move `POST /v1/runs` from snapshots to intents**
   - Accept `{ kind, intent }`, not client-built snapshots.
   - Reject policy fields at any depth: `model`, `modelId`, `model_id`, `provider`, `providerHealingRequested`, `responseHealing`, `openRouterResponseHealing`, `plugins`, `response_format`.
   - Expand intents server-side using Learning Content Store + backend Generation Policy.

4. **Wire backend policy into workflow snapshots**
   - Ensure all workflow paths use backend-resolved `model_id`, `generation_policy_hash`, and `provider_healing_requested`.
   - Remove workflow fallback model strings / hard-coded healing booleans.

5. **Add backend prompt modules**
   - Move prompt construction behind backend seams.
   - Keep strict schema + semantic validation path unchanged.

6. **Artifact appliers on backend**
   - After validated artifacts are written to R2/D1 metadata, apply them to the D1 Learning Content Store before `run.completed`.
   - Cache-hit runs must materialize Learning Content Store rows before completion.

7. **Delete local runner / settings legacy**
   - Remove local pipeline runners after durable-only intent routing works.
   - Remove frontend generation model/healing settings.
   - Remove `NEXT_PUBLIC_DURABLE_RUNS*` flags and navigation abort.

8. **Final boundary/docs pass**
   - Add repo-wide tests for no local runners, no frontend model policy, no response-healing setting, no Supabase, no Durable Object workflow/database pattern.
   - Update docs once behavior matches implementation.
