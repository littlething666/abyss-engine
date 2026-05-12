# AGENTS.md

## Scope

AGENTS.md is a living coordination guide for repository architecture, agent workflow, and project-specific constraints.
It is not an immutable source of truth during active refactors.
Agents must not blindly force the codebase to match this file when there is evidence that this file is stale. When AGENTS.md conflicts with the current repository, tests, package versions, ADRs, README, docs, or the user's explicit task, the agent must surface the contradiction instead of silently preserving either side.
For unreleased or refactor-heavy areas, prefer the current intended architecture over backward compatibility with obsolete implementation patterns.
Do not preserve old architecture merely because it is described here. If an instruction appears stale, name it, explain the evidence, and recommend whether AGENTS.md, the code, or another doc should be updated.

## Source-of-Truth Precedence

When sources conflict, use this order:

1. The user's explicit instruction in the current task.
2. Current code, tests, package.json, and runtime behavior.
3. Current ADRs or docs explicitly marked as active.
4. AGENTS.md architectural intent.
5. Older docs, comments, TODOs, and stale implementation patterns.

If this ordering produces uncertainty, agents must report the uncertainty rather than guessing.

## Documentation Drift & Misalignment Protocol

Before making non-trivial code changes, agents must check whether the requested change is governed by AGENTS.md, README, docs/, ADRs, package.json, tests, or existing implementation patterns.
If AGENTS.md conflicts with other repository evidence, the agent must include a concise **Docs vs AGENTS.md Misalignment** note before or within the final response.
The note must include:
1. **Conflicting instruction** — the specific AGENTS.md rule that may be stale.
2. **Conflicting evidence** — the file, docs, tests, package version, or implementation pattern that disagrees.
3. **Risk** — how following the stale instruction could preserve obsolete architecture, introduce mixed old/new patterns, or block the refactor.
4. **Recommendation** — whether to update AGENTS.md, update other docs, modify code, or ask for architectural clarification.
Agents must not create compatibility layers, duplicate abstractions, fallback branches, or hybrid old/new architecture to satisfy conflicting instructions unless explicitly requested.

## Project Vision

Abyss Engine is a **beautiful, immersive spaced-repetition learning platform** built as a 3D crystal garden.
Core fantasy: *Your knowledge literally grows as glowing crystals in a mystical abyss.*

Core stack: @react-three/fiber@10.0.0-alpha.x, @react-three/drei@11.0.0-alpha.x, three@0.183.x, WebGPU (Three.js Shading Language), TanStack Query, Zustand, Tailwind, motion.
Core systems: SM-2 progression, ritual-based attunement, buff engine, procedural node-based graphics.

## Architectural Patterns

### 1. Feature-Sliced Modules
- **Rule**: Domain/application modules that encode game-learning behavior must reside exclusively in `src/features/<feature>/`.
- **Boundary Enforcement**: Modules communicate strictly through public APIs defined in `index.ts`. Cross-feature deep imports are prohibited.
- **Dependency Flow**: Features depend on `types` and explicit contracts, not concrete infrastructure adapters. Any infrastructure seam a feature touches must be narrow, documented, and exposed through the feature's public `index.ts`; adapter details stay in infrastructure or composition roots.
- **Composition Root Exceptions**: Composition roots that intentionally wire infrastructure to features must be documented and narrow. Before adding to or depending on a named exception, verify that the file still exists and remains the current architecture. If AGENTS.md names an obsolete composition root, report the drift and do not recreate it merely for compliance.

### 2. Module Depth
- **Deep modules are encouraged**: a module hides substantial behavior, invariants, ordering, and error handling behind a small public interface.
- **Deep imports are forbidden**: this is unrelated to module depth. Do not bypass a feature's public `index.ts` seam.
- Public `index.ts` exports must be deliberate interfaces, not automatic barrels. Prefer fewer exports with more leverage.
- Before adding a module, run the deletion test: if deleting it only removes indirection, do not add it; if deleting it would spread behavior across callers, the module is earning its depth.
- Tests should exercise behavior through the module interface. Keep internal seams internal and do not widen a public interface only for tests.

