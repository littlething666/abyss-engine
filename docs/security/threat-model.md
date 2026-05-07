# Threat Model — Abyss Engine Durable Generation (v1)

**Last updated:** 2026-05-07
**Status:** Phase 4 — productionization
**Scope:** Cloudflare Workers orchestrator, D1 state, R2 artifacts, browser client

## Summary

Abyss Engine v1 deploys a server-side durable generation orchestrator that persists per-device generation run state, artifacts, and usage counters. This document identifies the trust boundaries, assets, threats, and mitigations for the pre-auth (device-ID-based) v1 deployment and outlines the path to account auth after Phase 4.

## Trust boundaries

```
┌─ Browser (Next.js static export) ──────────────────────────────────────┐
│  localStorage: abyss.deviceId (UUID v4)                                │
│  IndexedDB: applied_artifacts, abyss-deck, content-generation-logs     │
│  Env: NEXT_PUBLIC_DURABLE_RUNS, NEXT_PUBLIC_DURABLE_GENERATION_URL     │
└─────────────────────────────────── HTTP ───────────────────────────────┘
                    │
                    ▼
┌─ Cloudflare Workers (Hono) ────────────────────────────────────────────┐
│  CORS: ALLOWED_ORIGINS env var                                         │
│  Secrets: OPENROUTER_API_KEY                                           │
│  Bindings: D1 database, R2 artifact bucket, Workflow classes            │
└───────┬───────────────────────┬───────────────────────────┬────────────┘
        │                       │                           │
        ▼                       ▼                           ▼
┌─ Cloudflare D1 ─────┐  ┌─ Cloudflare R2 ───────┐  ┌─ OpenRouter ────────┐
│ run/job/event state │  │ JSON artifacts,       │  │ Strict json_schema  │
│ metadata, usage,    │  │ checkpoints, raw      │  │ requests + response │
│ Learning Content    │  │ outputs, debug blobs  │  │ healing plugin      │
│ Store tables        │  └───────────────────────┘  └─────────────────────┘
└─────────────────────┘
```

## Assets

| Asset | Location | Sensitivity |
|---|---|---|
| Device run history | `runs`, `jobs`, `events` rows | Low — reveals topic/study timing |
| Generation artifacts | D1 `artifacts` metadata + Cloudflare R2 blobs | Low — educational content |
| Usage counters | `usage_counters` rows | Low — aggregate token counts |
| Device identity | `devices` rows | Medium — links activity to device |
| OpenRouter API key | Cloudflare Worker secret | **High** — billable LLM access |

## Threat: Unauthorized device access (pre-auth v1)

**Description:** An attacker with a known device UUID can query that device's generation runs and artifacts via the Hono Worker API.

**Severity:** Low (v1). No PII, no payment data, no user accounts.

**Current mitigation:**
- `deviceId` is a random UUID v4 (122 bits of entropy), not guessable.
- Workers enforce `X-Abyss-Device` header on all endpoints.
- No endpoint exposes cross-device data or device enumeration.

**Planned mitigation (Phase 4+):**
- Migrate to account auth (see [auth-migration.md](./auth-migration.md)).
- After auth, replace `device_id` scoping with `user_id` scoping in Worker-mediated D1 queries.
- `deviceId` becomes an anonymous session identifier, not an account.

**Residual risk (v1):**
- UUID leakage (e.g., shared screenshot, browser extension, compromised localStorage) allows read access to that device's generation history.
- Acceptable for v1 educational tool with no PII.

## Threat: Worker secret or binding misuse

**Description:** A Worker code injection vulnerability could misuse D1/R2 bindings or exfiltrate the OpenRouter API key.

**Severity:** **High**. Full backend read/write and billable LLM access.

**Current mitigation:**
- Secrets are stored as Cloudflare Worker encrypted secrets.
- D1/R2 are only reachable through Worker bindings.
- Secrets and bindings are never exposed to the browser.
- CORS restricts API access to configured origins.

