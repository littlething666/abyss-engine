/**
 * Abyss Scene Probe — E2E-only read surface for the 3D scene.
 *
 * This module is populated at runtime by `<SceneProbeMount />` when the app is
 * launched in an E2E context (?e2e=1 or NEXT_PUBLIC_PLAYWRIGHT=1). It exposes
 * a snapshot of the crystal garden to Playwright via `window.__abyssScene`.
 *
 * Production runs never populate this probe — the mount component is gated.
 *
 * Read-only by contract: tests must never mutate scene state through this
 * surface. Use `abyssDev` for state mutation.
 */

import type * as THREE from 'three/webgpu';

export interface AbyssCrystalSnapshot {
  subjectId: string;
  topicId: string;
  key: string;
  position: [number, number, number];
  scale: [number, number, number];
  visible: boolean;
  userDataLevel: number | null;
}

export interface AbyssSceneSnapshot {
  timestamp: number;
  frameCount: number;
  crystalCount: number;
  crystals: AbyssCrystalSnapshot[];
  camera: {
    position: [number, number, number];
    target: [number, number, number] | null;
    fov: number | null;
  };
  altar: {
    position: [number, number, number];
  } | null;
}

export interface AbyssSceneProbe {
  /** Latest snapshot collected by SceneProbeMount. Null until first frame. */
  snapshot: AbyssSceneSnapshot | null;
  /** Monotonically incrementing frame counter (used for idle/soak assertions). */
  frameCount: number;
  /** True after the R3F onCreated callback has fired. */
  ready: boolean;
  /** Reference to the root Three.js scene, for advanced inspection. */
  sceneRef: THREE.Scene | null;
}

declare global {
  interface Window {
    __abyssScene?: AbyssSceneProbe;
  }
}

/** Idempotently initialize `window.__abyssScene`. Safe to call from SSR (no-op). */
export function ensureSceneProbe(): AbyssSceneProbe | null {
  if (typeof window === 'undefined') return null;
  if (!window.__abyssScene) {
    window.__abyssScene = {
      snapshot: null,
      frameCount: 0,
      ready: false,
      sceneRef: null,
    };
  }
  return window.__abyssScene;
}

export function markSceneReady(scene: THREE.Scene | null): void {
  const probe = ensureSceneProbe();
  if (!probe) return;
  probe.ready = true;
  probe.sceneRef = scene;
}

export function publishSceneSnapshot(snapshot: AbyssSceneSnapshot): void {
  const probe = ensureSceneProbe();
  if (!probe) return;
  probe.snapshot = snapshot;
  probe.frameCount = snapshot.frameCount;
}
