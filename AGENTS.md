# AGENTS.md

## Scope
Authoritative reference for repository architecture and agent workflows. Codebase contradictions to this document must be resolved in favor of this document.

## Project Vision

Abyss Engine is a **beautiful, immersive spaced-repetition learning platform** built as a 3D crystal garden.
Core fantasy: *Your knowledge literally grows as glowing crystals in a mystical abyss.*

Core stack: React Three Fiber 10+, Drei 11+, WebGPU (Three.js Shading Language), TanStack Query, Zustand, Tailwind, motion.
Core systems: SM-2 progression, ritual-based attunement, buff engine, procedural node-based graphics.

## Architectural Patterns

### 1. Feature-Sliced Modules
- **Rule**: Domain/application modules that encode game-learning behavior must reside exclusively in `src/features/<feature>/`.
- **Boundary Enforcement**: Modules communicate strictly through public APIs defined in `index.ts`. Cross-feature deep imports are prohibited.
- **Dependency Flow**: Features may depend on `infrastructure` and `types`. Unidirectional coupling (feature -> infrastructure/types) is mandatory. Cross-feature coupling must be documented.

### 2. Strict Layered Architecture
- **Types (`src/types`)**: Data contracts and interface shapes. Zero framework or runtime logic.
- **Presentation (`src/components`)**: Rendering and UI event orchestration. Prohibited from owning primary business rules.
- **Features (`src/features`)**: Domain/application modules. This includes **procedural generation models** (mathematical algorithms mapping SM-2 progression to physical growth parameters).
- **Graphics & Rendering (`src/graphics`)**: WebGPU pipelines, TSL node materials, compute shaders, and post-processing effect chains. This layer translates data-driven growth parameters into visual outputs.
- **Composition (`src/hooks`)**: State and query wiring. Prohibited from containing rule-bearing business logic.
- **Infrastructure (`src/infrastructure`)**: External boundaries (I/O, storage, network adapters, realtime wiring).

### 3. Repository Pattern & Data Access
- **Rule**: Direct remote I/O (e.g., `fetch`) is strictly prohibited in domain and component files.
- **Implementation**: Contracts must be defined in `src/types/repository.ts`. Concrete implementations must remain isolated in `src/infrastructure/repositories/*`.
- **Query Orchestration**: Content reads must execute through repository-backed query helpers. Runtime environment decisions (URLs, stale policies, retry behavior) are managed via infrastructure hooks, not domain modules.

### 4. Data-Driven Engine Pattern (Buff System)
- **Separation of Concerns**:
  - `buffDefinitions.ts`: Static configuration and entity definition (what exists).
  - `buffEngine.ts`: Core runtime rules and logic (how it behaves).
  - `buffDisplay.ts`: Presentation mapping (how it looks).
  - `progressionStore.ts`: Lifecycle and state management (when it triggers).

### 5. WebGPU & Mobile-First Graphics Engine
- **Hardware Target**: The application targets flagship mobile hardware exclusively. WebGL fallback support is strictly prohibited.
- **Renderer Initialization**: All Three.js imports must utilize `three/webgpu`. The R3F `<Canvas>` must utilize the asynchronous `WebGPURenderer`.
- **Material Constraints**: Legacy materials (e.g., `MeshStandardMaterial`) are prohibited. All surface rendering must utilize Node materials (e.g., `MeshStandardNodeMaterial`).
- **Procedural Logic & Compute**: Heavy procedural logic (crystal growth, particle physics) must be offloaded to WebGPU compute shaders or TSL.
- **Main-Thread Isolation**: Animations and procedural scaling must not be bound to React state (`useState`, `setState`). Drive continuous graphical updates directly via TSL uniforms, `useNodes`, or isolated `useFrame` loops.
- **Post-Processing**: Glowing crystals and atmospheric effects must be implemented via TSL node composition. Usage of `EffectComposer` is forbidden.

## Mandatory Project Rules
- **Data-Driven Execution**: No magic strings. No manual state mapping.
- **No Legacy Burden**: Deprecated behavior must be refactored or removed. Do not preserve dead code.

## Agent Workflow & Decision Framework
Agents must execute the following structured decision process before outputting code modifications to force planned, architectural alignment.

### I. Architectural Alignment Assessment
Before generating code, the agent must evaluate the request against the architecture:
1. **Target Pattern Identification**: Define which architectural pattern governs the proposed change.
2. **Boundary Verification**: Confirm the proposed change maintains Feature-Sliced Modules and Layered Architecture boundaries.
3. **State Strategy**: Validate state modifications. Prefer existing Zustand actions. Introduce new global state patterns only with explicit architectural justification.

### II. Implementation & Testing Execution
1. Identify affected execution paths.
2. Locate and update existing related tests (`src/**/*.test.ts` for unit, `tests/` for e2e) before writing implementation code.
3. Provide necessary unit or e2e tests for new feature paths.

### III. Mandatory Collaboration Output
Every agent response proposing code changes must begin with an **Architecture Alignment Plan** containing:
1. **Misalignment Risk**: A concise list of potential conflicts between the requested change and current architecture.
2. **Implementation Strategy**: The selected architectural pattern and boundary defense strategy.
3. **Optimization**: Better architectural options if the user's initial request violates system design.

This file is authoritative.
If something in the codebase contradicts AGENTS.md, the codebase is wrong.
Welcome, agent.
Let’s build the most beautiful learning garden in existence. 🌌
