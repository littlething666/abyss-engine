# D1 Testing Strategy

**Last updated:** 2026-05-07  
**Context:** Backend route/repository tests currently rely on `fakeD1` stubs; no local Wrangler-based D1 integration suite is present.

## 1) What the two prior research passes established

1. **Pass A — fake/stub vs real D1**
   - Compared stubs (`fakeD1`) against local Wrangler/Miniflare-backed testing for repository and route layers.
   - Recommendation: keep stubs as fast unit tests, add local D1 integration tests for SQL/runtime fidelity.

2. **Pass B — local Wrangler workflows in Node**
   - Confirmed current direction in Cloudflare docs: Workers testing with `@cloudflare/vitest-pool-workers`, local Wrangler/M1niflare usage, and migration wiring.
   - Recommendation: use explicit local/remote flags and migration bootstrap for integration tests, especially in CI.

## 2) Practical policy for this repository

### Use `fakeD1` (stubs) for unit scope

- Business-logic tests that assert:
  - function branching and validation
  - query-call intent (SQL shape and bound args)
  - deterministic error paths
- Characteristics:
  - Very fast and stable
  - Fully offline-friendly
  - Easy to maintain for many edge-case branches

### Use local D1 (Wrangler + Vitest pool/miniflare) for integration scope

- SQL, schema, and runtime integration tests that must match Cloudflare behavior:
  - migration application and schema state
  - prepared statement execution behavior
  - constraint/index/typing edges not captured by mocks
  - `env.DB` wiring and request-handler behavior under runtime bindings
- Add a narrow integration suite (not for every test), focused on representative query paths.

### Use remote D1 only for production-like smoke checks
- Remote bindings are useful for explicit parity checks only where local mode is insufficient.
- Avoid broad local-to-remote switching in normal test loops.

## 3) Recommended test split

- **~70–90% unit tests:** stubbed `fakeD1` style.
- **~10–25% integration tests:** local D1-backed suite using `wrangler d1` + `@cloudflare/vitest-pool-workers`.
- **Only explicit smoke tests:** remote mode when needed, with strict guardrails.

## 4) Reliable local D1 test pattern (minimum)

- `wrangler dev` (local mode by default) for local bindings.
- Seed/mutate local schema via:
  - `wrangler d1 execute <db> --local --file ./schema.sql`
  - `wrangler d1 migrations apply <db> --local` (or `--local`/`--remote` explicitly by intent).
- In Workers/Vitest:
  - configure `cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })`
  - load/apply migrations in setup using `readD1Migrations()` + `applyD1Migrations()`.

## 5) Common pitfalls (from current guidance)

- Local DB starts empty unless seeded/migrated.
- Table/column errors (`no such table`) are common if migrations are skipped.
- Local state can leak between runs if persistence paths are reused.
- Remote mode can mutate real data if misconfigured; isolate local and remote paths.
- Jest-based/older unstable patterns are legacy and should be treated as migration candidates.

## 6) Acceptance criteria for a healthy D1 test stack

- Unit coverage for behavior stays fast and deterministic with stubs.
- Representative SQL/engine-sensitive paths are covered by real local D1.
- CI applies migrations and runs integration tests deterministically in local mode.
- Remote migration/test steps are explicit and permission-scoped.

## 7) References

- Cloudflare D1 local development: https://developers.cloudflare.com/d1/build-with-d1/local-development/
- D1 best practices (local dev): https://developers.cloudflare.com/d1/best-practices/local-development/
- Wrangler D1 commands (`d1 execute`, `migrations`, `--local/--remote`): https://developers.cloudflare.com/workers/wrangler/commands/d1/
- Workers Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Vitest D1 helpers (`readD1Migrations`, `applyD1Migrations`): https://developers.cloudflare.com/workers/testing/vitest-integration/configuration
- Cloudflare community migration/setup gotcha discussion: https://github.com/cloudflare/workers-sdk/discussions/7855

# D1 Testing Strategy

**Last updated:** 2026-05-07  
**Scope:** Backend tests for D1-backed routes, repos, and Workers integration  

## Decision summary

Use a two-layer strategy:

1. Keep **fake/stub-based D1** tests for fast, deterministic unit coverage.
2. Add a focused **local Wrangler D1 integration layer** for SQL, migration, and runtime-behavior fidelity.