**Planned mitigation (Phase 4+):**
- Add account-auth validation at the Worker boundary.
- Scope every D1 query by authenticated `user_id` where present.
- Audit logging on Worker secret access.

**Residual risk (v1):**
- A Worker code injection vulnerability could misuse bindings or exfiltrate secrets.
- Acceptable for v1 with dependency lockfile and regular audit.

## Threat: Artifact exposure

**Description:** R2 artifacts are read through the Worker proxy (`GET /v1/artifacts/:id`).

**Severity:** Low. Artifacts are educational content (flashcards, theory, trial questions).

**Mitigation:**
- Artifacts are never exposed through a public bucket.
- The Worker resolves artifact metadata in D1, reads the R2 object through its binding, and returns the JSON envelope directly.
- No direct browser-to-R2 or browser-to-D1 artifact access path exists.

**Residual risk:** None for v1 while Worker is the sole artifact access path.

## Threat: Budget bypass

**Description:** An attacker could attempt to bypass the per-device daily budget caps.

**Severity:** Medium. Could cause unexpected OpenRouter billing.

**Current mitigation:**
- Budget enforcement is atomic via `reserve_run_budget` RPC (locks `usage_counters` row).
- Enforcement runs BEFORE Workflow creation — over-cap requests receive `429` without consuming resources.
- Per-device scoping prevents one device from exhausting global quota.

**Planned mitigation (Phase 4+):**
- Auth-backed budgets prevent new-device-spamming attacks.
- Per-user (not per-device) budgets after auth migration.
- OpenRouter spending limits as belt-and-suspenders.

**Residual risk (v1):**
- An attacker can mint unlimited device UUIDs and each gets a fresh budget window.
- OpenRouter global spending limit provides a hard ceiling.
- Acceptable for v1 given low per-device caps (10 runs/day, 500K tokens/day default).

## Threat: SSE stream abuse

**Description:** An attacker opens many concurrent SSE connections, exhausting Worker concurrent connection limits.

**Severity:** Low. SSE connections are lightweight and Cloudflare Workers handle substantial concurrency.

**Mitigation:**
- SSE streams terminate on run completion/failure/cancellation.
- Keepalive comments every 15s detect dead connections.
- Cloudflare Workers platform enforces per-account connection limits.

**Residual risk:** Acceptable for v1 without auth-driven connection limits.

## Threat: Idempotency-key replay

**Description:** An attacker replays a captured `Idempotency-Key` to create duplicate runs.

**Severity:** Low. The idempotency key only prevents duplicate run creation; it does not grant access.

**Mitigation:**
- Idempotency enforcement is per-device (`(device_id, idempotency_key)` unique constraint).
- 24-hour TTL — stale keys create fresh runs, not duplicates.
- Key derivation includes `input_hash`, making it content-bound, not reusable across different inputs.

**Residual risk:** An attacker who knows a device's UUID and a recent idempotency key could replay it within 24h to trigger a cache-hit response. No new LLM calls are made. Acceptable.

## Dependency threat model

| Dependency | Risk | Mitigation |
|---|---|---|
| `hono` | API framework — low blast radius | Pinned in `package.json`; semver-range audit |
| Cloudflare D1 binding | Queryable state access — high blast radius | Worker-only binding; all queries scoped by device or user |
| Cloudflare R2 binding | Artifact blob access — medium blast radius | Worker-only binding; no public bucket access |
| `zod` | Schema validation — low blast radius | Pinned; version-locked schema exports |
| `@cloudflare/workers-types` | Dev-only types — no runtime risk | Dev dependency only |
| `wrangler` | Deployment tool — CI-only risk | Dev dependency; CI secrets scoped |

## Future threat model additions (Phase 4+)

1. **Account auth** — Worker-level user validation and D1 query scoping.
2. **Worker audit logging** — structured access logs to Cloudflare Logpush or equivalent.
3. **Artifact content scanning** — prevent abuse through generated content.
4. **Rate limiting by IP** — defense-in-depth beyond per-device budgets.
5. **OpenRouter content filtering** — enable moderation flags on generation requests.
