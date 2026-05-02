import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CrystalBaseShape } from '../../types/core';

const SHARD_COUNT = 6;

/**
 * Shard activation thresholds — the crystal level at which each shard becomes visible.
 * One shard emerges per level: L0→1 shard, L1→2 shards, …, L5→6 shards.
 * Shader gating in `crystalMaterial.ts` (`shardActiveAtTier`) reads the same
 * shape (`tier ≥ shardIdx`) so CPU/GPU stay in lockstep.
 */
export const SHARD_ACTIVATION_LEVELS = [0, 1, 2, 3, 4, 5] as const;

interface ShardPlacement {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

/**
 * Per-shape druse layouts. Index 0 is the central shard; 1–5 are secondary
 * shards that emerge as the crystal levels up. Each shape has its own
 * believable cluster pattern — a global table would force every polyhedron
 * into one silhouette.
 */
const SHARD_PLACEMENTS: Record<CrystalBaseShape, ShardPlacement[]> = {
  // Balanced druse — original layout.
  icosahedron: [
    { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1.0, 1.5, 1.0] },
    { position: [0.13, -0.04, 0.09], rotation: [0.30, 0.5, -0.22], scale: [0.62, 1.00, 0.62] },
    { position: [-0.11, -0.02, -0.12], rotation: [-0.28, 2.8, 0.18], scale: [0.55, 0.92, 0.55] },
    { position: [0.15, -0.06, -0.07], rotation: [0.42, 3.8, -0.32], scale: [0.44, 0.78, 0.44] },
    { position: [-0.09, 0.00, 0.14], rotation: [-0.38, 1.2, 0.28], scale: [0.40, 0.72, 0.40] },
    { position: [0.04, -0.08, -0.15], rotation: [0.52, 5.5, -0.18], scale: [0.36, 0.66, 0.36] },
  ],
  // Sharper outward angles, narrower radial spread.
  octahedron: [
    { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.95, 1.70, 0.95] },
    { position: [0.10, -0.05, 0.07], rotation: [0.50, 0.4, -0.35], scale: [0.55, 1.10, 0.55] },
    { position: [-0.08, -0.03, -0.10], rotation: [-0.45, 2.6, 0.30], scale: [0.50, 1.02, 0.50] },
    { position: [0.11, -0.07, -0.05], rotation: [0.62, 3.7, -0.50], scale: [0.40, 0.86, 0.40] },
    { position: [-0.07, -0.01, 0.11], rotation: [-0.55, 1.0, 0.42], scale: [0.36, 0.80, 0.36] },
    { position: [0.03, -0.09, -0.11], rotation: [0.70, 5.3, -0.30], scale: [0.32, 0.74, 0.32] },
  ],
  // Asymmetric lean — secondary shards bias to one side of the main shard.
  tetrahedron: [
    { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1.05, 1.45, 1.05] },
    { position: [0.16, -0.03, 0.05], rotation: [0.20, 0.6, -0.15], scale: [0.62, 0.95, 0.62] },
    { position: [0.13, -0.05, -0.10], rotation: [0.30, 3.5, -0.10], scale: [0.55, 0.88, 0.55] },
    { position: [0.18, -0.04, 0.12], rotation: [0.18, 1.0, 0.05], scale: [0.46, 0.78, 0.46] },
    { position: [0.10, -0.08, 0.16], rotation: [-0.12, 2.2, 0.20], scale: [0.40, 0.72, 0.40] },
    { position: [0.20, -0.07, -0.04], rotation: [0.35, 4.4, -0.22], scale: [0.36, 0.66, 0.36] },
  ],
  // Tighter cluster — secondary shards bunched closer to the main shard.
  dodecahedron: [
    { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1.05, 1.40, 1.05] },
    { position: [0.08, -0.03, 0.06], rotation: [0.25, 0.5, -0.20], scale: [0.66, 0.95, 0.66] },
    { position: [-0.07, -0.02, -0.08], rotation: [-0.22, 2.9, 0.16], scale: [0.60, 0.90, 0.60] },
    { position: [0.09, -0.05, -0.05], rotation: [0.36, 3.9, -0.28], scale: [0.50, 0.80, 0.50] },
    { position: [-0.06, -0.01, 0.09], rotation: [-0.30, 1.3, 0.24], scale: [0.46, 0.75, 0.46] },
    { position: [0.03, -0.06, -0.09], rotation: [0.44, 5.6, -0.16], scale: [0.42, 0.70, 0.42] },
  ],
};

const BASE_RADIUS = 0.3;
const BASE_DETAIL = 0;

function createBasePolyhedron(shape: CrystalBaseShape): THREE.BufferGeometry {
  switch (shape) {
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(BASE_RADIUS, BASE_DETAIL);
    case 'octahedron':
      return new THREE.OctahedronGeometry(BASE_RADIUS, BASE_DETAIL);
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(BASE_RADIUS, BASE_DETAIL);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(BASE_RADIUS, BASE_DETAIL);
  }
}

function buildShardWithIndex(
  shape: CrystalBaseShape,
  shardIndex: number,
): THREE.BufferGeometry {
  const geo = createBasePolyhedron(shape);
  const placement = SHARD_PLACEMENTS[shape][shardIndex];

  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(...placement.position),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...placement.rotation),
    ),
    new THREE.Vector3(...placement.scale),
  );
  geo.applyMatrix4(matrix);

  const vertexCount = geo.attributes.position.count;
  const uvData = new Float32Array(vertexCount * 2);
  for (let j = 0; j < vertexCount; j++) {
    uvData[j * 2] = shardIndex;
    uvData[j * 2 + 1] = 0;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvData, 2));

  return geo;
}

const clusterCache = new Map<CrystalBaseShape, THREE.BufferGeometry>();

export function getClusterGeometry(shape: CrystalBaseShape): THREE.BufferGeometry {
  const cached = clusterCache.get(shape);
  if (cached) return cached;

  const shards: THREE.BufferGeometry[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    shards.push(buildShardWithIndex(shape, i));
  }

  const merged = mergeGeometries(shards, false);
  if (!merged) {
    throw new Error(`Failed to merge crystal cluster shards for shape "${shape}"`);
  }

  clusterCache.set(shape, merged);
  return merged;
}

export function disposeClusterGeometries(): void {
  clusterCache.forEach((geo) => geo.dispose());
  clusterCache.clear();
}
