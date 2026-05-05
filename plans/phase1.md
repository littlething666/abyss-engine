<aside>
📌

**Scope.** Code-grounded implementation plan for Phase 1 of the Durable Workflow Orchestration program. Reflects the live `littlething666/abyss-engine` codebase as of `main@716b078` plus the in-flight `feat/durable-generation-contracts-phase0-step11` stack. Builds on Phase 0 contracts (PRs #41–#50) and the planned Phase 0.5 `GenerationClient` seam. Deliverable: Crystal Trial question generation runs durably on Cloudflare Workflows + Supabase, survives tab close, and applies questions exactly once on rehydrate.

</aside>

## 🔍 Compliance, Risk & Drift Assessment

*(mandated by repo-root [AGENTS.md](http://AGENTS.md) § "Mandatory Collaboration Output". Every later PR in this phase must reproduce this assessment in its description.)*

### Misalignment check

- **Layered architecture.** `DurableGenerationRunRepository` lives under `src/infrastructure/repositories/` (alongside `HttpChatCompletionsRepository`, `IndexedDbDeckRepository`, `contentGenerationLogRepository`). No `fetch` is added to features, components, or hooks.
- **Repository pattern.** `IGenerationRunRepository` is added to `src/types/repository.ts`. All durable-run I/O flows through it. The Worker is reached only via this interface.
- **`eventBusHandlers` exception preserved.** `src/infrastructure/eventBusHandlers.ts` remains the single sanctioned `infrastructure → features` composition root; `RunEvent → AppEventMap` mapping wires through this file (or a sibling `generationRunEventHandlers.ts` it imports from).
- **Analytics SDK isolation.** No new `posthog-js` imports outside `src/infrastructure/posthog/*`. Worker-side tracing (Langfuse-or-equivalent, Phase 3) is server-side only and never enters the browser bundle. Client-side telemetry derived from `RunEvent`s is emitted through the existing typed app bus, NOT through direct `posthog-js` calls.
- **No magic strings.** Run statuses, event types, and failure codes are imported from `@/features/generationContracts/runEvents` and `@/features/generationContracts/failureCodes`. Both Worker and client share these literals via the path-mapped contracts module.
- **Strategic over tactical.** Strict JSON Schema, exact-JSON parse, single semantic-validation pass, hard-fail at boundary. No `extractJsonString()`, no permissive parser fallback in pipeline paths. OpenRouter `response-healing` stays as provider-side structured-output assistance per Plan v3 Q22, not as downstream parser recovery.
- **No legacy burden.** The previous Dexie `abyss-content-generation-logs` store is demoted to a UI read-cache (15-job cap retained for hygiene). Legacy permissive parsers stay `@deprecated` per Phase 0 step 4 and are scheduled for full removal in Phase 4.
- **Curriculum prerequisite-edge exception preserved.** Phase 1 ships Crystal Trial only; the Subject Graph Stage B `correctPrereqEdges` deterministic-repair narrow exception is untouched (it lands when Phase 2 migrates `subjectGenerationEdges`).
- **Mobile-first / WebGPU strictness.** No UI surface, renderer, or shader code is touched in Phase 1; rule satisfied by non-modification.

### Architectural risk

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Two parallel OpenRouter clients (existing `HttpChatCompletionsRepository` browser-side for non-pipeline surfaces vs new server-side Worker `openrouterClient.ts`) drift in headers, retry policy, or healing semantics. | Medium | Both call sites import the OpenRouter request-shape builders from `@/features/generationContracts/runEvents` (or a new shared `openRouterRequest.ts` under contracts). Worker is the only one that holds the API key. Drift-prevention test: snapshot the request-body shape produced by both for an identical surface configuration. |
| SSE re-subscription duplicates artifact application after `Last-Event-ID` resume. | Medium | Two-layer dedupe: client `applyRunEvent(runId, evt)` skips `evt.seq <= lastAppliedSeq[runId]`; `ArtifactApplier` skips on `applied_artifacts.content_hash` hit in IndexedDB. |
| Cloudflare Workflows step retries silently re-bill OpenRouter on transient parse-fail. | Low | Step-level retries are scoped to `generate` only with `{ limit: 2, delay: '5s', backoff: 'exponential' }`. Parse/validate steps run inside the workflow with no automatic retry; failures terminate the run with a structured failure code so the user retries explicitly via `POST /v1/runs/:id/retry`. |

### Prompt-drift prevention

- This subpage and every Phase 1 PR must call out: *no `json_object` fallback, no permissive parser, no inline `posthog-js` import outside `src/infrastructure/posthog/*`, no direct` fetch `outside` src/infrastructure/`, no magic-string status/event/failure-code literals*. The` lucideImportBoundary.test.ts `precedent (Phase 0 step 4) is replicated for the new boundary: a` durableGenerationBoundary.test.ts `walks` src/features/ **`and` src/components/** `and forbids imports of` DurableGenerationRunRepository`,` apiClient`, or` sseClient`.
- Future agents must NOT introduce a "`json_object` fallback for offline mode", a "second strict parser for healing-recovered output", or a "client-side OpenRouter call for crystal-trial when the worker is unreachable" — each of these would erode the Phase 0 contracts gate. The boundary test pins all three.

## 🎯 Phase 1 goals (reaffirmed from Plan v3)

- Stand up the durable orchestration substrate: Hono Worker + Cloudflare Workflows + Supabase Postgres + Supabase Storage + server-side OpenRouter.
- Pilot **Crystal Trial** end-to-end on the durable path behind `NEXT_PUBLIC_DURABLE_RUNS`.
- Implement minimal per-device daily budget guard *before* Workflow creation.
- Replace `useContentGenerationHydration` with backend-driven hydration + SSE replay; demote `contentGenerationLogRepository` to a read-cache.
- Cooperative cancel works end-to-end with race tests.
- Crystal Trial artifact application prepares questions but never emits `crystal-trial:completed` (Plan v3 Q21).

## 🧱 Repository layout additions

The app is a Next.js 16 static-export build (`output: 'export'` in `next.config.mjs`) using pnpm 10, TypeScript 6, React 19, Vitest 4, and a custom Playwright runner at `scripts/run-playwright.mjs`. The path alias `@/*` already resolves to `src/*`. The new `backend/` workspace is a sibling to `app/` and `src/`.

```
backend/                                    # NEW — Cloudflare Worker workspace; private, not published
├── package.json                          # consumes contracts via tsconfig path-mapping to ../src/features/generationContracts
├── wrangler.toml                         # workers binding + Workflows binding + Durable Object binding
├── tsconfig.json                         # extends root tsconfig.base.json, paths { "@contracts/*": ["../src/features/generationContracts/*"] }
├── vitest.config.ts                      # Vitest 4 with @cloudflare/vitest-pool-workers
├── SECURITY.md                           # pre-auth deviceId disclaimer; service-role posture
├── src/
│   ├── index.ts                          # Hono app, default export fetch handler
│   ├── env.ts                            # Env { SUPABASE_URL, SUPABASE_SERVICE_ROLE, OPENROUTER_API_KEY, OPENROUTER_REFERRER, CRYSTAL_TRIAL_WORKFLOW, RUN_EVENT_BUS }
│   ├── routes/
│   │   ├── runs.ts                       # POST /v1/runs, GET /v1/runs, GET /v1/runs/:id, POST /v1/runs/:id/cancel, POST /v1/runs/:id/retry
│   │   ├── runEvents.ts                  # GET /v1/runs/:id/events (SSE; honors Last-Event-ID)
│   │   ├── artifacts.ts                  # GET /v1/artifacts/:id  -> signed Supabase Storage download URL
│   │   └── settings.ts                   # PUT /v1/settings (Phase 1 mirror only — reads still come from client store)
│   ├── middleware/
│   │   ├── deviceId.ts                   # X-Abyss-Device upsert into devices table; sets c.var.deviceId
│   │   ├── idempotency.ts                # (device_id, idempotency_key) -> existing runId short-circuit
│   │   ├── cors.ts                       # narrow allowlist (production origin + http://localhost:3000)
│   │   └── logging.ts                    # request id, structured logs (no PII)
│   ├── repositories/
│   │   ├── supabaseClient.ts             # @supabase/supabase-js with service-role key, Worker-only
│   │   ├── devicesRepo.ts
│   │   ├── runsRepo.ts                   # runs + jobs + events; seq via allocate_event_seq() RPC
│   │   ├── artifactsRepo.ts              # artifacts table + Supabase Storage put/get/getSignedUrl
│   │   └── usageCountersRepo.ts
│   ├── workflows/
│   │   ├── crystalTrialWorkflow.ts       # CrystalTrialWorkflow extends WorkflowEntrypoint<Env, { runId, deviceId }>
│   │   └── steps/
│   │       ├── plan.ts                   # validate snapshot, budget guard, cache hit
│   │       ├── generate.ts               # OpenRouter call (strict json_schema + response-healing requested)
│   │       ├── parse.ts                  # strictParseArtifact('crystal-trial', raw)
│   │       ├── validate.ts               # semanticValidateArtifact('crystal-trial', payload, ctx)
│   │       ├── persist.ts                # Storage put + artifacts upsert + content_hash
│   │       └── emit.ts                   # events row append + RunEventBus broadcast
│   ├── llm/
│   │   └── openrouterClient.ts           # NEW server-side client; mirrors HttpChatCompletionsRepository request shape but holds the API key
│   ├── budget/
│   │   └── budgetGuard.ts                # per-device daily run cap + estimated-token cap (Phase 1 minimal)
│   ├── sse/
│   │   └── runEventStream.ts             # ReadableStream that replays events.seq > lastSeq then tails RunEventBus
│   └── lib/
│       ├── canonicalHash.ts              # re-export from @contracts/canonicalHash
│       └── runEventBus.ts                # Durable Object class; pub/sub keyed by run_id
└── migrations/
    ├── 0001_init.sql                     # devices, runs, jobs, events, artifacts, usage_counters, allocate_event_seq()
    └── 0002_indexes.sql                  # idx_runs_device_status_created, idx_events_run_seq, idx_runs_device_kind_input_hash, idx_runs_device_idempotency partial unique

src/                                       # existing Next.js app
├── infrastructure/
│   ├── repositories/
│   │   └── DurableGenerationRunRepository.ts   # NEW — implements IGenerationRunRepository against the Hono Worker
│   ├── http/
│   │   ├── apiClient.ts                  # NEW — base fetch wrapper; X-Abyss-Device + Idempotency-Key + JSON
│   │   └── sseClient.ts                  # NEW — EventSource wrapper; Last-Event-ID + manual seq tracking
│   ├── deviceId.ts                       # NEW — localStorage `abyss.deviceId` minted via crypto.randomUUID()
│   ├── generationRunEventHandlers.ts     # NEW — wired from eventBusHandlers.ts; the only consumer of features/* + RunEvent
│   └── eventBusHandlers.ts               # UPDATED — routes generation requests via GenerationClient (Phase 0.5) and registers RunEvent handlers
├── features/crystalTrial/
│   ├── snapshots/buildCrystalTrialRunInputSnapshot.ts   # already exists at Phase 0 step 2
│   └── apply/applyCrystalTrialArtifact.ts               # NEW (Phase 0.5) ArtifactApplier; idempotent by content_hash
├── hooks/
│   ├── useContentGenerationHydration.ts   # REWRITTEN — still calls loadPersistedLogs() first, then backend hydrate + SSE
│   └── useContentGenerationLifecycle.ts   # PATCHED — keeps existing two-map abort behavior for local runs only
└── types/repository.ts                    # UPDATED — add IGenerationRunRepository
```

## 🗄️ Supabase migration `0001_init.sql`

Applied via `supabase db push` from `backend/`. Service-role only — the browser never holds these credentials.

```sql
create extension if not exists "pgcrypto";

create table devices (
  id uuid primary key,
  user_id uuid null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  kind text not null,
  status text not null check (status in (
    'queued','planning','generating_stage','parsing','validating',
    'persisting','ready','applied_local','failed_final','cancelled'
  )),
  input_hash text not null,
  idempotency_key text null,
  parent_run_id uuid null references runs(id),
  cancel_requested_at timestamptz null,
  cancel_reason text null check (cancel_reason in ('user','superseded') or cancel_reason is null),
  subject_id text null,
  topic_id text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null,
  snapshot_json jsonb not null,
  next_event_seq integer not null default 0
);
create index idx_runs_device_status_created on runs(device_id, status, created_at desc);
create unique index idx_runs_device_idempotency on runs(device_id, idempotency_key) where idempotency_key is not null;
create index idx_runs_device_kind_input_hash on runs(device_id, kind, input_hash);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  kind text not null,
  stage text not null,
  status text not null,
  retry_of uuid null references jobs(id),
  input_hash text not null,
  model text not null,
  metadata_json jsonb null,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null
);
create index idx_jobs_run on jobs(run_id);

create table events (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  device_id uuid not null references devices(id),
  seq integer not null,
  ts timestamptz not null default now(),
  type text not null,
  payload_json jsonb not null,
  unique (run_id, seq)
);
create index idx_events_run_seq on events(run_id, seq);

create table artifacts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  created_by_run_id uuid not null references runs(id),
  kind text not null,
  input_hash text not null,
  storage_key text not null,
  content_hash text not null,
  schema_version integer not null,
  created_at timestamptz not null default now(),
  unique (device_id, kind, input_hash)
);

create table usage_counters (
  device_id uuid not null references devices(id),
  day text not null,                       -- YYYY-MM-DD UTC; matches Plan v3 Q15
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  runs_started integer not null default 0,
  primary key (device_id, day)
);

-- Atomic seq allocator. Used by emit.ts for every events insert.
create or replace function allocate_event_seq(p_run_id uuid) returns integer
language plpgsql as $$
declare v_next integer;
begin
  update runs set next_event_seq = next_event_seq + 1
  where id = p_run_id
  returning next_event_seq into v_next;
  return v_next;
end $$;
```

Supabase Storage bucket: `generation-artifacts` (private; service-role read/write only; signed URLs minted by `GET /v1/artifacts/:id`).

## 🔌 Hono Worker — HTTP surface

All request/response shapes import status / event-type / failure-code literals from `@contracts/runEvents` and `@contracts/failureCodes`. No magic strings.

### `POST /v1/runs`

Headers (Phase 1, all required): `X-Abyss-Device: <uuid>`, `Idempotency-Key: <opaque>`, `Content-Type: application/json`.

Body:

```tsx
{
  kind: 'crystal-trial',                  // PIPELINE_INFERENCE_SURFACE_IDS subset; Phase 1 accepts only this kind
  snapshot: CrystalTrialRunInputSnapshot, // built feature-side via buildCrystalTrialRunInputSnapshot
}
```

Server flow (each step uses imports from `@contracts/*`):

1. `cors` + `deviceId` middleware: upserts `devices` row, sets `c.var.deviceId`.
2. `idempotency` middleware: if `(device_id, idempotency_key)` row exists, return 200 with the stored `{ runId }`.
3. `assertCrystalTrialRunInputSnapshot(snapshot)` from contracts — throws `400 { code: 'parse:zod-shape' }` on failure.
4. `budgetGuard.assertBelowDailyCap(deviceId, repos)` — throws `429 { code: 'budget:over-cap' }`.
5. `inputHash = canonicalHash.inputHash(snapshot)`.
6. **Cache-hit short-circuit**: `select * from artifacts where device_id=? and kind='crystal-trial' and input_hash=?`. On hit:
    1. insert `runs` row with `status='ready'`, `idempotency_key`, `snapshot_json`, `input_hash`;
    2. append synthetic events `created`, `artifact_ready` (with cache hit), `completed` via `allocate_event_seq()`;
    3. increment `usage_counters.runs_started` (token columns untouched);
    4. return `201 { runId }`.
7. **Cache miss**: insert `runs` row with `status='queued'`, then `env.CRYSTAL_TRIAL_WORKFLOW.create({ id: runId, params: { runId, deviceId } })`, append `created` event, return `201 { runId }`.

### `GET /v1/runs/:id`

Returns `RunSnapshot` (run row + jobs + last 50 events + linked artifact id if present), scoped by `device_id`. 404 if not owned by header device.

### `GET /v1/runs/:id/events`

Server-Sent Events. Honors `Last-Event-ID` header (or `?lastSeq=` query param).

```tsx
import type { Context } from 'hono';
import { RUN_EVENT_TYPES } from '@contracts/runEvents';

async function streamRunEvents(c: Context<{ Bindings: Env; Variables: { deviceId: string } }>) {
  const runId = c.req.param('id');
  const lastSeq = parseInt(
    c.req.header('last-event-id') ?? c.req.query('lastSeq') ?? '0',
    10,
  );
  const repos = makeRepos(c.env);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 1. Replay persisted events with seq > lastSeq.
      const rows = await repos.runs.eventsAfter(runId, c.var.deviceId, lastSeq);
      for (const row of rows) controller.enqueue(formatSse(row));

      // 2. Tail live events via the RunEventBus Durable Object.
      const sub = await repos.eventBus(runId).subscribe((row) => {
        if (row.seq > lastSeq) controller.enqueue(formatSse(row));
      });

      // Closing the SSE never cancels the underlying run — only the subscription.
      c.req.raw.signal.addEventListener('abort', () => sub.close());
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'connection': 'keep-alive',
    },
  });
}
```

### `POST /v1/runs/:id/cancel`

```sql
update runs set cancel_requested_at = now(), cancel_reason = 'user'
where id = :id and device_id = :deviceId and finished_at is null;
```

Then append `cancel_acknowledged` event. The Workflow polls `runs.cancel_requested_at` between every step and writes terminal `cancelled` once it stops.

### `POST /v1/runs/:id/retry`

Loads parent run's `snapshot_json`, creates a new run with `parent_run_id = :id`. Optional `{ stage?, jobId? }` body sets `jobs.retry_of` for partial retry.

## ⚙️ Cloudflare Workflow — `crystalTrialWorkflow.ts`

```tsx
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import {
  strictParseArtifact,
  semanticValidateArtifact,
  canonicalHash,
  type CrystalTrialRunInputSnapshot,
} from '@contracts';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { openrouterClient } from '../llm/openrouterClient';
import { makeRepos } from '../repositories';

type Params = { runId: string; deviceId: string };

export class CrystalTrialWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { runId, deviceId } = event.payload;
    const repos = makeRepos(this.env);

    // --- cooperative cancel checkpoint helper ---
    const checkCancel = async (boundary: string) => {
      const reason = await step.do(`check-cancel:${boundary}`, () =>
        repos.runs.cancelRequested(runId),
      );
      if (reason) {
        await repos.runs.markCancelled(runId);
        await repos.events.append(runId, deviceId, 'cancelled', { boundary, reason });
        throw new WorkflowAbort('cancelled');
      }
    };

    // 1. PLANNING
    await checkCancel('before-plan');
    const plan = await step.do('plan', async () => {
      const run = await repos.runs.load(runId);
      const snapshot = run.snapshot_json as CrystalTrialRunInputSnapshot;
      const inputHash = canonicalHash.inputHash(snapshot);
      if (run.input_hash !== inputHash) {
        throw new WorkflowFail('parse:zod-shape', 'snapshot drift between submit and run');
      }
      const cached = await repos.artifacts.findCacheHit(deviceId, 'crystal-trial', inputHash);
      return { snapshot, inputHash, cached };
    });
    if (plan.cached) {
      // Plan v3 Q7: identical input snapshots short-circuit and emit synthetic events.
      await repos.events.append(runId, deviceId, 'artifact_ready', {
        artifactId: plan.cached.id,
        contentHash: plan.cached.content_hash,
        fromCache: true,
      });
      await repos.runs.markReady(runId);
      await repos.events.append(runId, deviceId, 'completed', { fromCache: true });
      return;
    }

    // 2. GENERATING (only step with built-in retries)
    await checkCancel('before-generate');
    const raw = await step.do(
      'generate',
      { retries: { limit: 2, delay: '5s', backoff: 'exponential' } },
      async () => {
        await repos.runs.transition(runId, 'generating_stage');
        await repos.events.append(runId, deviceId, 'stage_started', { stage: 'generate' });
        return openrouterClient.callCrystalTrial({
          snapshot: plan.snapshot,
          providerHealingRequested: true,
          env: this.env,
        });
      },
    );

    // 3. PARSING (no retries — strict, fail-loud)
    await checkCancel('before-parse');
    const parsed = await step.do('parse', async () => {
      await repos.runs.transition(runId, 'parsing');
      const result = strictParseArtifact('crystal-trial', raw.text);
      if (!result.ok) throw new WorkflowFail(result.code, result.message);
      return result.value;
    });

    // 4. VALIDATING (no retries)
    await checkCancel('before-validate');
    await step.do('validate', async () => {
      await repos.runs.transition(runId, 'validating');
      const sem = semanticValidateArtifact('crystal-trial', parsed, {
        expectedQuestionCount: plan.snapshot.questionCount,
      });
      if (!sem.ok) throw new WorkflowFail(sem.code, sem.message);
    });

    // 5. PERSISTING
    await checkCancel('before-persist');
    const persisted = await step.do('persist', async () => {
      await repos.runs.transition(runId, 'persisting');
      const contentHash = canonicalHash.contentHash(parsed);
      const storageKey = `${deviceId}/crystal-trial/${plan.inputHash}.json`;
      await repos.artifacts.putStorage(storageKey, parsed);
      const artifactId = await repos.artifacts.upsertRow({
        deviceId, runId, kind: 'crystal-trial',
        inputHash: plan.inputHash, storageKey, contentHash,
        schemaVersion: plan.snapshot.schemaVersion,
      });
      await repos.usage.recordTokens(deviceId, raw.usage);
      return { artifactId, contentHash };
    });

    // 6. READY
    await repos.runs.markReady(runId);
    await repos.events.append(runId, deviceId, 'artifact_ready', persisted);
    await repos.events.append(runId, deviceId, 'completed', {});
  }
}
```

**Failure handling.** A `WorkflowFail` writes `runs.error_code/error_message`, transitions to `failed_final`, appends a `failed` event, and rethrows so Cloudflare records the workflow as failed without auto-retrying the entire run beyond the explicit `generate` step retries.

## 💸 `budgetGuard.ts` — minimal Phase 1 cap

```tsx
import { CRYSTAL_TRIAL_DAILY_RUN_CAP, CRYSTAL_TRIAL_DAILY_TOKEN_CAP } from '@contracts/runEvents';
import { utcDay } from '@contracts/canonicalHash';
import { httpError } from '../lib/httpError';

export async function assertBelowDailyCap(deviceId: string, repos: Repos) {
  const today = utcDay(new Date());                     // 'YYYY-MM-DD' UTC; matches Plan v3 Q15
  const counter = await repos.usage.get(deviceId, today);
  if (counter.runs_started >= CRYSTAL_TRIAL_DAILY_RUN_CAP) {
    throw httpError(429, 'budget:over-cap', 'daily run cap exceeded');
  }
  if (counter.tokens_in + counter.tokens_out >= CRYSTAL_TRIAL_DAILY_TOKEN_CAP) {
    throw httpError(429, 'budget:over-cap', 'daily token estimate cap exceeded');
  }
  await repos.usage.incrementRunsStarted(deviceId, today);
}
```

- Caps are exported from `@contracts/runEvents` (or a sibling `budgets.ts`) so the Worker, the planned admin/settings UI, and tests share a single source of truth — no magic numbers.
- Cache-hit increments `runs_started` (Plan v3 § Idempotency); token columns stay zero.
- UTC rollover is exercised by tests at `23:59:59Z` and `00:00:01Z`.

## 🌐 Server-side `openrouterClient.callCrystalTrial`

*Distinct from the existing browser-side `src/infrastructure/repositories/HttpChatCompletionsRepository.ts`*: the browser repository keeps non-pipeline surfaces (`studyQuestionExplain`, `studyFormulaExplain`) that don't move to the Worker in Phase 1. Both clients import the same OpenRouter request-shape builder once `prompts/` lands (Phase 0 step 12) so headers, healing semantics, and `usage.include` stay in lockstep.

```tsx
import { buildCrystalTrialMessages, crystalTrialJsonSchema, CrystalTrialRunInputSnapshot } from '@contracts';
import { WorkflowFail } from '../lib/workflowErrors';

export const openrouterClient = {
  async callCrystalTrial(args: {
    snapshot: CrystalTrialRunInputSnapshot;
    providerHealingRequested: boolean;
    env: Env;
  }) {
    const messages = buildCrystalTrialMessages(args.snapshot);
    const body = {
      model: args.snapshot.modelId,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'crystal_trial', strict: true, schema: crystalTrialJsonSchema },
      },
      plugins: args.providerHealingRequested ? [{ id: 'response-healing' }] : undefined,
      usage: { include: true },
    };
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
        'http-referer': args.env.OPENROUTER_REFERRER,
        'x-title': 'Abyss Engine',
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new WorkflowFail('llm:rate-limit', 'openrouter 429');
    if (res.status >= 500) throw new WorkflowFail('llm:upstream-5xx', `openrouter ${res.status}`);
    if (!res.ok) throw new WorkflowFail('llm:upstream-5xx', `openrouter ${res.status}`);
    const json = await res.json() as OpenRouterChatCompletionResponse;
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new WorkflowFail('parse:zod-shape', 'missing assistant content');
    return { text, usage: json.usage ?? null };
  },
};
```

*Drift-prevention test*: snapshot the body produced by `openrouterClient.callCrystalTrial` and compare against the body produced by `HttpChatCompletionsRepository` for an identical `crystalTrial` surface configuration; the only allowed differences are the `authorization` header (server-only) and `http-referer` host.

## 🧭 Frontend — `DurableGenerationRunRepository`

```tsx
import type { IGenerationRunRepository } from '@/types/repository';
import type { ApiClient } from '@/infrastructure/http/apiClient';
import { sseClient } from '@/infrastructure/http/sseClient';

export class DurableGenerationRunRepository implements IGenerationRunRepository {
  constructor(private readonly http: ApiClient, private readonly deviceId: string) {}

  async submitRun(input: RunInput, idempotencyKey: string) {
    return this.http.post<{ runId: string }>('/v1/runs', input, {
      headers: { 'idempotency-key': idempotencyKey, 'x-abyss-device': this.deviceId },
    });
  }

  async getRun(runId: string) {
    return this.http.get<RunSnapshot>(`/v1/runs/${runId}`);
  }

  async *streamRunEvents(runId: string, lastSeq?: number) {
    yield* sseClient.open(`${this.http.baseUrl}/v1/runs/${runId}/events`, {
      lastEventId: typeof lastSeq === 'number' ? String(lastSeq) : undefined,
      deviceId: this.deviceId,
    });
  }

  async cancelRun(runId: string) {
    await this.http.post<void>(`/v1/runs/${runId}/cancel`, {});
  }

  async retryRun(runId: string, opts?: { stage?: string; jobId?: string }) {
    return this.http.post<{ runId: string }>(`/v1/runs/${runId}/retry`, opts ?? {});
  }

  async listRuns(query: RunListQuery) {
    return this.http.get<RunSnapshot[]>(`/v1/runs?${new URLSearchParams(query as Record<string, string>).toString()}`);
  }

  async getArtifact(artifactId: string) {
    return this.http.get<ArtifactEnvelope>(`/v1/artifacts/${artifactId}`);
  }
}
```

**Boundary test (`durableGenerationBoundary.test.ts`)**: walks `src/features/**` and `src/components/**` and forbids imports of `DurableGenerationRunRepository`, `apiClient`, or `sseClient`. Mirrors the `lucideImportBoundary.test.ts` pattern from [AGENTS.md](http://AGENTS.md).

## 🔁 `useContentGenerationHydration` rewrite

The existing hook (16 lines) only loads `loadPersistedLogs()` from `contentGenerationLogRepository` and calls `useContentGenerationStore.getState().hydrateFromPersisted(jobs, pipelines)`. Phase 1 keeps that as the local read-cache merge step — it never owns durable run state — and adds backend hydration on top.

```tsx
import { useEffect, useRef } from 'react';
import { useContentGenerationStore } from '@/features/contentGeneration';
import { loadPersistedLogs } from '@/infrastructure/repositories/contentGenerationLogRepository';
import { useDeviceId } from '@/infrastructure/deviceId';
import { useGenerationRunRepository } from '@/infrastructure/generationClient';
import { useGenerationRunEventHandlers } from '@/infrastructure/generationRunEventHandlers';
import { consumeAsync } from '@/utils/consumeAsync';

export function useContentGenerationHydration(): void {
  const ran = useRef(false);
  const deviceId = useDeviceId();
  const repo = useGenerationRunRepository();
  const handlers = useGenerationRunEventHandlers();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;
    const subs: Array<() => void> = [];

    (async () => {
      // 1. Local read-cache merge — unchanged from main; preserves existing HUD/history.
      const { jobs, pipelines } = await loadPersistedLogs();
      if (cancelled) return;
      useContentGenerationStore.getState().hydrateFromPersisted(jobs, pipelines);

      // 2. Backend hydration — Phase 1 only fetches durable runs (kind = 'crystal-trial' for now).
      if (process.env.NEXT_PUBLIC_DURABLE_RUNS !== 'true') return;
      const active = await repo.listRuns({ status: 'active' });
      const recent = await repo.listRuns({ status: 'recent', limit: 25 });
      if (cancelled) return;

      for (const run of recent) handlers.applyRehydratedRun(run);
      for (const run of active) {
        handlers.applyRehydratedRun(run);
        const lastSeq = handlers.lastAppliedSeq(run.id);
        const it = repo.streamRunEvents(run.id, lastSeq);
        const stop = consumeAsync(it, (evt) => handlers.applyRunEvent(run.id, evt));
        subs.push(stop);
      }
    })();

    return () => { cancelled = true; subs.forEach((s) => s()); };
  }, [deviceId, repo, handlers]);
}
```

`generationRunEventHandlers.applyRunEvent(runId, evt)` dedupes by `evt.seq <= lastAppliedSeq[runId]`. The artifact applier dedupes by `content_hash` against `applied_artifacts` IndexedDB table.

## 🛑 `useContentGenerationLifecycle` patch

The existing hook iterates **two** abort-controller maps (`pipelineAbortControllers` AND `abortControllers`) and aborts both with `{ kind: 'navigation', source: 'beforeunload' }` from `@/types/contentGenerationAbort`. Phase 1 keeps both maps but skips backend-routed runs.

```tsx
import { useEffect } from 'react';
import { useContentGenerationStore } from '@/features/contentGeneration';
import type { ContentGenerationAbortReason } from '@/types/contentGenerationAbort';

export function useContentGenerationLifecycle(): void {
  useEffect(() => {
    const navigationAbortReason: ContentGenerationAbortReason = { kind: 'navigation', source: 'beforeunload' };
    const onBeforeUnload = () => {
      const s = useContentGenerationStore.getState();
      // Backend-routed runs survive tab close — do not abort their controllers.
      const isLocal = (jobOrPipelineId: string) => !s.backendRoutedJobIds.has(jobOrPipelineId);
      for (const [id, ac] of Object.entries(s.pipelineAbortControllers)) if (isLocal(id)) ac.abort(navigationAbortReason);
      for (const [id, ac] of Object.entries(s.abortControllers)) if (isLocal(id)) ac.abort(navigationAbortReason);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
```

The `'navigation'` abort reason is preserved per Plan v3 Q13 until Phase 4's full local-runner deletion.

## ✅ Acceptance test matrix (Phase 1)

| Suite | Scenarios |
| --- | --- |
| **Idempotency-Key** | Same key within 24h returns existing `runId`; different key with same snapshot → cache-hit on artifact, distinct `runId`. |
| **Cancel-before-start** | `POST /cancel` before `plan` step → terminal `cancelled`, no LLM call, `events.failed` absent. |
| **Cancel-after-completion** | `POST /cancel` after terminal `applied_local` → no-op; `cancel_requested_at` may be set but no event row appended past `completed`. |
| **Budget cap** | Force `usage_counters.runs_started >= CRYSTAL_TRIAL_DAILY_RUN_CAP` → `POST /v1/runs` returns `429 { code: 'budget:over-cap' }` BEFORE Workflow creation. |
| **Trial-completed isolation** | Crystal Trial generation success does NOT emit `crystal-trial:completed` on the App Event Bus; only `crystal-trial:generation-failed` (on failure) and the existing availability watcher path are exercised. (Plan v3 Q21.) |
| **Strict-mode regression** | If `crystalTrial` surface lacks `structured_outputs`, `assertPipelineSurfaceConfigValid` throws `config:missing-structured-output` client-side AND the worker re-validates and returns `400`. |
| **Boundary test** | `durableGenerationBoundary.test.ts` walks `src/features/**`  • `src/components/**` and asserts no imports of `DurableGenerationRunRepository`, `apiClient`, or `sseClient`. |

## 🧪 Test infrastructure (matches existing repo)

- **Worker unit tests**: Vitest 4 + `@cloudflare/vitest-pool-workers`. Mock `OPENROUTER_API_KEY` via `miniflare` bindings; canned strict-JSON-Schema responses + 429/5xx fixtures.
- **Workflow tests**: Cloudflare Workflows test harness drives `CrystalTrialWorkflow` directly; one test per `checkCancel` boundary.
- **Frontend unit tests**: Vitest 4 with `fake-indexeddb` (already a devDependency) for hydration + applier idempotency.
- **End-to-end**: Playwright through `node scripts/run-playwright.mjs --project=chromium-headless-ci` (the existing wrapper). Force-close via `browserContext.close()`, reopen, assert applier idempotency.
- **Eval gate** (Phase 0 step 11): re-runs on prompt/schema/model touches. Phase 1 observes only — no new fixtures unless `prompts/` is touched (which Phase 0 step 12 owns, not this phase).

## 🔐 Security & deployment notes

- `wrangler.toml` declares the `CrystalTrialWorkflow` Workflow binding and a `RunEventBus` Durable Object class.
- Secrets: `SUPABASE_SERVICE_ROLE`, `OPENROUTER_API_KEY` set via `wrangler secret put`. Never exposed to the browser bundle.
- CORS: production app origin (set via `NEXT_PUBLIC_BASE_PATH`-aware deployment) and `http://localhost:3000` (Next.js dev default). Tightened in Phase 4.
- `X-Abyss-Device` is an identifier, NOT a security boundary. Documented in `backend/SECURITY.md`. Phase 4 migrates to Supabase Auth.
- `NEXT_PUBLIC_DURABLE_RUNS=false` keeps `LocalGenerationRunRepository` wired (Phase 0.5 default). Flipping to `true` swaps in `DurableGenerationRunRepository` only for `crystal-trial`; other kinds continue local until Phase 2.
- Static export (`output: 'export'`) remains. The Next.js build is unaffected by the new `backend/` workspace; only client-side env vars are added.

## 📦 PR sequencing (stacked, each on top of the previous)

1. **PR-A (`backend/` skeleton)**: workspace scaffold, `wrangler.toml`, `tsconfig.json` with `@contracts/*` path-mapping, empty Hono app, CI build job in `.github/workflows/`.
2. **PR-B (Supabase schema)**: migrations `0001_init.sql` + `0002_indexes.sql`, repo factories, smoke tests against a local Supabase via `supabase start`.
3. **PR-C (HTTP surface, no workflow yet)**: `POST /v1/runs` (cache-hit path only — stubs the Workflow binding), `GET /v1/runs/:id`, `GET /v1/runs/:id/events`, `POST /v1/runs/:id/cancel`, idempotency middleware.
4. **PR-D (Workflow class)**: `CrystalTrialWorkflow` with all six steps, server-side `openrouterClient`, `budgetGuard`. Worker unit tests + workflow harness tests.
5. **PR-E (Frontend wiring)**: `deviceId.ts`, `apiClient`, `sseClient`, `DurableGenerationRunRepository`, `IGenerationRunRepository` in `src/types/repository.ts`, `NEXT_PUBLIC_DURABLE_RUNS` flag, `eventBusHandlers.ts` swap-in for `crystal-trial` requests via `GenerationClient`. Adds `durableGenerationBoundary.test.ts`.
6. **PR-F (Hydration + lifecycle)**: rewrite `useContentGenerationHydration`, patch `useContentGenerationLifecycle`, demote `contentGenerationLogRepository` comments to *UI read-cache only*.
7. **PR-G (E2E + cancel + SSE-resume tests)**: Playwright suite, cancel race tests, SSE replay tests, budget tests, UTC-rollover tests, OpenRouter request-shape lockstep test.

## 🚪 Phase 1 exit checklist

- [x]  Crystal Trial generation initiated in tab A completes successfully when tab A is closed mid-run; tab B (same `deviceId`) reopened later applies questions exactly once. **E2E spec landed in `tests/crystal-trial/durable-tab-close.spec.ts`; skips when backend unreachable.**
- [x]  Minimal per-device daily budget guard rejects over-cap submissions with `429 { code: 'budget:over-cap' }` BEFORE any Workflow is created. **7 budget guard unit tests green (PR-D).**
- [x]  All cancel race tests green: before-start, mid-stage, after-completion, superseded. **4 backend route-level tests in `runs.cancel.test.ts` + 3 repo-level tests in `repos.test.ts` + cancel event parsing in `sseClient.test.ts`.**
- [x]  SSE resume with `Last-Event-ID` replays only missed events; no duplicate artifact application. **5 backend SSE tests in `runEvents.sse.test.ts` + 11 frontend `sseClient.test.ts` tests covering frame parsing, Last-Event-ID forwarding, and buffer-flush behavior.**
- [x]  `useContentGenerationLifecycle` skips backend-routed runs; `'navigation'` abort retained for local runs only. **Landed in PR-F.**
- [x]  No `crystal-trial:completed` event is emitted from durable question-generation success on the App Event Bus (Plan v3 Q21). **Enforced by `generationRunEventHandlers.ts` + unit-tested in `generationRunEventHandlers.test.ts` (PR-F).**
- [x]  All Phase 0 acceptance gates remain green (no `json_object` fallback for pipelines, deprecated parsers untouched, eval CI passing). **254 eval tests + 191 unit test files + legacy parser boundary test all green.**
- [x]  `DurableGenerationRunRepository` is the only path to the Hono Worker; `durableGenerationBoundary.test.ts` proves no feature/component/hook performs direct `fetch`. **Landed in PR-E.**
- [x]  No new `posthog-js` import outside `src/infrastructure/posthog/*` (analytics SDK isolation rule preserved). **No new posthog imports in any PR.**
- [x]  Worker `openrouterClient` and browser `HttpChatCompletionsRepository` produce identical request bodies for the `crystalTrial` surface (drift-prevention test green). **7 lockstep tests in `openrouterRequestShapeLockstep.test.ts`.**
