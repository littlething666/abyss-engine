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
