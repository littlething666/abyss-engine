# E2E test suite — Abyss Engine

Playwright specs live in this directory. Tests run against the dev server started
by `playwright.config.ts` with `NEXT_PUBLIC_PLAYWRIGHT=1`, which activates the
scene probe and the `abyssDev.*` helper surface.

## Layout

- `tests/fixtures/app.ts` — `test` extended with `seededApp`, `consoleErrors`
- `tests/utils/` — shared helpers
  - `test-helpers.ts` — existing helpers (hydration, canvas, WebGPU gate)
  - `progression-probe.ts` — event bus capture (`abyss-*`)
  - `sm2-assertions.ts` — SM-2 snapshot and direction assertions
  - `three-probe.ts` — access `window.__abyssScene`
  - `mini-game-actions.ts` — tap-select + tap-place helpers
- `tests/scene/` — 3D scene specs
- `tests/study/` — Flashcard, Single Choice, Multi Choice
- `tests/mini-games/` — Category Sort, Sequence Build, Connection Web
- `tests/crystal-trial/` — trigger/pass/fail

## Principles

1. **Drive state through JS** (`abyssDev.*`), not pixels. The 3D canvas is
   opaque; only smoke tests click it directly.
2. **Assert on events + state**, not rendered frames, except in visual-regression
   specs.
3. **Use `data-testid`** for all 2D UI interactions. Mini-game item chips expose
   `data-testid="mg-item-<itemId>"`.
4. **No `waitForTimeout` for state** — use `expect.poll`.
5. **Isolation** — `seededApp` clears storage and seeds a deterministic deck
   before every test.

## Running locally

```sh
pnpm run test:e2e:smoke         # boot test only
pnpm run test:e2e:headless      # full suite, headless
pnpm run test:e2e:headful       # full suite with UI
```

## CI artifacts

The `E2E WebGPU` workflow uploads `playwright-report`, `playwright-results`, and
visual snapshots on every failing run. Visual-regression baselines are not
committed — they are regenerated per workflow run as artifacts. See
`.github/workflows/e2e-headless-ci.yml`.
