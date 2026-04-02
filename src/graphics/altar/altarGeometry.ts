import * as THREE from 'three/webgpu';

/** Deterministic pseudo-random in [-amp, amp] for organic vertex jitter. */
function jitter(i: number, j: number, amp: number): number {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  const t = s - Math.floor(s);
  return (t * 2 - 1) * amp;
}

/**
 * Double-terminated hexagonal prism crystal (~1.6 units tall, ~0.3 radius).
 * Faceted mesh with unique vertices per triangle for crisp normals.
 */
function createDoubleTerminatedHexCrystalGeometry(): THREE.BufferGeometry {
  const R = 0.3;
  const hBody = 0.85;
  const hTip = 0.375;
  const yBottomRing = -hBody / 2;
  const yTopRing = hBody / 2;
  const yBottomApex = yBottomRing - hTip;
  const yTopApex = yTopRing + hTip;

  const ringBottom: THREE.Vector3[] = [];
  const ringTop: THREE.Vector3[] = [];

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = R * Math.cos(a) + jitter(i, 0, 0.012);
    const z = R * Math.sin(a) + jitter(i, 1, 0.012);
    ringBottom.push(new THREE.Vector3(x, yBottomRing + jitter(i, 2, 0.012), z));
    ringTop.push(
      new THREE.Vector3(
        x + jitter(i, 3, 0.01),
        yTopRing + jitter(i, 4, 0.01),
        z + jitter(i, 5, 0.01),
      ),
    );
  }

  const apexTop = new THREE.Vector3(jitter(6, 0, 0.015), yTopApex, jitter(6, 1, 0.015));
  const apexBottom = new THREE.Vector3(jitter(7, 0, 0.015), yBottomApex, jitter(7, 1, 0.015));

  const positions: number[] = [];

  function pushTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    const b0 = ringBottom[i];
    const b1 = ringBottom[next];
    const t0 = ringTop[i];
    const t1 = ringTop[next];
    pushTri(b0, t0, b1);
    pushTri(b1, t0, t1);
  }

  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    pushTri(ringTop[i], apexTop, ringTop[next]);
  }

  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    pushTri(ringBottom[next], apexBottom, ringBottom[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
  geo.computeVertexNormals();
  return geo;
}

let nexusCrystalCache: THREE.BufferGeometry | null = null;

export function getNexusCrystalGeometry(): THREE.BufferGeometry {
  if (!nexusCrystalCache) {
    nexusCrystalCache = createDoubleTerminatedHexCrystalGeometry();
  }
  return nexusCrystalCache;
}

/** Low octagonal pedestal; material adds fractured look via TSL. */
let fracturedBaseCache: THREE.BufferGeometry | null = null;

export function getFracturedBaseGeometry(): THREE.BufferGeometry {
  if (!fracturedBaseCache) {
    fracturedBaseCache = new THREE.CylinderGeometry(0.7, 0.75, 0.35, 8);
  }
  return fracturedBaseCache;
}

export interface AltarFragmentSpec {
  geometry: THREE.BufferGeometry;
  /** Scale applied in scene (uniform scale). */
  scale: number;
}

function buildFragmentSpecs(): AltarFragmentSpec[] {
  const specs: AltarFragmentSpec[] = [
    { geometry: new THREE.OctahedronGeometry(0.1, 0), scale: 1 },
    { geometry: new THREE.TetrahedronGeometry(0.09, 0), scale: 1 },
    { geometry: new THREE.OctahedronGeometry(0.07, 0), scale: 1.1 },
    { geometry: new THREE.TetrahedronGeometry(0.08, 0), scale: 1 },
    { geometry: new THREE.OctahedronGeometry(0.085, 0), scale: 0.95 },
    { geometry: new THREE.TetrahedronGeometry(0.065, 0), scale: 1.15 },
  ];
  return specs;
}

let fragmentSpecsCache: AltarFragmentSpec[] | null = null;

/**
 * Six small crystal shards for orbiting the nexus (mixed octa / tetra).
 */
export function getAltarFragmentSpecs(): readonly AltarFragmentSpec[] {
  if (!fragmentSpecsCache) {
    fragmentSpecsCache = buildFragmentSpecs();
  }
  return fragmentSpecsCache;
}

export function disposeAltarGeometries(): void {
  nexusCrystalCache?.dispose();
  nexusCrystalCache = null;
  fracturedBaseCache?.dispose();
  fracturedBaseCache = null;
  if (fragmentSpecsCache) {
    for (const spec of fragmentSpecsCache) {
      spec.geometry.dispose();
    }
    fragmentSpecsCache = null;
  }
}
