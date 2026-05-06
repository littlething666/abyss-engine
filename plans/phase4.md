<aside>
📌

**Important.** WARNING: This plan is not up to date with the current codebase.

**Scope.** File-level implementation plan for Phase 4, the *final* phase of the Durable Workflow Orchestration program. Written against fork `littlething666/abyss-engine` @ `716b0780` plus the projected end-state of Phases 0 → 3. Phase 4 is **destructive cleanup + productionization**: it deletes the local in-tab runners, removes deprecated permissive parsers from generation pipeline code paths, drops the `'navigation'` abort reason, locks down CORS, ships the threat-model + retention docs, transfers `openRouterResponseHealing` ownership to the server, and lays the foundation for Supabase Auth migration.

**Prerequisite gates (must be green before any Phase 4 PR opens):** every pipeline (`subject-graph`, `topic-content`, `topic-expansion`, `crystal-trial`) is backend-routed by default with `NEXT_PUBLIC_DURABLE_RUNS=true`; Phase 3 telemetry + token accounting is live; failure-rate dashboards have shown ≥ 14 consecutive days at the durable success-rate floor declared at Phase 3 exit.

</aside>

## 📖 Overview

Phase 4 is the **only** phase that *removes* code paths. Every prior phase added a parallel durable path while preserving the legacy in-tab path behind `NEXT_PUBLIC_DURABLE_RUNS`. Phase 4 retires the legacy path entirely.

Four invariants must hold at the end of Phase 4:

1. **`LocalGenerationRunRepository.ts` is deleted** along with the four legacy entry points (`runTopicGenerationPipeline`, `runExpansionJob`, `createSubjectGenerationOrchestrator`, `generateTrialQuestions`). The `GenerationClient` always resolves to `DurableGenerationRunRepository`.
2. **Permissive pipeline parsers are deleted** from the four `@deprecated`-marked files landed in PR #44. Non-pipeline display surfaces that still need permissive shaping keep their own narrowly-scoped helpers.
3. **`ContentGenerationAbortReason` no longer carries `{ kind: 'navigation' }`.** All references — including `useContentGenerationLifecycle.ts` and the abort-reason guards — drop the navigation branch.
4. **`openRouterResponseHealing` is owned server-side.** The client no longer reads or persists this setting; the Worker derives it from per-device settings stored in Supabase.

