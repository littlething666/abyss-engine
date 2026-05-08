## Implementation status — 2026-05-08

Completed in backend Phase 4 observability pass:

- Enabled Cloudflare Workers Logs in `backend/wrangler.toml` via `[observability]`.
- Added shared structured JSON logging (`backend/src/observability/logger.ts`) and replaced ad hoc prefixed console logs in backend routes, middleware, budget guard, SSE, tracer, and workflow utility paths.
- Changed LLM tracing to emit `llm.call.start` and `llm.call.end` JSON log objects with queryable `runId`, `deviceId`, `pipelineKind`, `stage`, `traceId`, model/policy/schema/input metadata, duration, status, error fields, and token counts.
- Split Crystal Trial and Topic Expansion provider-call timing from parse/validate timing by using separate Workflow steps (`generate`, `parse`, `validate`) instead of `generate:validated`.
- Added `observedStep` helper for future workflow step instrumentation.
- Added D1 job-span recording for LLM stages. Staged workflows (`subject-graph`, `topic-content`) link `stage_checkpoints.job_id` and mark checkpoints failed on staged LLM failure.
- Added redacted R2 failure debug bundle writing and call sites in workflow terminal failure blocks.
- Added `GET /v1/runs/:id/debug` for same-device D1-backed operator debugging.
- Updated repository seams for run jobs, artifact metadata by run, and checkpoint job linkage.

Remaining follow-ups:

- Generalize separate provider/parse/validate spans in `subject-graph` and `topic-content`; their `runStage` helpers still wrap provider, parse, and semantic validation inside one `generate:<stage>` Workflow step for replay simplicity.
- Expand `observedStep` usage beyond the helper definition once step-noise budgets and dashboard naming are settled.
- Add environment-specific production sampling (`[env.production.observability]`) after deployment traffic characteristics are known.
- Add privileged/local-only access to R2 debug bundle bodies if needed; the current endpoint exposes only redacted D1 data and the bundle key.
- Add dashboards/alerts around `pipelineKind`, `stage`, `errorCode`, `model`, `generationPolicyHash`, and stuck active runs.

## Review summary

The backend already has a strong durability base for observability: `runs`, `jobs`, `events`, `stage_checkpoints`, `artifacts`, and `usage_counters` are present in D1; R2 is explicitly intended for artifacts/checkpoints/raw model outputs/replay bundles; workflows append typed run events; SSE can replay and live-tail persisted events; and there is an existing LLM tracer that emits JSON-ish traces to console.

The main gap is **not absence of observability**, but **fragmentation**:

* LLM tracing exists, but workflow-step, HTTP-route, cache, R2, D1, cancellation, dispatch, and replay-bundle observability are incomplete.
* Current LLM trace duration can include generate + parse + validate, not just provider latency, because the trace wraps a broader `step.do('generate:validated')` block in the workflow.
* Logs are emitted as a prefixed string, for example `[llm-trace] ${JSON.stringify(trace)}`, but Cloudflare recommends logging JSON objects so fields are indexed and queryable directly. ([Cloudflare Docs][1])
* `wrangler.toml` does not currently include a Workers Logs `[observability]` block, while Cloudflare requires enabling observability in Wrangler config for Workers Logs ingestion. ([Cloudflare Docs][1])
* The code has D1 `jobs` and `stage_checkpoints`, but the workflow runtime is not consistently using them as queryable spans/checkpoints across all stages.

---

## Questions to ask, with recommended answers

| Question                                                           | Recommended answer                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What is the canonical correlation key?**                         | Use `runId` as the primary correlation key. Add `requestId`, `traceId`, and `spanId`, but treat `runId` as the user-facing and operator-facing join key because Cloudflare Workflow instances are created with `{ id: runId }` in dispatch.                            |
| **Should logs be structured JSON or prefixed strings?**            | Structured JSON objects. Replace prefixed string logs like `[llm-trace] ...` with `console.log({ event: 'llm.call.end', ... })`. Cloudflare Workers Logs indexes JSON fields, which makes `runId`, `stage`, `errorCode`, and `model` queryable. ([Cloudflare Docs][1]) |
| **What belongs in D1 vs Workers Logs vs R2?**                      | D1: durable run timeline, status, checkpoints, jobs, failure code. Workers Logs: high-cardinality operational events. R2: replay/debug bundles and optional raw LLM artifacts.                                                                                         |
| **Should prompts and raw model outputs be logged?**                | No, not by default. Store hashes, sizes, schema names, model IDs, token usage, and error metadata. Store raw prompts/responses only behind an explicit debug flag and only in R2 with retention controls.                                                              |
| **Should local and remote debugging use different code paths?**    | No. Use one structured logger and one trace schema. Local `wrangler dev` should emit the same JSON shape as remote Workers Logs.                                                                                                                                       |
| **Should workflow events be product-visible or operator-visible?** | Keep existing `events` as product-visible/user-facing lifecycle events. Add separate operational logs/spans for internal debugging so the client event stream is not polluted.                                                                                         |
| **Should every workflow step append `stage.progress`?**            | Yes for important boundaries: stage start, cache hit/miss, provider call start/end, parse start/end, validation start/end, persist start/end, apply start/end, ready/fail/cancel. Existing subject-graph stage-progress usage should be generalized.                   |
| **Should Cloudflare native Workflow metrics be used?**             | Yes. Cloudflare exposes Workflow metrics by workflow name, instance ID, step name, event type, and time dimensions, which fits this backend because `runId` is already the Workflow instance ID. ([Cloudflare Docs][2])                                                |
| **Should third-party observability be introduced now?**            | Not initially. First standardize logs/spans locally and in Cloudflare. Add Logpush/Tail Workers or external sinks later; Cloudflare supports dashboard logs, real-time logs, Tail Workers, and Logpush. ([Cloudflare Docs][3])                                         |

