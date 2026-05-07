# Abyss Engine

## Overview

Abyss Engine is a **beautiful, immersive spaced-repetition learning platform** built as a 3D crystal garden.
*Your knowledge literally grows as glowing crystals in a mystical abyss.*
Goal is to make process of studying difficult topics easygoing and rewarding by encoding architecture design and domain expertise into a practical and engaging learning system.

## Development Philosophy


### Minimalist Approach

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
- **3D Rendering**: React Three Fiber (v10), @react-three/drei, Three.js 0.183
- **State Management**: Zustand
- **Server State/Data Fetching**: TanStack Query (React Query)
- **Styling**: Tailwind CSS 4
- **Testing**: Vitest (unit) and Playwright (E2E)


## Getting Started

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Durable Backend Infrastructure

Phase 4 targets a Cloudflare-native durable backend:

- **Workflows** own durable generation execution.
- **D1** owns queryable run/job/event/artifact metadata, usage counters, and Learning Content Store rows.
- **R2** owns generated artifact JSON, stage checkpoints, raw model outputs, and replay/debug bundles.
- **Durable Objects** are optional coordination infrastructure only, used later if strict per-device locking or live fanout becomes necessary.

The app is unreleased, so development data can be reset destructively. Reset D1
from `backend/d1/reset.sql`, re-apply `backend/d1/init.sql`, and clear the R2
bucket when you need a fully cache-free generation run.

### Build

```bash
pnpm build
```

### Production

```bash
pnpm serve
```