The `Eval Gate` workflow (PR #51) does NOT block Phase 4 because Phase 4 changes neither prompts, schemas, nor model bindings. The full `pr-unit-tests.yml` Vitest run remains the required check, plus the new `legacyRunnerBoundary.test.ts` and `legacyParserBoundary.test.ts` whose assertions tighten in this phase.

## 🔍 Compliance, Risk & Drift Assessment

*(mandated by repo-root [AGENTS.md](http://AGENTS.md) § "Mandatory Collaboration Output". Reproduce in every Phase 4 PR description.)*

### Misalignment check

- **Layered architecture.** All durable I/O continues to flow through `DurableGenerationRunRepository` under `src/infrastructure/repositories/`. No new `fetch` reaches features/components/hooks. The `eventBusHandlers.ts` exception is preserved.
- **Repository pattern.** `IGenerationRunRepository` stays the only seam between `GenerationClient` and the Worker. The interface gains zero methods in Phase 4 — only its sole implementation.
- **Analytics SDK isolation.** `posthog-js` imports remain confined to `src/infrastructure/posthog/*`. Phase 4's `openRouterResponseHealing` migration to server-side ownership does NOT introduce a new browser SDK.
- **No magic strings.** The deletion of `'navigation'` from `ContentGenerationAbortReason` is enforced by the type system — every callsite either narrows on `kind === 'navigation'` (deleted) or constructs the reason inline (deleted).
- **No legacy burden.** This phase IS the legacy-burden retirement. Every `@deprecated` JSDoc landed in PR #44 either has its file deleted or has the `@deprecated` block removed because the file's pipeline-path callers are gone.
- **Curriculum prerequisite-edge exception preserved.** The Subject Graph Stage B `correctPrereqEdges` deterministic-repair narrow exception in [AGENTS.md](http://AGENTS.md) survives Phase 4 untouched; it lives inside the Worker's strict-validate step, not inside `parseTopicLatticeResponse.ts` (which is deleted with the rest of the legacy permissive parsers).
- **Mobile-first / WebGPU strictness.** No UI/renderer/shader surface is touched.

### Architectural risk

| Risk | Severity | Mitigation | A site-pinned developer relies on the legacy in-tab path with `NEXT_PUBLIC_DURABLE_RUNS=false` and discovers the regression only on rebase. | Medium | The flag is REMOVED in PR-D below — there is no "local fallback" to fall back to. Migration note in `CHANGELOG.md` calls this out and points at the Phase 1+2 success criteria as the upgrade gate. Drift-prevention test asserts `process.env.NEXT_PUBLIC_DURABLE_RUNS` no longer appears anywhere in `src/**`. |
| --- | --- | --- | --- | --- | --- |
| A non-pipeline display surface (study-question explain, study-formula explain) still calls `extractJsonString()`; deleting it would regress those features. | Medium | `extractJsonString()` and `stripMarkdownJsonFenceForDisplay()` are MOVED, not deleted: they relocate to `src/features/study/lib/legacyDisplayJson.ts` (or similar feature-scoped module) where the only callers live. The boundary test then forbids any `src/features/contentGeneration/**`, `src/features/subjectGeneration/**`, `src/features/crystalTrial/**`, `src/features/generationContracts/**`, or `backend/**` import of these helpers. | Removing `'navigation'` regresses the closing-tab-mid-local-run UX (no abort markdown log). | Low | By Phase 4, no run is local. The `useContentGenerationLifecycle` hook is deleted in its entirety after the navigation branch is dropped (the `'user'` and `'superseded'` branches are constructed by HUD UI / supersession map, not by lifecycle). |
| Server-side OpenRouter healing settings drift from per-device client expectations during the migration window. | Medium | One-shot migration step on first Worker boot post-deploy: `PUT /v1/settings/migrate-from-localstorage` accepts a one-time payload with the legacy localStorage `openRouterResponseHealing` boolean and seeds `device_settings.openrouter_response_healing`. The browser sends this exactly once, then deletes the localStorage key. | CORS lockdown blocks a forgotten internal preview deploy. | Low | The new allowlist is environment-driven (`PRODUCTION_ORIGINS` env in `wrangler.toml`); preview deploys add their own ephemeral origin. Tested against a synthetic `Origin: https://example.com` request in Worker integration tests. |

### Prompt-drift prevention

- This subpage and every Phase 4 PR must restate: *no `json_object` fallback, no permissive parser in pipeline paths, no inline `posthog-js` import outside `src/infrastructure/posthog/*`**, no direct **`fetch`** outside **`src/infrastructure/`**, no magic-string status/event/failure-code literals, no client-side **`openRouterResponseHealing` read/write*.
- Three new boundary tests pin the Phase 4 contract:
    - `localGenerationDeletionBoundary.test.ts` — asserts `LocalGenerationRunRepository.ts` and the four legacy runner files no longer exist in the working tree.
    - `legacyParserDeletionBoundary.test.ts` — extends PR #44's `legacyParserBoundary.test.ts`: the four `@deprecated`-marked parser files no longer exist OR have been moved to the feature-scoped legacyDisplayJson module; **no** import of those filenames remains anywhere under `src/features/contentGeneration/pipelines/*`, `src/features/contentGeneration/jobs/*`, or `src/features/subjectGeneration/orchestrator/*`.
    - `clientResponseHealingBoundary.test.ts` — walks `src/**/*.{ts,tsx}` and asserts no source file references `openRouterResponseHealing`, `OPEN_ROUTER_RESPONSE_HEALING`, or any localStorage key matching `/openRouterResponseHealing/i`.

## 🎯 Phase 4 goals (reaffirmed from Plan v3)

1. **CORS allowlist for production domains** — replace permissive Phase 1 dev allowlist with a tight, env-driven production allowlist.
2. **Threat-model doc** — pre-auth `deviceId`, Supabase service role, signed-URL artifact access, and the auth migration plan.
3. **Supabase Storage retention/lifecycle policy** — TTL on `generation-artifacts` keyed by access-pattern + per-device cap.
4. **Remove `'navigation'` from `ContentGenerationAbortReason`**.
5. **Delete `LocalGenerationRunRepository` and legacy in-tab runners**.
6. **Remove deprecated permissive parsers from generation pipeline code paths**.
7. **Remove client-side `openRouterResponseHealing` ownership** (server-side authoritative).
8. **Plan Supabase Auth migration** from `device_id` to `user_id` (specification only — implementation lands in a follow-on initiative).

## 🧱 Step 1 — CORS lockdown (`backend/src/middleware/cors.ts`)

**File:** `backend/src/middleware/cors.ts` (REPLACE Phase 1 permissive impl)

### 1.1 Allowlist source

The Phase 1 implementation hardcoded `http://localhost:3000` plus the production app origin. Phase 4 reads from `Env.PRODUCTION_ORIGINS` (comma-separated) declared in `wrangler.toml` per environment:

```toml
[env.production.vars]
PRODUCTION_ORIGINS = "https://abyss-engine.app,https://www.abyss-engine.app"

[env.preview.vars]
# Preview deploys add their own ephemeral *.pages.dev origin per branch.
PRODUCTION_ORIGINS = "https://preview.abyss-engine.app"

[env.dev.vars]
PRODUCTION_ORIGINS = "http://localhost:3000"
```

### 1.2 Middleware behavior

```tsx
import type { Context, Next } from 'hono';

export function cors() {
	return async (c: Context<{ Bindings: Env }>, next: Next) => {
		const allow = (c.env.PRODUCTION_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
		const origin = c.req.header('origin');
		const isPreflight = c.req.method === 'OPTIONS';

		if (origin && allow.includes(origin)) {
			c.header('Access-Control-Allow-Origin', origin);
			c.header('Vary', 'Origin');
			c.header('Access-Control-Allow-Credentials', 'false');
			c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
			c.header('Access-Control-Allow-Headers', 'content-type,idempotency-key,x-abyss-device,last-event-id');
			c.header('Access-Control-Max-Age', '600');
		}

		if (isPreflight) return new Response(null, { status: origin && allow.includes(origin) ? 204 : 403 });
		if (origin && !allow.includes(origin)) return c.json({ code: 'cors:forbidden', message: 'origin not allowed' }, 403);

		await next();
	};
}
```

- Disallowed origins receive a `403` with structured failure body (no permissive `*` fallback).
- `Access-Control-Allow-Credentials` stays `false` because the client never sends cookies — `X-Abyss-Device` is the identity token.
- The `Vary: Origin` header is required so Cloudflare's edge cache does not cross-pollinate responses across origins.

### 1.3 Tests

`backend/src/middleware/cors.test.ts`:

- Allowed production origin → preflight `204` with full ACAO headers.
- Disallowed origin → preflight `403`, non-preflight `403` with `cors:forbidden` body.
- Missing `Origin` header → request proceeds; no ACAO header set (server-to-server / internal).
- Comma-trimmed allowlist parses correctly with whitespace and trailing commas.

## 🧱 Step 2 — Threat model (`backend/SECURITY.md`, `docs/threat-model.md`)

**Files:** `backend/SECURITY.md` (UPDATE; Phase 1 stub) + `docs/threat-model.md` (NEW; root-level public-facing doc)

### 2.1 Required sections

1. **Identity boundaries.**
    - `X-Abyss-Device` is an *identifier*, not a credential. Anyone with a device UUID can read that device's runs and artifacts. This is documented and accepted for the pre-auth window only.
    - Supabase service role is held only by the Worker. Browser bundles never reference `SUPABASE_SERVICE_ROLE`. The Worker is the only Supabase RLS bypass surface.
    - Signed URLs from `GET /v1/artifacts/:id` carry a 15-minute TTL and are scoped by `(device_id, kind, input_hash)`. Replay outside the window 404s.
2. **Trust boundaries.**
    - Browser → Worker via HTTPS + CORS allowlist (Step 1).
    - Worker → OpenRouter via HTTPS, API key never logged.
    - Worker → Supabase via service-role JWT, scoped per-request.
    - Worker → Cloudflare Workflows binding, internal.
3. **Failure modes.**
    - Lost `deviceId` = lost run history (acceptable pre-auth).
    - Stolen `deviceId` (e.g., shared device) = read access to that device's runs. Documented; Supabase Auth migration mitigates.
    - Compromised OpenRouter API key = service degradation; rotated via `wrangler secret put`. No PII at risk because the Worker never sends user identifiers to OpenRouter.
    - Compromised Supabase service-role key = full data exposure across all devices. Rotation procedure documented.
4. **Auth migration plan (forward-looking — Step 8).**
5. **Vulnerability disclosure** — link to repo's security policy issue label.

### 2.2 Tests

No runtime tests; documentation. `pnpm run lint:docs` (or equivalent markdown lint job in `pr-unit-tests.yml`) ensures the file is valid markdown and links resolve.

## 🧱 Step 3 — Supabase Storage retention/lifecycle (`backend/migrations/0010_artifact_retention.sql` + `backend/src/jobs/pruneArtifacts.ts`)

**Files:**

- `backend/migrations/0010_artifact_retention.sql` (NEW)
- `backend/src/jobs/pruneArtifacts.ts` (NEW; Cloudflare Cron Trigger handler)
- `backend/wrangler.toml` (UPDATE — add cron trigger)

### 3.1 Retention policy

Three axes governed by per-row metadata in the existing `artifacts` table:

- **Time-to-live**: artifacts with `last_accessed_at < now() - interval '90 days'` AND `last_applied_at < now() - interval '90 days'` are deleted from Storage and the row is hard-deleted.
- **Per-device cap**: 500 artifacts per `device_id` (across all kinds). Eviction policy: oldest `last_accessed_at` first; never evict an artifact whose `created_by_run_id` is referenced as `parent_run_id` of any unfinalized run.
- **Orphaned-storage sweep**: weekly scan of `generation-artifacts` bucket; objects whose `storage_key` does not appear in the `artifacts` table are deleted.

### 3.2 Migration

```sql
alter table artifacts
	add column last_accessed_at timestamptz not null default now(),
	add column last_applied_at timestamptz null;

create index idx_artifacts_device_lru on artifacts(device_id, last_accessed_at);
create index idx_artifacts_orphan_sweep on artifacts(storage_key);
```

The `last_accessed_at` column is touched by `GET /v1/artifacts/:id`. The `last_applied_at` column is set by an explicit client `POST /v1/artifacts/:id/apply-ack` call invoked from `applyRunEvent` after `ArtifactApplier.apply` returns `{ applied: true }` — this lets the retention policy distinguish artifacts the client *consumed* from artifacts that merely sat in cache.

### 3.3 Cron worker

```tsx
// backend/src/jobs/pruneArtifacts.ts
import { makeRepos } from '../repositories';

export async function pruneArtifacts(env: Env) {
	const repos = makeRepos(env);
	const expired = await repos.artifacts.findExpired(); // last_accessed_at AND last_applied_at older than 90d
	for (const a of expired) {
		await repos.artifacts.deleteFromStorage(a.storage_key);
		await repos.artifacts.deleteRow(a.id);
	}
	const overcap = await repos.artifacts.findOverCap(500);
	for (const a of overcap) {
		await repos.artifacts.deleteFromStorage(a.storage_key);
		await repos.artifacts.deleteRow(a.id);
	}
	const orphans = await repos.artifacts.findStorageOrphans();
	for (const key of orphans) await repos.artifacts.deleteFromStorage(key);
}
```

```toml
# wrangler.toml additions
[[triggers.crons]]
schedule = "0 4 * * *"   # daily at 04:00 UTC
name = "prune-artifacts-daily"

[[triggers.crons]]
schedule = "0 5 * * 0"   # weekly Sunday 05:00 UTC
name = "prune-artifacts-orphan-sweep"
```

### 3.4 Tests

`backend/src/jobs/pruneArtifacts.test.ts`:

- Expired artifact deleted from both Storage and table.
- Per-device cap evicts oldest LRU first; never evicts artifact referenced by an unfinalized run.
- Orphan sweep deletes only objects with no matching `artifacts.storage_key` row.
- Idempotent: running the cron twice in succession is a no-op the second time.

## 🧱 Step 4 — Drop `'navigation'` from `ContentGenerationAbortReason`

**Files:**

- `src/types/contentGenerationAbort.ts` (UPDATE)
- `src/hooks/useContentGenerationLifecycle.ts` (DELETE)
- All call sites of `useContentGenerationLifecycle` (UPDATE — remove the hook invocation)

### 4.1 Type narrowing

```tsx
// BEFORE (current main; lines 5–11):
export type ContentGenerationAbortReason =
	| { kind: 'user'; source: ContentGenerationUserAbortSource }
	| { kind: 'navigation'; source: 'beforeunload' }
	| { kind: 'superseded'; source: 'expansion-replaced' };

// AFTER:
export type ContentGenerationAbortReason =
	| { kind: 'user'; source: ContentGenerationUserAbortSource }
	| { kind: 'superseded'; source: 'expansion-replaced' };
```

The `isContentGenerationAbortReason` guard drops its navigation branch; `isContentGenerationAbortReasonExcludedFromFailureMarkdown` retains only the `'user'` and `'superseded'` branches.

### 4.2 Hook deletion

`src/hooks/useContentGenerationLifecycle.ts` is **deleted in its entirety**. Its only purpose was the `beforeunload` `navigationAbortReason` dispatch — by Phase 4 every run is backend-routed and survives tab close, so the hook has no remaining job. The Phase 1 patch (which already skipped backend-routed runs) is irrelevant: there are no local runs left to skip.

Callsites: locate via `grep -r useContentGenerationLifecycle src/` and remove each invocation. The HMR `disposers` pattern in `eventBusHandlers.ts` is unaffected.

### 4.3 Failure-markdown surface

The markdown emitter (`buildPipelineFailureLog` and friends inside `runTopicGenerationPipeline.ts` etc.) is also deleted with the legacy runners (Step 5). `useContentGenerationStore` retains `registerSessionAbortRouting` for the `'user'` and `'superseded'` reasons, fed by the HUD cancel button and the supersession map respectively.

### 4.4 Tests

- `src/types/contentGenerationAbort.test.ts` (UPDATE) — remove navigation branch tests; assert the type compile-fails when an arbitrary string `'navigation'` is passed.
- Boundary test `localGenerationDeletionBoundary.test.ts` (NEW; see Step 5) asserts no source file references `'navigation'` as an abort `kind`.

## 🧱 Step 5 — Delete `LocalGenerationRunRepository` and legacy in-tab runners

### 5.1 Files DELETED

- `src/infrastructure/repositories/LocalGenerationRunRepository.ts` (Phase 0.5 introduction)
- `src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts` and all its `pipelines/` siblings reachable only from it
- `src/features/contentGeneration/jobs/runExpansionJob.ts`
- `src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.ts` and `resolveSubjectGenerationStageBindings.ts`
- `src/features/crystalTrial/generateTrialQuestions.ts`
- `src/features/contentGeneration/runContentGenerationJob.ts` (Phase 0 step 8 boundary lives at the in-tab job runner; once no in-tab pipelines exist, this file becomes unreferenced)
- `src/features/contentGeneration/retryContentGeneration.ts`'s in-tab branches collapse — the file shrinks to a thin pass-through that just calls `client.retry(...)`. Decision: delete the file; move `retryFailedJob` / `retryFailedPipeline` / `emitRetryFailed` helpers directly onto `GenerationClient` if any callsite still needs them.

### 5.2 `GenerationClient` simplification

The Phase 0.5 facade signature stays. The factory loses its `localRepo` + `flags` arguments:

```tsx
export function createGenerationClient(deps: {
	deviceId: string;
	now: () => number;
	repo: IGenerationRunRepository; // always DurableGenerationRunRepository in Phase 4
}): GenerationClient;
```

The `NEXT_PUBLIC_DURABLE_RUNS` flag is deleted from `.env.example`, `README.md`, and every consumer. `wireGeneration.ts` is updated to instantiate `DurableGenerationRunRepository` unconditionally.

### 5.3 Boundary test (NEW)

`src/infrastructure/legacyRunnerDeletionBoundary.test.ts`:

- Walks `src/**/*.{ts,tsx}` and asserts none of the deleted file paths exist (uses `fs.existsSync` against the working tree at test time).
- Asserts no import statement references the deleted module specifiers (`@/features/contentGeneration/pipelines/runTopicGenerationPipeline`, `@/features/contentGeneration/jobs/runExpansionJob`, `@/features/subjectGeneration/orchestrator/*`, `@/features/crystalTrial/generateTrialQuestions`, `@/infrastructure/repositories/LocalGenerationRunRepository`).
- Asserts `process.env.NEXT_PUBLIC_DURABLE_RUNS` no longer appears anywhere in `src/**`.
- Asserts `'navigation'` does not appear as a string literal under `src/types/contentGenerationAbort.ts`.

### 5.4 Test cleanup

Each deleted runtime file's adjacent `.test.ts` is also deleted. The Phase 0.5 `LocalGenerationRunRepository.test.ts` and the four adapter-coverage tests are deleted with their target.

## 🧱 Step 6 — Remove deprecated permissive parsers from generation pipeline paths

### 6.1 Files DELETED

The four `@deprecated`-marked parsers from PR #44 are deleted entirely **if and only if** their non-pipeline display callers have already migrated. Per the current main (Step 5 codebase review):

- `src/features/contentGeneration/parsers/parseCrystalTrialPayload.ts` — only callers were the legacy in-tab Crystal Trial runner deleted in Step 5 → **DELETE**.
- `src/features/contentGeneration/parsers/parseTopicCardsPayload.ts` (and `diagnoseTopicCardsPayload`) — only callers were the legacy in-tab topic-content / topic-expansion runners deleted in Step 5 → **DELETE**. The adjacent `normalizeGeneratedCardItem.ts`, `normalizeMiniGameCardContent.ts`, and `validateGeneratedCard.ts` are deleted with it (they were only referenced from the deleted parser).
- `src/features/contentGeneration/parsers/parseTopicTheoryContentPayload.ts` — same fate → **DELETE**.
- `src/features/subjectGeneration/graph/topicLattice/parseTopicLatticeResponse.ts` — same fate → **DELETE**. The Subject Graph Stage B `correctPrereqEdges` deterministic-repair narrow exception relocates to the Worker's `validate.ts` step, where it operates on the already-Zod-parsed lattice (NOT on raw text).
- `src/lib/llmResponseText.ts` `extractJsonString()` — STILL has live non-pipeline callers (study-question explain, study-formula explain). **MOVE**, do not delete: relocate to `src/features/study/lib/legacyDisplayJson.ts`. `stripMarkdownJsonFenceForDisplay()` and `logJsonParseError()` move with it. The original file `src/lib/llmResponseText.ts` is deleted.

### 6.2 Boundary test (NEW)

`src/features/generationContracts/strictParsers/legacyParserDeletionBoundary.test.ts` extends PR #44's `legacyParserBoundary.test.ts`:

- Original assertion (no contracts-module import of the five forbidden specifier fragments) stays.
- New assertion: the five forbidden specifier fragments do NOT match any *file path* under `src/features/contentGeneration/parsers/*`, `src/features/subjectGeneration/graph/topicLattice/parseTopicLatticeResponse*`, or `src/lib/llmResponseText*`. The file walker uses `fs.readdirSync` recursively.
- New assertion: `legacyDisplayJson` is imported only from files matching `src/features/study/**`. No `src/features/contentGeneration/**`, `src/features/subjectGeneration/**`, `src/features/crystalTrial/**`, `src/features/generationContracts/**`, or `backend/**` import is permitted.

### 6.3 Worker-side prerequisite-edge correction relocation

The deterministic `correctPrereqEdges(rawLattice, edges)` helper today runs inside `parseTopicLatticeResponse.ts` BEFORE Zod validation, on raw model output. In Phase 4 it relocates to `backend/src/workflows/steps/validate.ts` for the `subject-graph-edges` workflow:

```tsx
// backend/src/workflows/steps/validate.ts (subject-graph-edges branch)
import { correctPrereqEdges } from '@contracts/subjectGraph/correctPrereqEdges';

// runs AFTER strictParseArtifact returned ok and BEFORE semanticValidateArtifact
const corrected = correctPrereqEdges(parsed, latticeFromStageA);
const sem = semanticValidateArtifact('subject-graph-edges', corrected, ctx);
if (!sem.ok) throw new WorkflowFail(sem.code, sem.message);
return corrected; // persisted as the artifact payload
```

The helper moves into `src/features/generationContracts/subjectGraph/correctPrereqEdges.ts` so both Worker and any future tool can consume it through the contracts barrel. The narrow [AGENTS.md](http://AGENTS.md) exception text is updated to reference the new file path.

### 6.4 Tests

- Existing `parseCrystalTrialPayload.test.ts`, `parseTopicCardsPayload.test.ts`, `parseTopicTheoryContentPayload.test.ts`, `normalizeMiniGameCardContent.test.ts` — DELETED with their target.
- New `correctPrereqEdges.test.ts` covers the relocated helper with the existing test fixtures.

## 🧱 Step 7 — Remove client-side `openRouterResponseHealing` ownership

### 7.1 Server-side authoritative storage

`backend/migrations/0011_device_settings.sql`:

```sql
create table device_settings (
	device_id uuid primary key references devices(id) on delete cascade,
	openrouter_response_healing boolean not null default true,
	updated_at timestamptz not null default now()
);
```

New Worker route `PUT /v1/settings`:

```tsx
// backend/src/routes/settings.ts
router.put('/v1/settings', async (c) => {
	const { openRouterResponseHealing } = await c.req.json<{ openRouterResponseHealing: boolean }>();
	if (typeof openRouterResponseHealing !== 'boolean') return c.json({ code: 'parse:zod-shape' }, 400);
	await makeRepos(c.env).deviceSettings.upsert(c.var.deviceId, { openrouter_response_healing: openRouterResponseHealing });
	return c.json({ ok: true });
});
```

The Worker's `openrouterClient.callCrystalTrial` (and the four pipeline siblings landed in Phases 1+2) reads the per-device setting at the start of `step.do('plan', ...)` and threads it into `providerHealingRequested`:

```tsx
const settings = await repos.deviceSettings.get(deviceId);
const providerHealingRequested = settings.openrouter_response_healing;
// ... later in generate step:
await openrouterClient.callCrystalTrial({ snapshot: plan.snapshot, providerHealingRequested, env: this.env });
```

### 7.2 Client-side removal

- Delete the localStorage key `abyss.openRouterResponseHealing` (or whatever name the current client uses — `clientResponseHealingBoundary.test.ts` will fail-loud if any reference remains).
- Delete the React settings UI component / store slice that toggles the flag.
- Replace it with a settings UI that calls `PUT /v1/settings` against the Worker. The settings panel becomes thinner: it reads from `useDeviceSettingsQuery()` (a new hook backed by `GET /v1/settings`) and writes through `PUT /v1/settings`.

### 7.3 One-time migration

On first app boot post-Phase-4-deploy:

```tsx
// src/infrastructure/migrations/migrateLocalSettingsToServer.ts
export async function migrateLocalSettingsToServer(http: ApiClient) {
	const legacy = window.localStorage.getItem('abyss.openRouterResponseHealing');
	if (legacy === null) return;
	const value = legacy === 'true';
	await http.put('/v1/settings', { openRouterResponseHealing: value });
	window.localStorage.removeItem('abyss.openRouterResponseHealing');
}
```

Called exactly once from `wireGeneration.ts` after `registerGenerationClient` completes. Idempotent: re-running with the localStorage key already deleted is a no-op.

### 7.4 Boundary test

`src/infrastructure/clientResponseHealingBoundary.test.ts`:

- No source file under `src/**` references `openRouterResponseHealing`, `OPEN_ROUTER_RESPONSE_HEALING`, or any localStorage key matching `/openRouterResponseHealing/i` (the migration helper is exempted via inline `// boundary-test:exempt` marker).
- The `useDeviceSettingsQuery` hook is the only file that imports `'/v1/settings'` (string literal pin).

## 🧱 Step 8 — Plan Supabase Auth migration (`docs/auth-migration-plan.md`)

**File:** `docs/auth-migration-plan.md` (NEW; specification only — no code in Phase 4)

### 8.1 Required content

1. **Goal**: replace `device_id`-only scoping with `(user_id, device_id)` scoping, where `user_id` is a Supabase Auth UUID.
2. **Phased rollout**:
    - **A. Add `auth.users` table** (managed by Supabase Auth) and `devices.user_id` foreign key (already nullable since Phase 1).
    - **B. Sign-in surface in client** — Supabase Auth UI; on successful sign-in, the client `POST`s the JWT to a new Worker route `POST /v1/devices/:deviceId/claim` which sets `devices.user_id`.
    - **C. RLS policies** — `devices`, `runs`, `jobs`, `events`, `artifacts`, `usage_counters`, `device_settings` all gain RLS policies of the shape `device_id in (select id from devices where user_id = auth.uid())`. The Worker continues to use service-role (bypassing RLS) for backwards-compat, but adds a parallel auth-scoped path.
    - **D. Browser direct-to-Supabase reads** — once RLS is on, the browser can `select` from `runs` / `events` / `artifacts` directly using its anon key + JWT, avoiding the Worker for read paths. Generation-run *writes* still flow through the Worker.
    - **E. Multi-device claim** — a signed-in user can claim additional devices by entering the device's UUID on a settings page. Run history merges across all claimed devices.
3. **Non-goals for Phase 4** — implementation, UI design, JWT refresh strategy. Phase 4 ships only the planning doc.
4. **Open questions** — listed explicitly so a follow-on initiative can pick them up: Apple/Google sign-in choice, anonymous-to-authenticated transition UX, device-disclaim flow, JWT expiry vs SSE long-lived connection.

### 8.2 Tests

No runtime tests; documentation-only. The `pr-unit-tests.yml` markdown lint job covers it.

## 🧱 Step 9 — Documentation + changelog

### 9.1 Files updated

- `README.md` — remove all `NEXT_PUBLIC_DURABLE_RUNS` references; describe the durable-only architecture.
- `CHANGELOG.md` — "Phase 4 — productionization + cleanup" section enumerating every breaking deletion (legacy runners, permissive parsers, `'navigation'` abort kind, client `openRouterResponseHealing`, `NEXT_PUBLIC_DURABLE_RUNS`).
- `AGENTS.md` (root) — drop the `eventBusHandlers`-only durable-run composition root amendment text that referenced "local synthetic RunEvents" because there are no local synthetic events anymore.
- `src/features/generationContracts/AGENTS.md` — drop the temporary "compatibility surface for local legacy/non-pipeline paths" caveat from PR #44; keep the strict-parser policy.

## ✅ Exit criteria checklist

- [ ]  `cors.ts` rejects unknown origins with structured `403 cors:forbidden`; preview/prod allowlists wired through `wrangler.toml` per environment.
- [ ]  `backend/SECURITY.md` and `docs/threat-model.md` published; markdown lint green.
- [ ]  `0010_artifact_retention.sql` applied; daily + weekly cron triggers active; `pruneArtifacts` tests green.
- [ ]  `ContentGenerationAbortReason` no longer carries `{ kind: 'navigation' }`; `useContentGenerationLifecycle.ts` deleted; type-system pin in place.
- [ ]  `LocalGenerationRunRepository.ts` and the four legacy entry points deleted; `legacyRunnerDeletionBoundary.test.ts` green.
- [ ]  Four `@deprecated`-marked permissive parsers deleted (or `extractJsonString` family relocated to `src/features/study/lib/legacyDisplayJson.ts`); `legacyParserDeletionBoundary.test.ts` green.
- [ ]  `correctPrereqEdges` relocated to `src/features/generationContracts/subjectGraph/`; Worker `validate.ts` invokes it for `subject-graph-edges`; tests green.
- [ ]  Client-side `openRouterResponseHealing` ownership removed; `PUT /v1/settings` and `device_settings` table live; `clientResponseHealingBoundary.test.ts` green.
- [ ]  One-time localStorage → server migration runs idempotently on app boot.
- [ ]  `docs/auth-migration-plan.md` published with all required sections.
- [ ]  `NEXT_PUBLIC_DURABLE_RUNS` removed from `.env.example`, `README.md`, and source tree; `process.env.NEXT_PUBLIC_DURABLE_RUNS` does not appear under `src/**`.
- [ ]  `CHANGELOG.md` Phase 4 entry lists every breaking deletion.

## 🧪 Manual verification before merge

1. Open the app fresh on a new browser profile (no `abyss.deviceId` minted): start a Crystal Trial generation, close the tab mid-run, reopen 30 seconds later — questions appear; no console error from missing `useContentGenerationLifecycle`.
2. Set browser localStorage `abyss.openRouterResponseHealing=false` BEFORE the Phase 4 deploy; deploy; reload the app; confirm one `PUT /v1/settings` fires with `{ openRouterResponseHealing: false }` and the localStorage key is removed.
3. From the network panel, confirm a request with `Origin: https://example.com` to `POST /v1/runs` is rejected with `403 cors:forbidden`. Same request from the production origin succeeds.
4. Wait 90 days (or run the cron manually via `wrangler triggers cron --cron prune-artifacts-daily`); confirm an unaccessed test artifact is pruned from both Storage and the `artifacts` table.
5. Trigger a Subject Graph generation; confirm Stage B's deterministic prerequisite-edge correction still applies (compare lattice output to a fixture with known dropped edges that the correction restores).
6. `grep -r runTopicGenerationPipeline src/` returns zero hits. `grep -r 'kind: '\''navigation'\''' src/` returns zero hits. `grep -r openRouterResponseHealing src/` returns zero hits (or only the migration helper with its boundary-test exempt marker).

## 📦 PR sequencing (stacked)

Each PR's branch targets the previous PR's branch as base. All seven PRs land behind a single Phase-4 merge train into `main` post Phase 3 exit.

1. **PR-A (CORS lockdown)** — `backend/src/middleware/cors.ts` + per-env `wrangler.toml` `PRODUCTION_ORIGINS` + `cors.test.ts`. No client changes.
2. **PR-B (Threat model + storage retention)** — `backend/SECURITY.md`, `docs/threat-model.md`, `0010_artifact_retention.sql`, `pruneArtifacts.ts`, cron triggers, `apply-ack` route, `last_accessed_at` write paths. No client changes.
3. **PR-C (Server-side response-healing settings)** — `0011_device_settings.sql`, `PUT/GET /v1/settings`, Worker pipeline integration, server-side `migrateLocalSettingsToServer` endpoint. Client still reads/writes localStorage; clean swap-over in PR-D.
4. **PR-D (Client cutover for response-healing + remove `NEXT_PUBLIC_DURABLE_RUNS`)** — replace client localStorage usage with `useDeviceSettingsQuery`; run one-shot migration; delete the flag; `clientResponseHealingBoundary.test.ts` lands.
5. **PR-E (Drop `'navigation'` abort kind + delete `useContentGenerationLifecycle`)** — type narrowing + hook deletion + every callsite cleanup. `localGenerationDeletionBoundary.test.ts` (preview-only assertion: type-system pin) lands.
6. **PR-F (Delete legacy runners + `LocalGenerationRunRepository`)** — bulk deletion. `GenerationClient` factory simplification. `legacyRunnerDeletionBoundary.test.ts` flips on. The deletion volume is large; PR description must reproduce the Compliance, Risk & Drift Assessment.
7. **PR-G (Delete legacy permissive parsers + relocate `extractJsonString` + relocate `correctPrereqEdges`)** — parser bulk deletion, study-feature legacyDisplayJson module created, Worker `validate.ts` updated. `legacyParserDeletionBoundary.test.ts` extends PR #44's boundary test. `docs/auth-migration-plan.md` lands alongside (small, doc-only).

## 🚪 Phase 4 program-end checklist (Durable Workflow Orchestration complete)

- [ ]  All four pipelines (`subject-graph`, `topic-content`, `topic-expansion`, `crystal-trial`) run durably on Cloudflare Workflows, behind tightened CORS, with server-authoritative response-healing settings.
- [ ]  Zero in-tab generation runners remain. `LocalGenerationRunRepository`, `runTopicGenerationPipeline`, `runExpansionJob`, `subjectGenerationOrchestrator`, and `generateTrialQuestions` are deleted.
- [ ]  Zero permissive parsers remain in pipeline code paths. The four `@deprecated` parsers are deleted; `extractJsonString` is feature-scoped to study display.
- [ ]  `NEXT_PUBLIC_DURABLE_RUNS` and `'navigation'` abort kind are gone from the codebase.
- [ ]  Threat model, storage-retention policy, and Supabase Auth migration plan are published.
- [ ]  All Phase 0 / 0.5 / 1 / 2 / 3 acceptance gates remain green.
- [ ]  The repo-root [AGENTS.md](http://AGENTS.md) `eventBusHandlers` exception text is updated to reflect the durable-only architecture (no local synthetic `RunEvent`s).
- [ ]  Failure-rate dashboards (Phase 3) show 14+ consecutive days at the Phase 3 exit floor with the simplified architecture.

The Durable Workflow Orchestration program is complete. Future work — Supabase Auth migration, additional pipelines (e.g., new mini-game kinds), or alternative LLM providers — proceeds against the durable substrate as ordinary feature work, not as part of this program.
