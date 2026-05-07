# Threat Model — Abyss Engine Durable Generation (v1)

**Last updated:** 2026-05-06
**Status:** Phase 4 — productionization
**Scope:** Cloudflare Workers orchestrator, Supabase Postgres state, browser client

## Summary

Abyss Engine v1 deploys a server-side durable generation orchestrator that persists per-device generation run state, artifacts, and usage counters. This document identifies the trust boundaries, assets, threats, and mitigations for the pre-auth (device-ID-based) v1 deployment and outlines the path to Supabase Auth in Phase 4+.

## Trust boundaries

```
┌─ Browser (Next.js static export) ──────────────────────────────────────┐
│  localStorage: abyss.deviceId (UUID v4)                                │
│  IndexedDB: applied_artifacts, abyss-deck, content-generation-logs     │
│  Env: NEXT_PUBLIC_DURABLE_RUNS, NEXT_PUBLIC_DURABLE_GENERATION_URL     │
└─────────────────────────────────── HTTP ───────────────────────────────┘
                    │                              ▲
                    ▼                              │
┌─ Cloudflare Workers (Hono) ────────────────────────────────────────────┐
│  CORS: ALLOWED_ORIGINS env var                                         │
│  Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE, OPENROUTER_API_KEY      │
└─────────────────────────────────── Postgres ───────────────────────────┘
                    │                              ▲
                    ▼                              │
┌─ Supabase ─────────────────────────────────────────────────────────────┐
│  Postgres: devices, runs, jobs, events, artifacts, usage_counters,     │
│            device_settings, stage_checkpoints                          │
│  Storage: generation-artifacts bucket (JSON blobs)                     │
└────────────────────────────────────────────────────────────────────────┘
                    │                              ▲
                    ▼                              │
┌─ OpenRouter ───────────────────────────────────────────────────────────┐
│  Strict json_schema requests + response-healing plugin                   │
└────────────────────────────────────────────────────────────────────────┘
```

## Assets

| Asset | Location | Sensitivity |
|---|---|---|
| Device run history | `runs`, `jobs`, `events` rows | Low — reveals topic/study timing |
| Generation artifacts | `artifacts` rows + Supabase Storage | Low — educational content |
| Usage counters | `usage_counters` rows | Low — aggregate token counts |
| Device identity | `devices` + `device_settings` rows | Medium — links activity to device |
| Device settings | `device_settings` rows | Medium — model binding preferences |
| Supabase service-role key | Cloudflare Worker secret | **High** — full database access |
| OpenRouter API key | Cloudflare Worker secret | **High** — billable LLM access |

## Threat: Unauthorized device access (pre-auth v1)

**Description:** An attacker with a known device UUID can query that device's generation runs, artifacts, and settings via the Hono Worker API.

**Severity:** Low (v1). No PII, no payment data, no user accounts.

**Current mitigation:**
- `deviceId` is a random UUID v4 (122 bits of entropy), not guessable.
- Workers enforce `X-Abyss-Device` header on all endpoints.
- No endpoint exposes cross-device data or device enumeration.

**Planned mitigation (Phase 4+):**
- Migrate to Supabase Auth (see [auth-migration.md](./auth-migration.md)).
- After auth, replace `device_id` scoping with `user_id` scoping + Row-Level Security (RLS).
- `deviceId` becomes an anonymous session identifier, not an account.

**Residual risk (v1):**
- UUID leakage (e.g., shared screenshot, browser extension, compromised localStorage) allows read access to that device's generation history.
- Acceptable for v1 educational tool with no PII.

## Threat: Supabase service-role key compromise

**Description:** The `SUPABASE_SERVICE_ROLE` secret held by the Cloudflare Worker grants unrestricted Postgres access (bypasses RLS).

**Severity:** **High**. Full database read/write, including all devices' data.

**Current mitigation:**
- Secret stored as Cloudflare Worker encrypted secret (`wrangler secret put`).
- Never exposed to browser — Worker uses it server-side only.
- CORS restricts API access to configured origins.

**Planned mitigation (Phase 4+):**
- After Supabase Auth migration, add RLS policies on all tables keyed by `auth.uid()`.
- Worker uses a limited Postgres role (not service-role) through Supabase Auth JWTs.
- Audit logging on Worker secret access.

**Residual risk (v1):**
- A Worker code injection vulnerability (e.g., dependency supply-chain attack) could exfiltrate the service-role key.
- Acceptable for v1 with dependency lockfile and regular audit.

## Threat: Artifact URL exposure

**Description:** Supabase Storage artifacts are served via signed URLs or through the Worker proxy (`GET /v1/artifacts/:id`).

**Severity:** Low. Artifacts are educational content (flashcards, theory, trial questions).

**Mitigation:**
- Artifacts are never exposed as public Supabase Storage URLs.
- The Worker resolves artifacts via service-role credentials and returns JSON envelope directly.
- No direct browser-to-Supabase artifact access path.

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
| `@supabase/supabase-js` | Database client — high blast radius | Pinned; service-role key never exposed to browser |
| `zod` | Schema validation — low blast radius | Pinned; version-locked schema exports |
| `@cloudflare/workers-types` | Dev-only types — no runtime risk | Dev dependency only |
| `wrangler` | Deployment tool — CI-only risk | Dev dependency; CI secrets scoped |

## Future threat model additions (Phase 4+)

1. **Supabase Auth RLS policies** — table-level security rules per authenticated user.
2. **Worker audit logging** — structured access logs to Cloudflare Logpush or equivalent.
3. **Artifact content scanning** — prevent abuse through generated content.
4. **Rate limiting by IP** — defense-in-depth beyond per-device budgets.
5. **OpenRouter content filtering** — enable moderation flags on generation requests.