---

## Recommended implementation

### 1. Enable Cloudflare Workers Logs in `wrangler.toml`

Add this near the top-level config:

```toml
[observability]
enabled = true
head_sampling_rate = 1
```

For production, consider environment-specific sampling:

```toml
[env.production.observability]
enabled = true
head_sampling_rate = 0.1
```

For staging/local-debug parity, keep full sampling:

```toml
[env.staging.observability]
enabled = true
head_sampling_rate = 1
```

Cloudflare Workers Logs collect invocation logs, custom logs, errors, and uncaught exceptions, and the docs show the `[observability]` Wrangler setting as the activation point. ([Cloudflare Docs][1])

---

### 2. Add a shared structured logger

Create `src/observability/logger.ts`.

```ts
import type { PipelineKind } from '../repositories/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  runId?: string;
  deviceId?: string;
  pipelineKind?: PipelineKind;
  workflowName?: string;
  stage?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  child(ctx: LogContext): Logger;
}

export function createLogger(base: LogContext = {}): Logger {
  const emit = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    const payload = {
      ts: new Date().toISOString(),
      level,
      service: 'abyss-durable-orchestrator',
      event,
      ...base,
      ...fields,
    };

    if (level === 'error') console.error(payload);
    else if (level === 'warn') console.warn(payload);
    else console.log(payload);
  };

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    child: (ctx) => createLogger({ ...base, ...ctx }),
  };
}
```

Use this everywhere instead of ad hoc strings like:

```ts
console.error('[budgetGuard] D1 budget reservation failed:', err);
```

Move to:

```ts
logger.error('budget.reservation.failed', {
  errorMessage: err instanceof Error ? err.message : String(err),
});
```

---

### 3. Refactor `tracer.ts` to emit indexed JSON objects

Current tracer is a good start: it captures `traceId`, `runId`, `deviceId`, `pipelineKind`, `stage`, `model`, policy hash, prompt/schema versions, input hash, provider-healing flag, usage, duration, and error fields.

Change the emission from:

```ts
console.log(`[llm-trace] ${JSON.stringify(trace)}`);
```

to:

```ts
console.log({
  event: 'llm.call.end',
  ...trace,
});
```

Also emit a start event:

```ts
console.log({
  event: 'llm.call.start',
  traceId: trace.traceId,
  runId: trace.runId,
  deviceId: trace.deviceId,
  pipelineKind: trace.pipelineKind,
  stage: trace.stage,
  model: trace.model,
  generationPolicyHash: trace.generationPolicyHash,
  promptVersion: trace.promptVersion,
  schemaVersion: trace.schemaVersion,
  inputHash: trace.inputHash,
  providerHealingRequested: trace.providerHealingRequested,
  startedAt: trace.startedAt,
});
```

This gives remote debugging two useful queries:

```txt
event = "llm.call.start" AND runId = "<run-id>"
event = "llm.call.end" AND runId = "<run-id>"
```

---

### 4. Split provider tracing from parse/validate tracing

In `crystalTrialWorkflow`, the LLM trace starts before a `generate:validated` step that also transitions through parsing and validation before finalizing the trace. That makes `durationMs` ambiguous: it is not pure provider latency.

Recommended split:

* `llm.call.*` span: only `callCrystalTrial` / `callTopicContent` / `callSubjectGraph` / `callTopicExpansion`.
* `artifact.parse.*` span: strict JSON/schema parse.
* `artifact.validate.*` span: semantic validation.
* `artifact.persist.*` span: content hash + R2 write + D1 artifact row.
* `learning_content.apply.*` span: materialization to LCS tables.

