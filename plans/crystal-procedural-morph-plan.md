# Crystal Procedural Mesh Morph — Implementation Plan

> Replaces the current static-geometry + scale-tween crystal system with a unified TSL-driven procedural morph pipeline.  
> Crystals evolve from dull matte stone (level 0) to radiant transmissive gems (level 5) via GPU vertex displacement, material interpolation, and theatrical level-up ceremonies.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 0 — Preparation & Cleanup](#2-phase-0--preparation--cleanup)
3. [Phase 1 — Unified Base Geometry & Instanced Rendering](#3-phase-1--unified-base-geometry--instanced-rendering)
4. [Phase 2 — TSL Vertex Displacement](#4-phase-2--tsl-vertex-displacement)
5. [Phase 3 — Material Evolution Pipeline](#5-phase-3--material-evolution-pipeline)
6. [Phase 4 — Attached Crystal Branches](#6-phase-4--attached-crystal-branches)
7. [Phase 5 — Ground-Projected Glow Decal](#7-phase-5--ground-projected-glow-decal)
8. [Phase 6 — Level-Up Transition Ceremony](#8-phase-6--level-up-transition-ceremony)
9. [Phase 7 — Bloom Post-Processing Integration](#9-phase-7--bloom-post-processing-integration)
10. [Phase 8 — Particle System Upgrade](#10-phase-8--particle-system-upgrade)
11. [Files Changed Summary](#11-files-changed-summary)
12. [Performance Budget](#12-performance-budget)
13. [Test Plan](#13-test-plan)

---

## 1. Architecture Overview

### Architectural Optimization Proposal

**Optimized Design Rationale**: The current system renders each crystal as 4 independent meshes (outer hull, inner sphere, level indicator sphere, billboard glow ring) with per-component React state, `useMemo` material recreation on every color/selection change, and per-crystal `useFrame` callbacks. This creates O(n) draw calls, O(n) `useFrame` subscriptions, and O(n) material instances that cannot be batched. The new system consolidates all crystals into a single `InstancedMesh` with one shared `MeshPhysicalNodeMaterial` whose TSL node graph reads per-instance attributes (level, morph progress, subject seed, selection flag) to procedurally generate all visual variation on the GPU. This collapses draw calls to 1 (+ 1 for branch clusters), eliminates per-crystal `useMemo` material allocation, and moves all animation (displacement, color evolution, selection glow) into the vertex/fragment shader where it runs in parallel.

**Structural Integration Strategy**: New procedural graphics code lives in `src/graphics/crystals/` (graphics layer per CLAUDE.md §2). The `crystalMorphModel.ts` growth parameter model lives in `src/features/progression/visualization/` (feature layer). The `Crystals.tsx` component is rewritten to be a thin orchestrator that maps `ActiveCrystal[]` + progression data into instance attribute buffers and manages the ceremony state machine. No cross-feature imports are introduced.

### System Diagram

```
ActiveCrystal[] + progressionStore
        │
        ▼
┌─────────────────────────────────────────────┐
│ src/features/progression/visualization/     │
│   crystalMorphModel.ts                      │
│   ─ Maps (level, xp, morphProgress) to      │
│     displacement amplitude, noise params,   │
│     material tier properties                │
│   crystalScale.ts (kept, unchanged)         │
└────────────────────┬────────────────────────┘
                     │ CrystalMorphParams per instance
                     ▼
┌─────────────────────────────────────────────┐
│ src/graphics/crystals/                      │
│   crystalGeometry.ts     ─ shared icosahedron│
│   crystalMaterial.ts     ─ MeshPhysicalNode  │
│     └─ TSL node graph: displacement +        │
│        material interpolation + fresnel     │
│   crystalBranches.ts     ─ branch clusters   │
│   crystalDecal.ts        ─ ground glow SDF   │
│   crystalCeremony.ts     ─ level-up FX state │
│   index.ts               ─ public barrel     │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│ src/components/Crystals.tsx (rewritten)      │
│   ─ Single InstancedMesh orchestrator       │
│   ─ Instance attribute buffer management    │
│   ─ Ceremony trigger + deferred playback    │
│   ─ Label visibility (kept)                 │
└─────────────────────────────────────────────┘
```

### Decisions Summary

| Decision | Choice |
|----------|--------|
| Base geometry | Unified `IcosahedronGeometry(0.3, 4)` — ~2562 vertices, shared across all subjects |
| Subject differentiation | Color palette + emission profile + unique noise seed/frequency via per-instance attributes |
| Displacement style | Hybrid: low-freq simplex (levels 1-2), high-freq quantized cellular/Voronoi (levels 3-5) |
| Material evolution | Level 0 opaque stone → Level 5 transmissive glass gem via `MeshPhysicalNodeMaterial` |
| Sub-crystals | Attached branches via thresholded noise peaks in vertex shader (no orbiting satellites) |
| Inner core | Removed. Single-shell `MeshPhysicalNodeMaterial` with transmission + thickness + depth emissive |
| Glow ring | Replaced with ground-projected SDF decal, intensity/radius scales with level |
| Selection state | Fresnel emission uniform boost + decal emissive pulse |
| Level-up ceremony | 1.5s theatrical morph, emissive flash, shockwave particle ring, decal pulse. No camera movement |
| Levels | 6 tiers (0-5), linear scale `0.6 + level * 0.15` (unchanged) |
| Bloom | Re-enabled. Level-proportional bloom contribution, ceremony spike |
| Rendering | `InstancedMesh`, target ≤20 crystals at 30fps on high-range mobile |

---

## 2. Phase 0 — Preparation & Cleanup

**Goal**: Remove dead code and legacy geometry infrastructure that the new system replaces.

### 2.1 Delete Obsolete Crystal Geometry Factories

**File**: `src/utils/geometryMapping.ts`

Remove the `crystalGeometryFactories` map and the five crystal-specific factory functions (`createBoxGeometry`, `createCylinderGeometry`, `createSphereGeometry`, `createOctahedronGeometry`, `createPlaneGeometry`). Keep `gridGeometryFactories` and grid factory functions (grid tiles are not changing). Keep `useSubjectColor`, `getSubjectColor*` functions (still needed for per-instance color). Remove `useSubjectGeometry` hook's `'crystal'` path — the new system does not use per-subject geometry for crystals. The `'altar'` and `'gridTile'` paths remain.

Remove the `GeometryType` usage for crystals from `SubjectGeometry` in `src/types/core.ts` — but keep the `crystal` field on the type for backwards compatibility with persisted manifest data. It will simply be ignored by the rendering system.

### 2.2 Remove Legacy Crystal Sub-Meshes

The following module-level geometry allocations in `Crystals.tsx` will be removed entirely:

```
crystalInnerGeometry  (SphereGeometry 0.15)
levelIndicatorGeometry (SphereGeometry 0.08)
glowRingGeometry       (RingGeometry 0.35-0.55)
```

Along with their corresponding materials: `innerMaterial`, `levelMaterial`, `glowMaterial`.

### 2.3 Register `MeshPhysicalNodeMaterial`

**File**: `src/graphics/nodeMaterialRegistration.ts`

Add `MeshPhysicalNodeMaterial` to the `extend()` call so it can be used in JSX if needed:

```typescript
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, MeshPhysicalNodeMaterial } from 'three/webgpu';
extend({ MeshBasicNodeMaterial, MeshStandardNodeMaterial, MeshPhysicalNodeMaterial });
```

### 2.4 Update Barrel Exports

Ensure `src/graphics/crystals/index.ts` is created and exported from `src/graphics/` if a graphics barrel exists.

---

## 3. Phase 1 — Unified Base Geometry & Instanced Rendering

### 3.1 Shared Geometry

**New file**: `src/graphics/crystals/crystalGeometry.ts`

```typescript
import * as THREE from 'three/webgpu';

const CRYSTAL_ICOSAHEDRON_RADIUS = 0.3;
const CRYSTAL_ICOSAHEDRON_DETAIL = 4; // ~2562 vertices

let sharedGeometry: THREE.IcosahedronGeometry | null = null;

export function getCrystalGeometry(): THREE.IcosahedronGeometry {
  if (!sharedGeometry) {
    sharedGeometry = new THREE.IcosahedronGeometry(
      CRYSTAL_ICOSAHEDRON_RADIUS,
      CRYSTAL_ICOSAHEDRON_DETAIL,
    );
  }
  return sharedGeometry;
}

export function disposeCrystalGeometry(): void {
  sharedGeometry?.dispose();
  sharedGeometry = null;
}

export { CRYSTAL_ICOSAHEDRON_RADIUS, CRYSTAL_ICOSAHEDRON_DETAIL };
```

An `IcosahedronGeometry` at detail 4 produces 2562 vertices — within the ~500-vertex displacement budget per crystal when accounting for instancing (the GPU evaluates the vertex shader per-instance-vertex, but the geometry buffer is shared once in VRAM).

### 3.2 Instance Attribute Schema

Each crystal instance needs the following per-instance data, packed into `InstancedBufferAttribute`s:

| Attribute | Type | Components | Description |
|-----------|------|------------|-------------|
| `instanceLevel` | `float` | 1 | Current discrete level (0-5) |
| `instanceMorphProgress` | `float` | 1 | 0.0-1.0, animated during level-up ceremony |
| `instanceSubjectSeed` | `float` | 1 | Deterministic hash of `subjectId`, drives noise frequency/offset |
| `instanceColor` | `vec3` | 3 | Subject base color (RGB) |
| `instanceSelected` | `float` | 1 | 0.0 or 1.0, selection state |
| `instanceCeremonyPhase` | `float` | 1 | 0.0 = idle, >0.0 = ceremony progress (0.0-1.0) |

Total: 8 floats per instance = 32 bytes per instance. At 20 crystals = 640 bytes.

### 3.3 InstancedMesh Setup

**New file**: `src/graphics/crystals/crystalInstances.ts`

This module manages the `InstancedMesh` lifecycle:

- Creates `InstancedMesh` with shared geometry + shared material
- Allocates `InstancedBufferAttribute` arrays at a fixed max capacity (e.g. 64 instances)
- Exposes `updateInstanceData(index, params)` to write per-instance attributes
- Exposes `setInstanceCount(count)` to set visible instance count
- Per-instance world transform is set via `InstancedMesh.setMatrixAt(index, matrix)` using position from `ActiveCrystal.gridPosition` and scale from `getCrystalScale(level)`

The `Crystals.tsx` component will use this module rather than mapping over `crystals.map(...)` to render individual `<mesh>` elements.

### 3.4 Rewritten Crystals Component Structure

`src/components/Crystals.tsx` becomes:

```
<group>
  {/* Single InstancedMesh for all crystal hulls */}
  <instancedMesh ref={instancedRef} args={[geometry, material, MAX_INSTANCES]} />

  {/* Single InstancedMesh for branch clusters (Phase 4) */}
  <instancedMesh ref={branchesRef} args={[branchGeometry, branchMaterial, MAX_BRANCHES]} />

  {/* Ground decal mesh (Phase 5) */}
  <mesh ref={decalRef} ... />

  {/* GrowthParticles — shared pool, positioned per ceremony */}
  <GrowthParticles ref={particlesRef} ... />

  {/* Labels — kept as Html overlay, driven by existing label visibility system */}
  {visibleLabels.map(...)}
</group>
```

The per-crystal `useFrame` callback is consolidated into a single `useFrame` on the parent `Crystals` component that iterates the instance buffer and updates attributes.

---

## 4. Phase 2 — TSL Vertex Displacement

### 4.1 Growth Parameter Model

**New file**: `src/features/progression/visualization/crystalMorphModel.ts`

Pure data model (no Three.js imports) that maps level + morphProgress to displacement parameters:

```typescript
export interface CrystalDisplacementParams {
  /** Low-frequency noise amplitude (organic swelling). Levels 0-2. */
  lowFreqAmplitude: number;
  /** Low-frequency noise frequency. */
  lowFreqScale: number;
  /** High-frequency cellular noise amplitude (crystalline facets). Levels 3-5. */
  highFreqAmplitude: number;
  /** High-frequency noise frequency. */
  highFreqScale: number;
  /** Quantization step for cellular displacement (0 = smooth, higher = more faceted). */
  quantizationStep: number;
  /** Overall displacement multiplier during morph transition. */
  morphEnvelope: number;
}

export interface CrystalMaterialParams {
  /** 0.0 = fully opaque stone, 1.0 = fully transmissive glass. */
  transmissionFactor: number;
  /** Index of refraction. Stone ~1.0, glass ~1.5. */
  ior: number;
  /** Material thickness for transmission volume. */
  thickness: number;
  /** Roughness: 1.0 (stone) -> 0.05 (polished gem). */
  roughness: number;
  /** Metalness: 0.0 throughout (dielectric crystals). */
  metalness: number;
  /** Emissive intensity multiplier. */
  emissiveIntensity: number;
  /** Dispersion amount (rainbow refraction). 0 at low levels. */
  dispersion: number;
  /** Fresnel emission power (silhouette glow). */
  fresnelPower: number;
  /** Fresnel emission intensity. */
  fresnelIntensity: number;
}
```

**Tier mapping table** — the `getDisplacementParams(level, morphProgress)` function returns:

| Level | lowFreqAmp | lowFreqScale | highFreqAmp | highFreqScale | quantStep |
|-------|-----------|-------------|------------|--------------|----------|
| 0 | 0.00 | 0.0 | 0.00 | 0.0 | 0.0 |
| 1 | 0.02 | 1.8 | 0.00 | 0.0 | 0.0 |
| 2 | 0.05 | 2.2 | 0.00 | 0.0 | 0.0 |
| 3 | 0.04 | 1.5 | 0.03 | 4.5 | 0.15 |
| 4 | 0.03 | 1.2 | 0.06 | 6.0 | 0.20 |
| 5 | 0.02 | 1.0 | 0.10 | 8.0 | 0.25 |

During a morph transition (`morphProgress` 0→1), params interpolate from the previous tier to the next tier using the `morphEnvelope` (ease-in-out curve applied to `morphProgress`).

**Material tier mapping** — `getMaterialParams(level, morphProgress)`:

| Level | transmission | ior | thickness | roughness | emissiveIntensity | dispersion | fresnelPower | fresnelIntensity |
|-------|-------------|-----|-----------|-----------|-------------------|------------|-------------|-----------------|
| 0 | 0.00 | 1.0 | 0.0 | 0.95 | 0.1 | 0.0 | 5.0 | 0.05 |
| 1 | 0.05 | 1.1 | 0.1 | 0.75 | 0.3 | 0.0 | 4.0 | 0.15 |
| 2 | 0.25 | 1.2 | 0.2 | 0.55 | 0.5 | 0.0 | 3.5 | 0.30 |
| 3 | 0.50 | 1.3 | 0.3 | 0.35 | 0.8 | 0.02 | 3.0 | 0.50 |
| 4 | 0.75 | 1.4 | 0.4 | 0.15 | 1.2 | 0.05 | 2.5 | 0.70 |
| 5 | 0.92 | 1.5 | 0.5 | 0.05 | 2.0 | 0.10 | 2.0 | 1.00 |

### 4.2 TSL Displacement Node Graph

**New file**: `src/graphics/crystals/crystalMaterial.ts`

The displacement shader runs in the vertex stage via `material.positionNode`. The node graph:

```
positionLocal ───────────────────────────────────────┐
                                                      │
normalLocal ──┬─── lowFreqNoise(pos * lowFreqScale    │
              │         + subjectSeed)                │
              │         * lowFreqAmplitude             │
              │                                       │
              ├─── highFreqNoise(pos * highFreqScale   │
              │         + subjectSeed)                │
              │     → quantize(value, quantStep)      │
              │         * highFreqAmplitude            │
              │                                       │
              └─── totalDisplacement                  │
                   = (lowFreq + highFreq)             │
                   * morphEnvelope                    │
                                                      │
displacedPosition = positionLocal                     │
                  + normalLocal * totalDisplacement   │
                                                      ▼
                                          material.positionNode
```

**Noise implementation**: Use TSL's `hash()` function composed into a 3D simplex-like noise via `Fn()`. For the high-frequency cellular/Voronoi pass, implement a distance-to-nearest-point pattern using a TSL `Loop` over a small grid of `hash()`-based point positions (3x3x3 = 27 iterations, acceptable for vertex stage).

**Quantization**: `floor(value / quantStep) * quantStep` — creates the faceted, stepped look at higher levels.

**Per-instance attribute reads**: Use `instanceIndex` to index into `InstancedBufferAttribute` storage accessed via `attribute()` or TSL's `instance()` nodes. The `instanceLevel`, `instanceMorphProgress`, and `instanceSubjectSeed` attributes drive the noise parameters.

### 4.3 TSL Noise Functions

```typescript
import { Fn, float, vec3, hash, Loop, min, length, floor } from 'three/tsl';

/** 3D simplex-like noise approximation via hash composition. */
export const simplexNoise3D = Fn(([position]) => {
  const p = position.toVar();
  const i = floor(p);
  const f = p.sub(i); // fract
  // Quintic interpolation curve
  const u = f.mul(f).mul(f.mul(f.mul(6.0).sub(15.0)).add(10.0));
  // 8-corner hash
  const n000 = hash(i);
  const n100 = hash(i.add(vec3(1, 0, 0)));
  const n010 = hash(i.add(vec3(0, 1, 0)));
  const n110 = hash(i.add(vec3(1, 1, 0)));
  const n001 = hash(i.add(vec3(0, 0, 1)));
  const n101 = hash(i.add(vec3(1, 0, 1)));
  const n011 = hash(i.add(vec3(0, 1, 1)));
  const n111 = hash(i.add(vec3(1, 1, 1)));
  // Trilinear interpolation
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z,
  );
});

/** Cellular/Voronoi noise — returns distance to nearest point in a jittered grid. */
export const cellularNoise3D = Fn(([position]) => {
  const p = position.toVar();
  const ip = floor(p);
  const fp = p.sub(ip);
  const minDist = float(10.0).toVar();

  Loop({ start: int(-1), end: int(2), type: 'int' }, ({ i: dx }) => {
    Loop({ start: int(-1), end: int(2), type: 'int' }, ({ i: dy }) => {
      Loop({ start: int(-1), end: int(2), type: 'int' }, ({ i: dz }) => {
        const offset = vec3(dx, dy, dz);
        const cellPoint = offset.add(hash(ip.add(offset)).mul(0.8).add(0.1));
        const dist = length(fp.sub(cellPoint));
        minDist.assign(min(minDist, dist));
      });
    });
  });

  return minDist;
});
```

These are defined in `src/graphics/crystals/crystalNoiseNodes.ts`.

---

## 5. Phase 3 — Material Evolution Pipeline

### 5.1 Material Construction

**File**: `src/graphics/crystals/crystalMaterial.ts`

A single shared `MeshPhysicalNodeMaterial` instance is created once and used by the `InstancedMesh`. All per-instance variation is encoded in the TSL node graph via instance attribute reads.

```typescript
export function createCrystalMaterial(): THREE.MeshPhysicalNodeMaterial {
  const material = new THREE.MeshPhysicalNodeMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: true,
  });

  // -- Per-instance attribute nodes --
  const iLevel = attribute('instanceLevel', 'float');
  const iMorphProgress = attribute('instanceMorphProgress', 'float');
  const iSubjectSeed = attribute('instanceSubjectSeed', 'float');
  const iColor = attribute('instanceColor', 'vec3');
  const iSelected = attribute('instanceSelected', 'float');
  const iCeremonyPhase = attribute('instanceCeremonyPhase', 'float');

  // -- Normalized level (0.0 - 1.0) --
  const levelNorm = iLevel.div(5.0);

  // -- Vertex displacement (see Phase 2) --
  material.positionNode = buildDisplacementNode(
    iLevel, iMorphProgress, iSubjectSeed,
  );

  // -- Color --
  // Stone tint at level 0, subject color at level 5
  const stoneColor = color(0x8a8a7a);
  material.colorNode = mix(stoneColor, iColor, levelNorm);

  // -- Roughness: 0.95 → 0.05 --
  material.roughnessNode = mix(float(0.95), float(0.05), levelNorm);

  // -- Metalness: always 0 (dielectric) --
  material.metalnessNode = float(0.0);

  // -- Transmission: 0 → 0.92 --
  material.transmissionNode = mix(float(0.0), float(0.92), levelNorm);

  // -- IOR: 1.0 → 1.5 --
  material.iorNode = mix(float(1.0), float(1.5), levelNorm);

  // -- Thickness: 0 → 0.5 --
  material.thicknessNode = mix(float(0.0), float(0.5), levelNorm);

  // -- Dispersion: 0 → 0.1 --
  material.dispersionNode = levelNorm.mul(0.1);

  // -- Emissive: Fresnel rim + level intensity + selection boost + ceremony flash --
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const fresnelPower = mix(float(5.0), float(2.0), levelNorm);
  const fresnelRaw = float(1.0).sub(normalWorld.dot(viewDir).saturate()).pow(fresnelPower);
  const fresnelIntensity = mix(float(0.05), float(1.0), levelNorm);
  const selectionBoost = iSelected.mul(1.5);
  const ceremonyFlash = iCeremonyPhase.mul(
    iCeremonyPhase.oneMinus()  // parabola peaking at 0.5
  ).mul(8.0);

  material.emissiveNode = iColor.mul(
    fresnelRaw.mul(fresnelIntensity)
      .add(levelNorm.mul(0.3))
      .add(selectionBoost)
      .add(ceremonyFlash)
  );

  return material;
}
```

### 5.2 Level-Driven Material Interpolation

Rather than branching on discrete levels, the material nodes use `levelNorm` (0.0-1.0 continuous, interpolated during morph) to `mix()` between endpoint values. This naturally handles mid-transition states during the 1.5s ceremony without needing separate "from" and "to" snapshots.

For the discontinuous jump from "organic swelling" to "crystalline facets" at level 3, the displacement node graph uses a `smoothstep(2.5, 3.5, iLevel)` crossfade factor to blend between the simplex and cellular noise contributions.

### 5.3 Subject Identity via Noise Seed

Each subject's `id` is hashed to a deterministic float seed (`instanceSubjectSeed`). This seed offsets the noise sampling position:

```
noiseInput = positionLocal * frequency + vec3(subjectSeed * 17.3, subjectSeed * 31.7, subjectSeed * 53.1)
```

Different subjects produce visually distinct displacement patterns from the same noise functions without needing different geometry or separate material instances.

---

## 6. Phase 4 — Attached Crystal Branches

### 6.1 Approach: Thresholded Noise Peaks in Vertex Shader

Rather than spawning separate meshes, crystal branches are generated by the vertex displacement shader itself. Vertices whose noise value exceeds a level-dependent threshold receive amplified displacement, causing localized "spike" protrusions that read as crystalline branches.

```
branchThreshold = mix(1.0, 0.65, smoothstep(2.0, 5.0, iLevel))
branchAmplifier = select(noiseValue > branchThreshold, 2.5, 1.0)
finalDisplacement = baseDisplacement * branchAmplifier
```

This approach:
- Requires zero additional geometry or draw calls
- Produces more branches at higher levels (threshold decreases)
- Creates subject-unique branch patterns (noise seed varies)
- Has zero CPU overhead (fully GPU-side)

### 6.2 Fallback: Static Instanced Branch Clusters

If the thresholded vertex approach does not produce sufficient visual mass, a secondary `InstancedMesh` can be added using a small `OctahedronGeometry(0.08, 0)` (~6 vertices). Branch instances are positioned at fixed offsets from parent crystals, with scale driven by `getCrystalScale(level) * branchScaleFactor`. This is a deferred optimization — implement the vertex approach first and evaluate visually.

---

## 7. Phase 5 — Ground-Projected Glow Decal

### 7.1 Replace Billboard Glow Ring

The current `RingGeometry` + `MeshBasicNodeMaterial` with `AdditiveBlending` that copies camera quaternion every frame is replaced with a ground-projected quad rendered on the floor plane.

**New file**: `src/graphics/crystals/crystalDecal.ts`

- A single `PlaneGeometry(1, 1)` positioned at `y = 0.001` (just above floor) beneath each crystal
- Material: `MeshBasicNodeMaterial` with `AdditiveBlending`, `depthWrite: false`, `transparent: true`
- Fragment shader: SDF circle with soft falloff

```
// Per-instance: decal center from crystal position, radius from level, color from subject
sdfCircle = length(uv - 0.5) * 2.0
falloff = smoothstep(1.0, 0.3, sdfCircle)
intensity = falloff * levelIntensity * (1.0 + selectedPulse * sin(time * 6.0))
fragmentColor = subjectColor * intensity
```

### 7.2 Decal Scaling

| Level | Decal Radius | Base Intensity |
|-------|-------------|----------------|
| 0 | 0.0 (hidden) | 0.0 |
| 1 | 0.4 | 0.15 |
| 2 | 0.5 | 0.25 |
| 3 | 0.6 | 0.35 |
| 4 | 0.7 | 0.50 |
| 5 | 0.8 | 0.70 |

Selection multiplies intensity by 2.0 and adds a `sin(time * 6.0) * 0.3` pulse.

### 7.3 Implementation

The decal can be implemented as another `InstancedMesh` sharing instance indices with the crystal instances. Per-instance attributes: position (x, z from grid), radius, intensity, color. One draw call for all decals.

---

## 8. Phase 6 — Level-Up Transition Ceremony

### 8.1 Ceremony State Machine

**New file**: `src/graphics/crystals/crystalCeremony.ts`

```typescript
export interface CeremonyState {
  /** Index into the InstancedMesh */
  instanceIndex: number;
  /** Crystal topicId for event correlation */
  topicId: string;
  /** Level transitioning FROM */
  fromLevel: number;
  /** Level transitioning TO */
  toLevel: number;
  /** Ceremony start time (performance.now()) */
  startTime: number;
  /** Duration in ms */
  duration: number;
  /** Current progress 0.0 - 1.0 */
  progress: number;
  /** Whether particle burst has been triggered */
  particlesTriggered: boolean;
  /** Whether sound has been played */
  soundPlayed: boolean;
}

export const CEREMONY_DURATION_MS = 1500;
```

### 8.2 Ceremony Timeline (1500ms)

| Phase | Time Range | What Happens |
|-------|-----------|-------------|
| **Wind-up** | 0-300ms | `morphProgress` eases from `fromLevel` blend toward midpoint. Emissive begins ramping. Crystal scale compresses slightly (0.95x). |
| **Flash** | 300-500ms | `ceremonyPhase` peaks at 0.5 → emissive flash fires (parabolic peak in shader). Particle shockwave triggers at 400ms. Sound plays at 350ms. |
| **Growth** | 500-1200ms | Vertex displacement visibly expands as `morphProgress` sweeps through the new level's noise params. Scale rebounds to target. Branch protrusions emerge (if crossing level 3 threshold). |
| **Settle** | 1200-1500ms | Emissive returns to resting level. `morphProgress` reaches 1.0. `ceremonyPhase` returns to 0.0. All values at new steady state. |

### 8.3 Easing

`morphProgress` uses a custom ease curve for theatrical feel:

```typescript
function ceremonialEase(t: number): number {
  // Slow start, fast middle, gentle settle
  if (t < 0.2) return t * t * 25 * 0.04; // ease-in (0 → 0.04)
  if (t < 0.8) return 0.04 + (t - 0.2) * 1.6; // linear ramp (0.04 → 1.0)
  const settle = (t - 0.8) / 0.2;
  return 1.0 - (1.0 - settle) * 0.02; // ease-out settle
}
```

### 8.4 Deferred Playback

The existing deferred ceremony pattern is preserved: if `isStudyPanelOpen`, the ceremony is queued (current `pendingTargetScale` + `pendingParticles` pattern). When the panel closes, all pending ceremonies play sequentially with 200ms stagger between them.

### 8.5 Instance Attribute Updates During Ceremony

Each frame during an active ceremony, the `useFrame` callback:

1. Computes `progress = (now - startTime) / duration`
2. Applies `ceremonialEase(progress)` to get `morphProgress`
3. Computes `ceremonyPhase` (parabolic flash envelope)
4. Writes `instanceMorphProgress` and `instanceCeremonyPhase` into the instance attribute buffers
5. Calls `instancedMesh.instanceMatrix.needsUpdate = true` (if scale changed)
6. Calls `instancedMesh.geometry.attributes.instanceMorphProgress.needsUpdate = true`
7. Calls `invalidate()` to trigger frame render

---

## 9. Phase 7 — Bloom Post-Processing Integration

### 9.1 Re-enable Bloom

**File**: `src/components/Scene.tsx`

Uncomment `<GlowPostProcessing />`:

```tsx
<GlowPostProcessing bloomExcludeLayer={BLOOM_EXCLUDE_LAYER} bloomMode="emissive" />
```

### 9.2 Bloom Contribution Scaling

The bloom system uses MRT emissive mode (already implemented in `glowPostProcessing.tsx`). The crystal material's `emissiveNode` already scales with level — level 0 crystals emit almost nothing (0.1 intensity), level 5 crystals emit strongly (2.0 intensity). This naturally maps to bloom contribution without any additional bloom-specific code.

### 9.3 Ceremony Bloom Spike

During the ceremony flash phase (300-500ms), the `ceremonyPhase` uniform drives emissive up to ~8x normal via the parabolic `ceremonyPhase * (1 - ceremonyPhase) * 8.0` term. This creates a visible bloom spike without modifying the post-processing pipeline.

### 9.4 Bloom Tuning

Adjust `BLOOM_STRENGTH` and `BLOOM_RADIUS` in `glowPostProcessing.tsx` after visual testing. Expected starting values:

- `BLOOM_STRENGTH`: 1.0 (down from 1.5 — new emissive values are higher)
- `BLOOM_RADIUS`: 0.6 (tighter radius for crystal-specific glow, down from 0.75)

### 9.5 Tone Mapping Reconciliation

The bloom component sets `toneMappingExposure = 1.0`, but `Scene.tsx` `onCreated` sets it to `0.5`. When bloom is active, the bloom component's value takes precedence (it runs after mount). Reconcile: set `Scene.tsx` exposure to `0.7` and bloom component to match, so bloom toggling doesn't cause a jarring brightness shift.

---

## 10. Phase 8 — Particle System Upgrade

### 10.1 Shockwave Ring Particles

**File**: `src/graphics/GrowthParticles.tsx` (modify)

Replace the upward-drifting point cloud with a radially-expanding ring:

- 48 particles arranged in a circle (not random positions)
- On trigger: particles expand outward from crystal center in the XZ plane
- Velocity: radial outward + slight upward drift
- Lifetime: 0.8s (shorter than ceremony for clean overlap)
- Size: starts at 0.04, scales to 0.08 as it expands
- Color: subject color (passed via prop), not fixed yellow
- Additive blending (kept)

### 10.2 Vertical Sparkle Burst

Add a secondary emission: 16 particles that launch upward in a narrow cone during the flash phase (300-500ms). These use the existing upward-drift behavior but with subject-colored tint and faster fade (0.5s).

### 10.3 Particle Pooling

Instead of conditional rendering (`active ? <points ... /> : null`), always render the `<points>` with `visible={false}` and toggle visibility. This avoids React reconciliation overhead on ceremony trigger.

---

## 11. Files Changed Summary

### New Files

| File | Layer | Purpose |
|------|-------|---------|
| `src/graphics/crystals/crystalGeometry.ts` | Graphics | Shared `IcosahedronGeometry` singleton |
| `src/graphics/crystals/crystalMaterial.ts` | Graphics | `MeshPhysicalNodeMaterial` with TSL node graph |
| `src/graphics/crystals/crystalNoiseNodes.ts` | Graphics | TSL `Fn()` noise functions (simplex, cellular) |
| `src/graphics/crystals/crystalInstances.ts` | Graphics | `InstancedMesh` lifecycle + attribute buffer management |
| `src/graphics/crystals/crystalDecal.ts` | Graphics | Ground-projected SDF glow decal |
| `src/graphics/crystals/crystalCeremony.ts` | Graphics | Ceremony state machine + timeline |
| `src/graphics/crystals/index.ts` | Graphics | Barrel export |
| `src/features/progression/visualization/crystalMorphModel.ts` | Feature | Level → displacement/material param mapping |
| `src/features/progression/visualization/crystalMorphModel.test.ts` | Feature | Unit tests for param interpolation |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/Crystals.tsx` | **Rewrite**: Replace `SingleCrystal` per-crystal rendering with single `InstancedMesh` orchestrator. Remove inner sphere, level indicator, glow ring meshes. Keep label visibility system. |
| `src/graphics/GrowthParticles.tsx` | Upgrade to shockwave ring + vertical sparkle burst. Accept subject color prop. Pool particles. |
| `src/graphics/nodeMaterialRegistration.ts` | Add `MeshPhysicalNodeMaterial` to `extend()` |
| `src/graphics/glowPostProcessing.tsx` | Tune `BLOOM_STRENGTH` / `BLOOM_RADIUS` |
| `src/components/Scene.tsx` | Uncomment `<GlowPostProcessing />`. Reconcile `toneMappingExposure`. |
| `src/utils/geometryMapping.ts` | Remove crystal geometry factories. Keep grid + altar factories. Keep color utilities. |
| `src/features/progression/visualization/crystalScale.ts` | Unchanged (linear scale 0.6 + level * 0.15 kept) |

### Deleted Code (within modified files)

| Location | What |
|----------|------|
| `Crystals.tsx` lines 25-27 | `crystalInnerGeometry`, `levelIndicatorGeometry`, `glowRingGeometry` |
| `Crystals.tsx` lines 228-283 | `outerMaterial`, `innerMaterial`, `levelMaterial`, `glowMaterial` useMemo blocks |
| `Crystals.tsx` lines 376-404 | Inner sphere mesh, level indicator mesh, glow ring mesh JSX |
| `Crystals.tsx` lines 52-431 | `SingleCrystal` component (entire component replaced) |
| `geometryMapping.ts` lines 13-31 | Crystal geometry factory functions |
| `geometryMapping.ts` lines 45-51 | `crystalGeometryFactories` map |

---

## 12. Performance Budget

### Target Constraints

| Metric | Target |
|--------|--------|
| Max on-screen crystals | 20 |
| Target FPS (high-range mobile) | 30 |
| Draw calls for crystals | 3 (hull instances + branch instances + decal instances) |
| Vertex shader invocations per frame | ~51,240 (2562 vertices * 20 instances) |
| Per-instance CPU update | 32 bytes attribute write + 64 bytes matrix write |
| Material instances | 1 shared `MeshPhysicalNodeMaterial` |
| `useFrame` callbacks for crystals | 1 (consolidated) |

### Cost Analysis

| Component | Previous (per crystal) | New (total) |
|-----------|----------------------|-------------|
| Draw calls | 4 (outer + inner + level + ring) | 3 (hull + branches + decals) |
| Material instances | 4 | 3 (shared) |
| `useFrame` subscriptions | 1 per crystal (20 total) | 1 total |
| React nodes per crystal | ~8 (group, 4 meshes, particles, Html) | 0 (instanced, no per-crystal React tree) |
| Geometry objects | 4 * 20 = 80 | 3 (shared) |

### Vertex Budget Justification

`IcosahedronGeometry(0.3, 4)` = 2562 vertices. The cellular noise loop in the vertex shader iterates 27 cells (3x3x3). Each vertex shader invocation is ~50 ALU operations. At 20 instances * 2562 vertices = 51,240 invocations. At ~50 ALU/vertex, this is ~2.56M ALU/frame — comfortably within mobile GPU vertex throughput (modern mobile GPUs handle 100M+ ALU/frame in vertex stage).

The `MeshPhysicalNodeMaterial` transmission pass doubles fragment cost (it requires a back-face pre-pass). At level 0-2 (`transmission ≤ 0.25`), Three.js may skip the extra pass. At level 3-5, the crystal fragment cost roughly doubles. This is acceptable for ≤20 crystals at the scene's small screen coverage (crystals are small on mobile).

---

## 13. Test Plan

### Unit Tests

| Test | File | Validates |
|------|------|-----------|
| `crystalMorphModel` param interpolation | `crystalMorphModel.test.ts` | Level 0-5 produce monotonically increasing displacement/material values. Morph progress interpolation between adjacent levels is continuous. Edge cases: level < 0, level > 5, morphProgress outside 0-1. |
| `crystalScale` (existing) | `crystalScale.test.ts` | Unchanged — validates linear scale curve. |
| `crystalCeremony` state machine | `crystalCeremony.test.ts` | Ceremony progress computation. Easing function continuity at boundaries. Ceremony completion detection. Stagger timing for multiple pending ceremonies. |
| `getCrystalGeometry` singleton | `crystalGeometry.test.ts` | Returns same reference on repeated calls. Vertex count matches `IcosahedronGeometry` detail 4 spec. `dispose` nullifies cache. |

### Visual Verification (Manual)

| Check | Expected Result |
|-------|-----------------|
| Level 0 crystal | Smooth icosahedron, dark matte stone, no glow, no decal |
| Level 1 crystal | Subtle organic swelling visible on surface, slight glow, small decal |
| Level 2 crystal | More pronounced swelling, translucency beginning, visible decal |
| Level 3 crystal | Faceted protrusions emerge (cellular noise), clear translucency, medium decal |
| Level 4 crystal | Prominent crystalline facets, glass-like, branch spikes visible, bright decal |
| Level 5 crystal | Full radiant gem — transmissive, refractive, strong fresnel glow, large bright decal, visible bloom |
| Level-up ceremony | Compression → flash → growth → settle. Particles expand as ring. Sound plays. Bloom spikes. |
| Subject A vs Subject B at same level | Same silhouette complexity but different displacement pattern, different color |
| Selected crystal | Stronger fresnel glow, decal pulses, rotation (if kept) |
| 20 crystals on mobile | Stable 30fps, no visible jank during ceremony |

### Integration Tests

| Test | Validates |
|------|-----------|
| XP grant → level-up → ceremony trigger | End-to-end: `submitStudyResult` → `applyCrystalXpDelta` → level change detected → ceremony queued → ceremony plays when panel closes |
| Multiple simultaneous level-ups | Ceremonies stagger correctly with 200ms gap |
| Scene mount/unmount | `InstancedMesh` and geometry properly disposed, no WebGPU resource leaks |

---

## Implementation Order

Execute phases sequentially. Each phase produces a visually testable milestone:

1. **Phase 0** — Cleanup. Crystals temporarily disappear (expected).
2. **Phase 1** — Instanced icosahedrons appear at grid positions with correct scale. No displacement, no material evolution. Visual: white/gray smooth spheres.
3. **Phase 2** — Displacement activates. Crystals show level-appropriate deformation. Visual: organic lumps at level 1-2, faceted crystals at level 3-5.
4. **Phase 3** — Material evolution activates. Visual: stone → glass transformation across levels.
5. **Phase 4** — Branch protrusions visible at level 3+.
6. **Phase 5** — Ground decals replace billboard rings.
7. **Phase 6** — Level-up ceremony plays with full choreography.
8. **Phase 7** — Bloom re-enabled, ceremony flash produces visible glow spike.
9. **Phase 8** — Particle upgrade with shockwave ring.

Phases 4, 5, and 8 can be parallelized if multiple developers are available. Phase 7 depends on Phase 6 (ceremony flash needs ceremony to exist).