This avoids over-mocking data logic while keeping the full suite fast and stable.

## Current project baseline

- A local stub exists in `backend/src/testStubs/fakeD1.ts`.
- Existing route/repo tests already rely on this approach (`backend/src/routes/learningContent.test.ts`, `backend/src/learningContent/learningContentRepo.test.ts`).

This baseline is good for unit-level guarantees (branching, mapping, error propagation), but it does not validate engine-level SQL behavior.

## When stubs are acceptable

Use fake/stubbed D1 clients when the test objective is:

- Logic validation over behavior of the SQL engine.
- Query-shape verification and deterministic error-path simulation.
- Fast CI runs and strong isolation (no DB bootstrapping overhead).
- Environments where Cloudflare CLI/test runtime is not needed.

This aligns with unit test goals and keeps tests cheap to maintain.

## When local Wrangler/Miniflare D1 is recommended

Use local D1-backed integration tests when you need confidence in:

- SQL semantics (query behavior, constraints, schema assumptions, pagination/ordering, prepared statement behavior).
- Migration correctness and execution-order guarantees.
- Worker binding/runtime wiring (`env.DB.prepare(...)`, `env` availability, route/request wiring).
- Full-path request assertions against handlers that involve persistent state.

Cloudflare’s current Workers guidance points to Vitest + `@cloudflare/vitest-pool-workers` for this case, with migration support via `readD1Migrations` and `applyD1Migrations`.

## Common risks and pitfalls

1. **Schema is not auto-seeded in tests**  
   A local D1 instance can appear empty (`no such table`) unless migrations/seed scripts are executed before assertions.

2. **State drift across local runs**  
   Local persistence can leak fixtures between runs if not reset; this is configurable with Wrangler options.

3. **Wrong environment target**  
   Local vs remote behavior differs and local mode does not use production data by default.

4. **CI surprises**  
   Migration commands in CI should be explicit and repeatable (`--local` vs `--remote`).

5. **Mock fidelity mismatch**  
   Fakes can miss SQLite/D1 runtime details (edge-case SQL and driver behavior), so they should not be the only line of defense for persistence logic.

## Recommended implementation pattern

### Unit layer (default)

- Continue using stubbed D1 binding(s) for:
  - repository/unit tests
  - route-level logic tests with deterministic fixtures
- Keep tests small and fully deterministic.

### Integration layer (targeted)

- Add Vitest integration config with Wrangler bindings:
  - `wrangler` config path
  - `cloudflareTest(...)`
  - `readD1Migrations(...)`
- Apply migrations in setup (or dedicated bootstrap step) before integration assertions.
- Execute SQL/seed operations against local D1 (`--local`) in test setup flow.

### Optional e2e/pre-production checks

- Use remote execution only where cloud-specific behavior is explicitly required.
- Keep remote mode explicit and isolated (`--remote`) because it mutates networked environments.

## High-signal command references

- Start local test runtime with local bindings: `wrangler dev`
- Execute SQL against local D1: `wrangler d1 execute <DB> --local --command "<SQL>"`
- Run local SQL from file: `wrangler d1 execute <DB> --local --file ./path.sql`
- Apply migrations: `wrangler d1 migrations apply <DB> --local`
- Apply migrations in CI or scripted flows with non-interactive behavior and explicit mode flags.

## References

- https://developers.cloudflare.com/d1/build-with-d1/local-development/
- https://developers.cloudflare.com/d1/best-practices/local-development/
- https://developers.cloudflare.com/workers/development-testing/
- https://developers.cloudflare.com/workers/development-testing/bindings-per-env
- https://developers.cloudflare.com/workers/testing/vitest-integration/
- https://developers.cloudflare.com/workers/testing/vitest-integration/configuration
- https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis
- https://developers.cloudflare.com/workers/wrangler/commands/d1/
- https://developers.cloudflare.com/workers/testing/miniflare/storage/d1/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/d1
- https://github.com/cloudflare/workers-sdk/discussions/7855
- https://www.npmjs.com/package/cloudflare-test-utils

## Decision in one line

Keep stubs for unit velocity, and introduce local D1 integration tests for anything that depends on real persistence behavior.