This makes dashboards useful:

| Metric                         | Meaning                     |
| ------------------------------ | --------------------------- |
| `llm.call.durationMs`          | Provider latency            |
| `artifact.parse.durationMs`    | JSON/schema parse latency   |
| `artifact.validate.durationMs` | Semantic validation latency |
| `artifact.persist.durationMs`  | R2/D1 persistence latency   |
| `workflow.total.durationMs`    | Full run latency            |

---

### 5. Add an `observedStep` helper for workflow steps

Create `src/workflows/shared/observedStep.ts`.

```ts
import type { WorkflowStep } from 'cloudflare:workers';
import type { Logger } from '../../observability/logger';

export async function observedStep<T>(
  step: WorkflowStep,
  logger: Logger,
  name: string,
  options: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const spanId = crypto.randomUUID();
  const startedAt = Date.now();
  const stepLogger = logger.child({ spanId, stage: name });

  stepLogger.info('workflow.step.start', { stepName: name });

  try {
    const result = await step.do(name, options as never, fn);
    stepLogger.info('workflow.step.success', {
      stepName: name,
      durationMs: Date.now() - startedAt,
    });
    return result as T;
  } catch (err) {
    stepLogger.error('workflow.step.failure', {
      stepName: name,
      durationMs: Date.now() - startedAt,
      errorName: err instanceof Error ? err.name : null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

Use this selectively first on:

1. workflow `plan`
2. LLM provider call
3. parse
4. validate
5. persist
6. apply
7. ready/fail terminal step

Do not wrap every tiny repository call initially; that will create noise.

---

### 6. Use `jobs` as durable operator spans

The schema already has a `jobs` table with `kind`, `stage`, `status`, `input_hash`, `model`, `metadata_json`, timings, and errors. It is currently underused relative to its debugging value.

Recommended policy:

* Insert a `jobs` row for every LLM-generating stage.
* Store `traceId`, `generationPolicyHash`, `schemaVersion`, `promptTemplateVersion`, `responseFormatName`, token usage, and `durationMs` in `metadata_json`.
* Mark `status = 'failed'` with `error_code` and `error_message` on provider/parse/validation failure.
* Link `stage_checkpoints.job_id` to the job row.

This makes D1 enough to answer: “Which exact stage failed and with which model/policy/schema?”

---

### 7. Mark `stage_checkpoints` failed on stage failure

`stage_checkpoints` has `markFailed`, but workflow helpers should call it consistently when a stage fails.

In the stage helper catch block:

```ts
catch (err) {
  const failure = classifyWorkflowTerminalError(err);

  await repos.stageCheckpoints.markFailed(
    runId,
    stage,
    failure.code,
    failure.message,
  ).catch((checkpointErr) => {
    logger.warn('stage_checkpoint.mark_failed.failed', {
      runId,
      stage,
      errorMessage: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
    });
  });

  llmTrace.finalizeFailure(failure.code, failure.message);
  throw err;
}
```

This avoids “run failed but checkpoint still generating” during postmortems.

---

### 8. Add a debug bundle writer for failed runs

The D1 init comment already states R2 should store replay/debug bundles, but the current code primarily stores artifact bodies.

Add `src/observability/debugBundle.ts`:

```ts
import type { Env } from '../env';
import type { Repos } from '../repositories';

