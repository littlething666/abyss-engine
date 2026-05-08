# Durable Generation Infrastructure Decision

**Last updated:** 2026-05-08
**Status:** Phase 4 target architecture

## Recommendation

Use **Cloudflare Workflows, D1, and R2** by default, with **Durable Objects** reserved for narrow coordination problems.

| Need | Use | Do not use |
| --- | --- | --- |
| Durable execution | **Cloudflare Workflows** | Durable Objects as a homemade workflow engine |
| Run/job/event metadata | **D1** | R2 JSON files as a database |
| Generated artifacts/checkpoints | **R2** | D1 rows for large theory/cards/mini-game payloads |
| Per-device/run serialization, live coordination | **Durable Objects**, optional | Durable Objects as the global source-of-truth database |

Cloudflare Workflows are the right primitive for “tab closes but generation continues”: they provide durable multi-step execution, retries, sleeps, and persisted step state. Durable Objects are not required just to make generation durable.

## Default Architecture

```txt
Worker / Hono API
  ├─ D1: devices, runs, jobs, events, artifacts metadata, usage counters
  ├─ R2: generated JSON artifacts + stage checkpoints
  └─ Workflows: durable pipeline execution
```

Pipeline model policy and response healing are **not** device settings. `POST /v1/runs` accepts compact `{ kind, intent }` requests only; the Worker rejects client-supplied snapshots and generation-policy fields, then expands the intent against the Learning Content Store plus backend Generation Policy before hashing and persistence. Route bodies, params, and query strings should pass through the shared Zod-backed route validation seam before repository or Workflow code; invalid retry JSON, malformed list filters, and malformed Crystal Trial read inputs fail at the Worker boundary rather than being interpreted downstream. Worker OpenRouter calls route through one canonical `callOpenRouterChat` boundary that preserves strict `json_schema`, backend-policy-owned response healing, token usage accounting, no streaming, no `json_object` fallback, and fail-loud validation of provider response wrappers. If account or product settings later need backend persistence, D1 is the queryable store for those settings; generation-pipeline policy stays backend-owned configuration.

## Durable Objects

Do not start with Durable Objects for v1 unless D1 contention or live fanout issues are proven.

Use **Durable Objects** if one of these becomes true:

1. **Strict per-device concurrency control**  
   Example: only one expensive `topic-content` run per device/topic at a time.
2. **Per-run live fanout coordination**  
   Example: multiple tabs watching the same run; one Durable Object instance multiplexes SSE/WebSocket state.
3. **Low-latency sequential counters**  
   Example: emitting monotonic `seq` numbers without D1 race handling.
4. **Hot in-memory state with durable recovery**  
   Durable Objects can keep memory while active, but must persist state to storage because objects can be evicted or restarted.

One useful optional Durable Object would be narrow:

```txt
DeviceRunCoordinatorDO(deviceId)
  - accepts submit intent
  - serializes duplicate/concurrent run creation
  - writes canonical rows to D1
  - starts Workflow
  - does not store artifacts
  - does not replace D1
```

## Storage Boundary

### D1: System Of Record

Use D1 for indexed, queryable product state:

- `devices`
- `runs`
- `jobs`
- `events`
- `artifacts` metadata
- `usage_counters`
- backend-owned settings if a future product setting needs server persistence

D1 is the right place for indexed queries such as:

```sql
GET /v1/runs?status=active
GET /v1/runs/:id
GET /v1/runs/:id/events?afterSeq=42
```

### R2: Artifact Body Store

Use R2 for large or replay-oriented blobs:

- final artifact JSON
- stage checkpoints
- raw model outputs, optionally compressed
- eval snapshots
- replay/debug bundles

R2 is object storage for large unstructured data and batch-process outputs, not a relational run ledger.

Good R2 keys:

```txt
abyss/{deviceId}/{kind}/{schemaVersion}/{inputHash}.json
abyss/{deviceId}/{kind}/{runId}/raw-primary.json
abyss/{deviceId}/{kind}/{runId}/raw-repair.json
```

### Workflows: Orchestration State, Not Product State

Workflows can persist step state and recover across failures, but the UI should not depend on Workflow internals as the user-facing state store. Mirror meaningful state transitions into D1 `events`.

Workflow steps must be granular and idempotent. Avoid side effects outside `step.do`; steps may retry or workflow engine execution may restart. Persisted run events use D1-level semantic idempotency: `events.semantic_key` is unique per `run_id`, and Workflow code emits deterministic semantic keys for status, stage-progress, artifact-ready, and terminal events through `appendOnce` / `appendTypedOnce`. Artifact writes, checkpoints, Learning Content Store application, cache-hit materialization, token accounting, and terminal writes now sit behind named Workflow steps; new side effects must follow the same deterministic-step and natural-upsert/idempotency posture and be covered by Cloudflare runtime replay tests.

## Bottom Line

Do not choose between Durable Objects and R2. They solve different problems:

- **R2**: durable blobs/artifacts.
- **D1**: durable relational state.
- **Workflows**: durable background execution.
- **Durable Objects**: optional strongly consistent per-key coordination.

For the current architecture, ship **Workflows + D1 + R2 first**. Add Durable Objects only after a concrete coordination problem appears.

## References

- [Cloudflare Workflows overview](https://developers.cloudflare.com/workflows/)
- [Durable Objects storage best practices](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Cloudflare D1 overview](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 overview](https://developers.cloudflare.com/r2/)
- [Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
