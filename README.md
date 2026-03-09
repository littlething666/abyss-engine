# Abyss Engine

## Overview

Abyss Engine is a modular edutainment framework where studying cards / quizzes triggers 3D crystal growth on a grid. The engine combines spaced repetition learning with immersive 3D visualization. Goal is to make process of studying difficult topics easygoing and rewarding.

## Development Philosophy

### MVP First - Minimalist Approach

- **Simplicity over features**: Build only what is essential for the core experience
- **Single responsibility**: Each component/module does one thing well
- **Iterative refinement**: Evolve based on actual usage, not hypothetical needs
- **Clean interfaces**: Minimal, well-defined APIs between components

### No Backward Compatibility

- **Rapid iteration**: We do not maintain backward compatibility between versions
- **Breaking changes welcomed**: Architecture improvements take priority over stability
- **Fresh starts**: When a better approach is found, refactor without hesitation
- **No legacy burden**: Remove deprecated patterns immediately

## Tech Stack

- **Framework**: Next.js 16 + React 19
- **Language**: TypeScript 5
- **3D Rendering**: React Three Fiber (v10), @react-three/drei, Three.js 0.182
- **State Management**: Zustand
- **Server State/Data Fetching**: TanStack Query (React Query)
- **Styling**: Tailwind CSS 4
- **Testing**: Vitest (unit) and Playwright (E2E)


## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Production

```bash
npm run start
```

### End-to-end Testing (Playwright)

Abyss Engine relies on WebGPU rendering in the study flow, so E2E execution is split between local and CI-safe profiles.

```bash
# Install browser binaries + dependencies (required in CI or fresh environments)
npm run test:e2e:install

# Local headed run (default developer workflow)
npm run test:e2e:headful

# Local headless WebGPU run
PW_WEBGPU_FLAGS="--enable-unsafe-webgpu" npm run test:e2e:headless

# CI-style run (headless + retries, single worker)
npm run test:e2e:ci
```

#### Environment switches for constrained environments

- `PW_WEBGPU_FLAGS`  
  Override Chromium WebGPU launch flags used in CI (comma-separated list).  
  Example: `PW_WEBGPU_FLAGS="--enable-unsafe-webgpu,--use-angle=swiftshader"` (useful for workaround testing).

- `PW_WEBGPU_HEADFUL_ARGS`  
  Override launch arguments for the local headed project.

- `PW_WEBGPU_FALLBACK_FLAGS`  
  Add fallback flags appended to the default CI defaults.

- `PW_PLAYWRIGHT_SKIP_BROWSER_RUN=true`  
  Skip test execution without opening a browser. Useful in blocked agent sandboxes for smoke-style local validation only.

- `PW_CI_LOCAL_BINARY=<path-to-playwright-browser-cache>`  
  Point Playwright at a preinstalled shared browser cache in restricted environments (`PLAYWRIGHT_BROWSERS_PATH` override).

- `PW_ENABLE_NO_SANDBOX=1`  
  Force `--no-sandbox` for environments that cannot initialize Chromium sandboxing.

#### Typical execution paths

- Local development (headed): `npm run test:e2e:headful`  
- Local headless quick check: `npm run test:e2e:headless`  
- CI/sandbox headless: `npm run test:e2e:ci`  
- Boot-only smoke check: `npm run test:e2e:smoke`  
- Skip browser mode in unsupported sandboxes: `PW_PLAYWRIGHT_SKIP_BROWSER_RUN=true npm run test:e2e`

For Cursor/Claude-style sandboxes where the browser binary cannot be downloaded or headless display is blocked, execute the same command set from a host/dev container that has full network access and copy the generated `test:e2e:prepare` cache into `PW_CI_LOCAL_BINARY`.

#### Suggested validation matrix

- Smoke check: `tests/boot.spec.ts` on `chromium-headless-ci`
- Focused challenge matrix: `tests/study-session.spec.ts` on `chromium-headless-ci`
- Full E2E pass: `npm run test:e2e:ci`

Artifacts after CI runs are available under:
- `playwright-report/`
- `playwright-results/`
