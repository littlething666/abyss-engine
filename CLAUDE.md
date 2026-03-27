# CLAUDE.md

## Scope
Authoritative reference for repository architecture and agent workflows. Codebase contradictions to this document must be resolved in favor of this document.

## Project Vision

Abyss Engine is a **beautiful, immersive spaced-repetition learning platform** built as a 3D crystal garden.
Core fantasy: *Your knowledge literally grows as glowing crystals in a mystical abyss.*

Core stack: @react-three/fiber@10.0.0-alpha.x, @react-three/drei@11.0.0-alpha.x, three@0.183.x, WebGPU (Three.js Shading Language), TanStack Query, Zustand, Tailwind, motion.
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
- **Renderer Initialization**: The standard `<Canvas>` import from `@react-three/fiber` is strictly prohibited. You must import `<Canvas>` exclusively from `@react-three/fiber/webgpu` to natively initialize the asynchronous `WebGPURenderer`. Manual `gl` prop instantiation of the WebGPU renderer is deprecated.
- **State API Refactoring**: The `state.gl` property is deprecated in R3F v10. Access the renderer exclusively via `state.renderer` across all components and `useFrame` hooks.
- **Drei Component Import Paths**: The root `@react-three/drei` entry point is forbidden, as it defaults to legacy WebGL implementations. All Drei components must be imported via their dedicated WebGPU entry points (e.g., `@react-three/drei/webgpu`).
- **Drei Component Fallbacks**: If a specific Drei utility lacks a WebGPU entry point in v11, its usage is prohibited. You must reconstruct the required functionality from scratch using Three.js Shading Language (TSL) and Node Materials.
- **Materials & TSL**: Legacy materials (`MeshStandardMaterial`, `ShaderMaterial`, etc.) and raw GLSL strings are strictly prohibited. Use Node Materials (`MeshStandardNodeMaterial`) and Three.js Shading Language (TSL) exclusively. Bind uniforms and manage state-driven material updates using R3F v10's native WebGPU hooks: `useNodes`, `useLocalNodes`, and `useUniforms`.
- **Post-Processing & Pipelines**: The `@react-three/postprocessing` library and `EffectComposer` are forbidden. Implement post-processing using native WebGPU nodes and the R3F v10 `usePostProcessing` hook. Use the `RenderPipeline` API (Three r182+) instead of the deprecated `PostProcessing` API. Replace `WebGLCubeRenderTarget` with `CubeRenderTarget`. Apply additive blending for Screen Space Reflections (SSR) instead of `blendColor()`.
- **Lifecycle & Timers**: `THREE.Clock` is deprecated. Implement all timing logic using `THREE.Timer`. Leverage the R3F v10 standalone scheduler to decouple frame loops and execute them outside the `<Canvas>` tree for UI synchronization when necessary.
- **Lighting & Scene Graph**: Cameras are automatically attached to the scene graph; do not manually attach objects to cameras. WebGPU shadow precision requires decreasing or removing legacy WebGL shadow biases. Recalibrate exposures if using `RoomEnvironment` (PMREM positioning changed) or `Sky`/`SkyMesh` (legacy gamma removed).

## Mandatory Project Rules
- **Data-Driven Execution**: No magic strings. No manual state mapping.
- **No Legacy Burden**: Deprecated behavior must be refactored or removed. Do not preserve dead code.
- **WebGPU Strictness**: Any pull request or code generation that introduces a legacy WebGL material, `WebGLRenderer`, `state.gl`, `THREE.Clock`, or non-TSL shader string into the codebase will be rejected.
- **Mobile-first UI**: Design for small screens and touch as the baseline. Tappable targets must meet comfortable touch sizing and spacing. Do not rely on hover, :hover-only styling, or cursor affordances (cursor-pointer, group-hover:*, tooltips that only appear on hover) to communicate interactivity; use always-visible labels, icons, borders, or other persistent cues. Pointer hover may refine appearance only if the default (non-hover) state is already clearly interactive.
- **UI Composition**: Build 2D UI only from existing `src/components/ui/*` primitives. Do not add or modify files in this directory unless explicitly instructed to do so with mention of the filename in request.

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
Every agent response proposing code modifications must preface the technical implementation with an **Architectural Optimization Proposal** containing:
1. **Optimized Design Rationale**: A technical justification for the selected architectural approach, detailing how the proposed structure enhances system scalability, maintainability, or performance relative to current constraints.
2. **Structural Integration Strategy**: Specification of the architectural patterns and boundary enforcement mechanisms utilized to ensure seamless integration with the existing codebase.

This file is authoritative.
If something in the codebase contradicts CLAUDE.md, the codebase is wrong.
Welcome, agent.
Let’s build the most beautiful learning garden in existence. 🌌
