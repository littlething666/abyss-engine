# ADR 0002: Durable Generation Infrastructure

Status: accepted
Date: 2026-05-09

## Context

Abyss generation must continue after the browser tab closes, preserve resumable run state, support deterministic artifact caching, and keep generated artifact bodies out of queryable relational rows. Earlier planning compared Cloudflare Workflows, Durable Objects, D1, R2, and hosted Supabase-era migration artifacts.

The current target is a Cloudflare-native backend before release. There is no released database to migrate, so the canonical schema/init path is the source of truth.

## Decision

Use Cloudflare Workflows, D1, and R2 by default. Reserve Durable Objects for narrow coordination problems only after a concrete need appears.

| Need | Decision | Rejected default |
| --- | --- | --- |
| Durable execution | Cloudflare Workflows | Durable Objects as a homemade workflow engine |
| Queryable run/job/event/product metadata | D1 | R2 JSON files as a database |
| Generated artifact bodies and checkpoints | R2 | D1 rows for large theory/cards/mini-game payloads |
| Per-device/run serialization or live fanout | Durable Objects only if proven necessary | Durable Objects as global source of truth |

The default architecture is:

```txt
Worker / Hono API
  ├─ D1: devices, runs, jobs, events, artifacts metadata, usage counters, Learning Content Store
  ├─ R2: generated JSON artifacts, stage checkpoints, raw/debug bundles
  └─ Workflows: durable pipeline execution
```

## Decision Record Ownership

`docs/infrastructure-decisions.md` is removed. Durable infrastructure decisions live in ADRs instead of in a separate pointer or summary file:

- ADR 0002 owns durable infrastructure, persistence, storage, workflow, observability, and Cloudflare-native target-stack decisions.
- ADR 0003 owns backend-authoritative generation, browser-boundary, retry/cancel ownership, and prompt/parser cleanup decisions.
- ADR 0001 owns the narrower Subject Graph complete-publication boundary under the backend-authoritative model.

Do not create a separate archive for deleted historical plans. Git history already preserves removed plans and superseded prose, and keeping duplicate planning documents creates decision drift.

## Consequences

- Workflows own durable multi-step execution, retry, sleep, and persisted step state.
- D1 is the queryable system of record for run, job, event, artifact metadata, usage, and Learning Content Store rows.
- R2 stores large or replay-oriented blobs: final artifact JSON, stage checkpoints, raw model outputs when retained, eval snapshots, and redacted debug bundles.
- Worker/Hono routes are the only browser-facing backend seam; the browser never talks directly to D1 or R2.
- Durable Objects may be added later for strict per-device serialization, per-run live fanout, low-latency sequence allocation, or hot state with durable recovery, but they must not replace D1 or Workflows.
- Do not add hosted Supabase migration history or Supabase Storage buckets to the target architecture.
- Do not reintroduce `docs/infrastructure-decisions.md`, separate historical-plan archives, or durable infrastructure summary files as decision sources. New accepted decisions must be added to ADRs.

## Workflow and Event Rules

- Workflows persist internal step state, but the UI depends on D1 `events` and run rows, not Workflow internals.
- Workflow steps must be granular and idempotent.
- Side effects must occur inside named Workflow steps and use deterministic semantic idempotency or natural upsert semantics.
- D1 `events.semantic_key` is unique per `run_id`; Workflow code emits deterministic semantic keys for status, stage-progress, artifact-ready, and terminal events through append-once helpers.
- Artifact writes, checkpoints, Learning Content Store application, cache-hit materialization, token accounting, and terminal writes require Cloudflare runtime replay/concurrency coverage.

## Observability Boundary

- Product-visible lifecycle events live in D1 `events` and are consumed by SSE.
- Operational telemetry lives in Workers Logs and D1 `jobs`, not in product event streams.
- Backend logs emit structured JSON with stable fields such as `event`, `runId`, `deviceId`, `pipelineKind`, `stage`, `traceId`, `spanId`, `errorCode`, `durationMs`, and token counts.
- `runId` is the canonical correlation key; `traceId` identifies individual LLM calls and `spanId` identifies observed internal steps.
- Redacted debug bundles may be stored in R2 under `debug-runs/{runId}/bundle.json`; raw prompts/model outputs are not included by default.

## Related

- [ADR 0001: Subject Graph Generation Publishes Only Complete Subjects](./0001-subject-graph-publication-boundary.md)
- [ADR 0003: Backend-Authoritative Generation and Learning Content](./0003-backend-authoritative-generation.md)
