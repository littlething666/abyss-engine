'use client';

/**
 * SceneProbeMount — R3F component that populates `window.__abyssScene` with a
 * per-frame snapshot of the crystal garden. Renders null.
 *
 * Gated: only performs work when the app is running in an E2E context
 * (`NEXT_PUBLIC_PLAYWRIGHT === '1'` or `?e2e=1`). In all other environments
 * it short-circuits to a zero-cost null component.
 *
 * Must be mounted INSIDE `<Canvas>` to access R3F hooks.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import {
  ensureSceneProbe,
  markSceneReady,
  publishSceneSnapshot,
  type AbyssCrystalSnapshot,
} from '@/utils/abyssSceneProbe';

const SNAPSHOT_INTERVAL_MS = 100;

function isE2EContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('e2e') === '1';
  } catch {
    return false;
  }
}

export const SceneProbeMount: React.FC = () => {
  const enabled = useMemo(() => isE2EContext(), []);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const frameCountRef = useRef(0);
  const lastPublishRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    ensureSceneProbe();
    markSceneReady(scene as unknown as import('three/webgpu').Scene);
  }, [enabled, scene]);

  useFrame(() => {
    if (!enabled) return;
    frameCountRef.current += 1;
    const now = performance.now();
    if (now - lastPublishRef.current < SNAPSHOT_INTERVAL_MS) return;
    lastPublishRef.current = now;

    const crystals: AbyssCrystalSnapshot[] = [];
    let altarPos: [number, number, number] | null = null;

    scene.traverse((obj) => {
      const ud = (obj as { userData?: Record<string, unknown> }).userData ?? {};
      const topicId = typeof ud.topicId === 'string' ? (ud.topicId as string) : undefined;
      const subjectId = typeof ud.subjectId === 'string' ? (ud.subjectId as string) : undefined;
      if (topicId && subjectId) {
        const level = typeof ud.level === 'number' ? (ud.level as number) : null;
        const key = `${subjectId}:${topicId}`;
        crystals.push({
          subjectId,
          topicId,
          key,
          position: [obj.position.x, obj.position.y, obj.position.z],
          scale: [obj.scale.x, obj.scale.y, obj.scale.z],
          visible: obj.visible,
          userDataLevel: level,
        });
      }
      if (ud.role === 'altar' && !altarPos) {
        altarPos = [obj.position.x, obj.position.y, obj.position.z];
      }
    });

    publishSceneSnapshot({
      timestamp: now,
      frameCount: frameCountRef.current,
      crystalCount: crystals.length,
      crystals,
      camera: {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: null,
        fov: 'fov' in camera ? (camera as { fov: number }).fov : null,
      },
      altar: altarPos ? { position: altarPos } : null,
    });
  });

  return null;
};

export default SceneProbeMount;