### 3. Strict Layered Architecture
- **Types (`src/types`)**: Data contracts and interface shapes. Zero framework or runtime logic.
- **Presentation (`src/components`)**: Rendering and UI event orchestration. Prohibited from owning primary business rules.
- **Features (`src/features`)**: Domain/application modules. This includes **procedural generation models** (mathematical algorithms mapping SM-2 progression to physical growth parameters).
- **Graphics & Rendering (`src/graphics`)**: WebGPU pipelines, TSL node materials, compute shaders, and post-processing effect chains. This layer translates data-driven growth parameters into visual outputs.
- **Composition (`src/hooks`)**: State and query wiring. Prohibited from containing rule-bearing business logic.
- **Infrastructure (`src/infrastructure`)**: External boundaries (I/O, storage, network adapters, realtime wiring). The typed app event bus (`eventBus.ts`) lives here; handler wiring (`eventBusHandlers.ts`) uses the feature-import exception documented under Feature-Sliced Modules.

### 4. Repository Pattern & Data Access
- **Rule**: Direct remote I/O (e.g., `fetch`) is strictly prohibited in domain and component files.
- **Implementation**: Contracts must be defined in `src/types/repository.ts`. Concrete implementations must remain isolated in `src/infrastructure/repositories/*`.
- **Query Orchestration**: Content reads must execute through repository-backed query helpers. Runtime environment decisions (URLs, stale policies, retry behavior) are managed via infrastructure hooks, not domain modules.

### 5. Data-Driven Engine Pattern

Data-driven systems should separate:
- static definitions,
- runtime rules,
- presentation mapping,
- lifecycle/state orchestration.

Concrete file names in this section are examples of the intended separation, not a mandate to preserve obsolete module names. Verify current feature structure before extending or refactoring.

### 6. WebGPU & Mobile-First Graphics Engine
- **Renderer Initialization**: The standard `<Canvas>` import from `@react-three/fiber` is strictly prohibited. You must import `<Canvas>` exclusively from `@react-three/fiber/webgpu` to natively initialize the asynchronous `WebGPURenderer`. Manual `gl` prop instantiation of the WebGPU renderer is deprecated.
- **State API Refactoring**: The `state.gl` property is deprecated in R3F v10. Access the renderer exclusively via `state.renderer` across all components and `useFrame` hooks.
- **Drei Component Import Paths**: The root `@react-three/drei` entry point is forbidden, as it defaults to legacy WebGL implementations. All Drei components must be imported via their dedicated WebGPU entry points (e.g., `@react-three/drei/webgpu`).
- **Drei Component Fallbacks**: If a specific Drei utility lacks a WebGPU entry point in v11, its usage is prohibited. You must reconstruct the required functionality from scratch using Three.js Shading Language (TSL) and Node Materials.
- **Materials & TSL**: Legacy materials (`MeshStandardMaterial`, `ShaderMaterial`, etc.) and raw GLSL strings are strictly prohibited. Use Node Materials (`MeshStandardNodeMaterial`) and Three.js Shading Language (TSL) exclusively. Bind uniforms and manage state-driven material updates using R3F v10's native WebGPU hooks: `useNodes`, `useLocalNodes`, and `useUniforms`.
- **Post-Processing & Pipelines**: The `@react-three/postprocessing` library and `EffectComposer` are forbidden. Implement post-processing using native WebGPU nodes and the R3F v10 `usePostProcessing` hook. Use the `RenderPipeline` API (Three r183+) instead of the deprecated `PostProcessing` API. Replace `WebGLCubeRenderTarget` with `CubeRenderTarget`. Apply additive blending for Screen Space Reflections (SSR) instead of `blendColor()`.
- **Lifecycle & Timers**: `THREE.Clock` is deprecated. Implement all timing logic using `THREE.Timer`. Leverage the R3F v10 standalone scheduler to decouple frame loops and execute them outside the `<Canvas>` tree for UI synchronization when necessary.
- **Lighting & Scene Graph**: Cameras are automatically attached to the scene graph; do not manually attach objects to cameras. WebGPU shadow precision requires decreasing or removing legacy WebGL shadow biases. Recalibrate exposures if using `RoomEnvironment` (PMREM positioning changed) or `Sky`/`SkyMesh` (legacy gamma removed).