export async function writeRunDebugBundle(input: {
  env: Env;
  repos: Repos;
  runId: string;
  deviceId: string;
  failure: { code: string; message: string };
  extra?: Record<string, unknown>;
}): Promise<string | null> {
  const bucket = input.env.GENERATION_ARTIFACTS_BUCKET;
  if (!bucket) return null;

  const run = await input.repos.runs.load(input.runId);
  const events = await input.repos.runs.eventsAfter(input.runId, input.deviceId, 0);
  const checkpoints = await input.repos.stageCheckpoints.byRun(input.runId);

  const key = `debug-runs/${input.runId}/bundle.json`;

  await bucket.put(
    key,
    JSON.stringify({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      run,
      events,
      checkpoints,
      failure: input.failure,
      extra: input.extra ?? {},
    }),
    {
      httpMetadata: { contentType: 'application/json' },
    },
  );

  return key;
}
```

Call it in each workflow terminal failure block after `markFailed`.

Do **not** include raw prompts or raw LLM outputs by default. Add a separate environment flag such as:

```ts
DEBUG_RAW_LLM_IO?: string;
```

and include raw input/output only when explicitly enabled.

---

### 9. Add `/v1/runs/:id/debug` for local/operator debugging

Return a redacted, D1-backed debug view:

```json
{
  "run": "...",
  "events": "...",
  "stageCheckpoints": "...",
  "jobs": "...",
  "artifactMetadata": "...",
  "debugBundleKey": "debug-runs/<runId>/bundle.json"
}
```

Rules:

* Require same `X-Abyss-Device` ownership check as existing run routes.
* Redact secrets.
* Do not return raw prompts/model outputs unless a separate privileged operator mechanism exists.
* Include `debugBundleKey`, not R2 contents, unless local/dev mode.

This endpoint will be more useful than trying to query Cloudflare logs from inside the Worker, which is not the right direction.

---

## Concrete event schema

Use the following JSON fields in all logs:

```ts
{
  ts: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  service: 'abyss-durable-orchestrator',
  event: string,

  requestId?: string,
  runId?: string,
  deviceId?: string,
  pipelineKind?: string,
  workflowName?: string,
  stage?: string,

  traceId?: string,
  spanId?: string,
  parentSpanId?: string,

  status?: string,
  errorCode?: string,
  errorMessage?: string,

  inputHash?: string,
  contentHash?: string,
  artifactId?: string,
  schemaVersion?: number,
  promptVersion?: number,
  generationPolicyHash?: string,

  durationMs?: number,
  tokensIn?: number,
  tokensOut?: number,
  totalTokens?: number
}
```

Recommended event names:

```txt
http.request.start
http.request.end
run.submit.start
run.submit.cache_hit
run.submit.cache_miss
run.submit.created
run.submit.dispatch_failed
workflow.start
workflow.cancel_requested
workflow.step.start
workflow.step.success
workflow.step.failure
llm.call.start
llm.call.end
artifact.parse.start
artifact.parse.failure
artifact.validate.failure
artifact.persist.success
learning_content.apply.success
token_accounting.failure
workflow.terminal.ready
workflow.terminal.failed
workflow.terminal.cancelled
debug_bundle.write.success
debug_bundle.write.failure
```

---

## Priority plan

### P0 — Do first

1. Add `[observability] enabled = true` to `wrangler.toml`.
2. Replace prefixed string logs with structured JSON object logs.
3. Add `requestId`, `runId`, `pipelineKind`, and `stage` to all route/workflow logs.
4. Split LLM tracing from parse/validate timing.
5. Log workflow dispatch success/failure with `runId` and `kind`.

### P1 — Next

1. Generalize `stage.progress` events across all workflows.
2. Use `jobs` as durable LLM-stage spans.
3. Mark `stage_checkpoints` failed consistently.
4. Write failure debug bundles to R2.
5. Add `/v1/runs/:id/debug`.

### P2 — Later

1. Add Logpush or Tail Workers for external sink/export. Cloudflare supports dashboard logs, real-time logs, Tail Workers, and Workers Logpush. ([Cloudflare Docs][4])
2. Add dashboards grouped by `pipelineKind`, `stage`, `errorCode`, `model`, and `generationPolicyHash`.
3. Add alert thresholds for `llm:rate-limit`, `llm:upstream-5xx`, parse failures, validation failures, and stuck active runs.

---

## Key code-level corrections

### Current issue: LLM trace is too broad

Current trace semantics suggest “LLM call,” but the workflow wraps generate + parse + validate in one traced block. Recommended fix: start/finalize `llm.call.*` immediately around `callOpenRouterChat` only, then create separate parse/validate spans.

### Current issue: logs are less queryable than they should be

Current tracer emits a string prefix plus serialized JSON. Recommended fix: emit the object itself.

```ts
console.log({
  event: 'llm.call.end',
  ...trace,
});
```

This aligns with Cloudflare’s recommendation to log JSON objects for indexed fields and faster filtering. ([Cloudflare Docs][1])

### Current issue: `wrangler.toml` lacks explicit observability config

Add the `[observability]` block. Your current dependencies already use a modern Wrangler version, and Cloudflare’s docs show Workers Logs require the setting in the Wrangler file. ([Cloudflare Docs][1])

### Current issue: failure postmortem requires stitching too much manually

Write a run-scoped R2 debug bundle on terminal failure and expose a redacted debug endpoint. This fits the existing architecture: D1 for queryable metadata and R2 for larger artifacts/debug bundles.

[1]: https://developers.cloudflare.com/workers/observability/logs/workers-logs/ "Workers Logs · Cloudflare Workers docs"
[2]: https://developers.cloudflare.com/workflows/observability/metrics-analytics/ "Metrics and analytics · Cloudflare Workflows docs"
[3]: https://developers.cloudflare.com/workers/observability/ "Observability · Cloudflare Workers docs"
[4]: https://developers.cloudflare.com/workers/observability/logs/ "Logs · Cloudflare Workers docs"