## Mandatory Project Rules
- **Prioritize Strategic Programming over Tactical fixes.** You are strictly forbidden from implementing 'Workarounds,' 'Kludges,' 'Band-aids,' or 'Stopgaps' that introduce Architectural Erosion (e.g., leaking abstractions, breaking encapsulation, or creating brittle error handling) without my explicit consent.
  - **Standard Operating Procedure:**
    - Root Cause over Symptom: If a component (e.g., an external API, a module, or a model) produces invalid or unexpected output, do not write 'defensive' fallback logic or multiple parsers to 'clean' the data.
    - Explicit Failure: Instead of masking errors with soft-handling, write code that throws a hard, descriptive error at the boundary.
    - Upstream Mitigation: Your primary solution must address the source of the failure (e.g., fixing configuration, adjusting parameters, or correcting the upstream logic) rather than accommodating the failure downstream.
  - **Prefer deterministic execution over probabilistic "recovery."** Treat ambiguity, flakiness, and non-reproducibility as defects to eliminate at the source—not as signals to add more branches, retries, or heuristics.
  - **Do not punch holes and use defensive strategies.** Always prioritize resolving the root cause of the problem, not creating a workaround that hides the problem.
- **Data-Driven Execution**: No magic strings. No manual state mapping.
- **Breaking Refactor Mode**: The app is unreleased. When a task is part of a breaking refactor, agents should prefer clean replacement over backward compatibility. Do not maintain old architecture, duplicate adapters, compatibility wrappers, fallback branches, or mixed old/new execution paths unless explicitly requested. If existing docs or AGENTS.md describe the old architecture, call out the stale instruction and recommend updating or deleting it.
- **No Legacy Burden**: Deprecated behavior and obsolete architecture should be removed, not supported through compatibility layers. During breaking refactors, do not preserve old architecture because it appears in stale docs or AGENTS.md. Surface the mismatch and recommend deletion, migration, or doc updates.
- **WebGPU Strictness**: Any pull request or code generation that introduces a legacy WebGL material, `WebGLRenderer`, `state.gl`, `THREE.Clock`, or non-TSL shader string into the codebase will be rejected.
- **Mobile-first UI**: Design for small screens and touch as the baseline. Tappable targets must meet comfortable touch sizing and spacing. Do not rely on hover, :hover-only styling, or cursor affordances (cursor-pointer, group-hover:*, tooltips that only appear on hover) to communicate interactivity; use always-visible labels, icons, borders, or other persistent cues. Pointer hover may refine appearance only if the default (non-hover) state is already clearly interactive.
- **UI Composition**: Build 2D UI only from existing `src/components/ui/*` primitives. Do not add or modify files in this directory unless explicitly instructed to do so with mention of the filename in request.
- **Analytics SDK isolation**: The `posthog-js` SDK is permitted only inside `src/infrastructure/posthog/*`. The single bootstrap entry point is `bootstrapPosthog()`, invoked from the project-root `instrumentation-client.ts`; the `__abyssPosthogBootstrapped` global guard makes it idempotent. Feature code communicates with analytics via the typed app-bus event `player-profile:updated` (and, post-Phase 2, the telemetry subscription API); feature code must never import `posthog-js` directly nor learn analytics deployment details (`appVersion`, `buildMode`, analytics timestamps), which are owned by the PostHog adapter. Disabled-mode contract: a null resolved config (no `NEXT_PUBLIC_POSTHOG_TOKEN`, querystring `?abyss-analytics=off`, `localStorage['abyss-analytics-disabled']='1'`, or browser hostname on localhost / IPv4 loopback) keeps the SDK uninitialized end-to-end. Session-replay posture: `recordCanvas: false` (the WebGPU canvas is never recorded); autocapture is allowlist-only (`click` / `submit` / `change`; `button` / `a` / `input` / `[role="button"]`); broadening either allowlist requires architectural review.

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

### III. Collaboration Output
For non-trivial code modifications, include a concise **Compliance, Risk & Drift Assessment** before implementation or in the final summary:

1. **Docs vs AGENTS.md Misalignment Check**:
   - Name material contradictions between AGENTS.md, current code, tests, README, docs/, ADRs, package versions, or the user's request.
   - If AGENTS.md appears stale, say so explicitly.
   - Do not force implementation toward AGENTS.md when doing so would preserve outdated architecture.
   - If no material mismatch was found, say that no material mismatch was found.
2. **Architectural Risk Highlight**: Rate meaningful risks and give mitigations when the change affects seams, layering, data access, WebGPU, mobile UI, or long-term maintainability.
3. **Prompt Drift Prevention**:
   Call out any pattern that could normalize workarounds, legacy compatibility layers, mixed old/new architecture, shallow pass-through modules, magic strings, probabilistic recovery, or stale AGENTS.md compliance.

This file expresses the intended architecture, but it may lag behind active refactors.
When AGENTS.md, docs, tests, package versions, or implementation disagree, agents must report the misalignment and avoid cementing stale architecture.
Prefer removing obsolete patterns over supporting both old and new architectures.
