'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';

import {
  crystalCeremonyStore,
  CRYSTAL_CEREMONY_DURATION_MS,
} from '../features/progression/crystalCeremonyStore';
import { parseTopicRefKey } from '@/lib/topicRef';
import { useProgressionStore } from '../features/progression';
import { FLOOR_SURFACE_Y } from '../constants/sceneFloor';

/** How much of the distance toward the crystal the target moves (0–1). */
const DOLLY_STRENGTH = 0.2;

interface DollyState {
  active: boolean;
  savedTarget: THREE.Vector3;
  crystalWorldPos: THREE.Vector3;
  startedAt: number;
}

/**
 * Smoothly dollies the OrbitControls target toward the leveling crystal
 * during a ceremony, then eases back when the ceremony ends.
 *
 * The dolly is tied to the ceremony lifecycle: it starts when
 * `ceremonyTopicKey` becomes non-null (post-deferral) and ends
 * when the ceremony completes.
 *
 * @param controlsRef Ref to the drei OrbitControls instance.
 */
export function useCeremonyCameraDolly(
  controlsRef: React.RefObject<{ target: THREE.Vector3; update: () => void } | null>,
): void {
  const invalidate = useThree((state) => state.invalidate);
  const dollyState = useRef<DollyState>({
    active: false,
    savedTarget: new THREE.Vector3(),
    crystalWorldPos: new THREE.Vector3(),
    startedAt: 0,
  });

  // Track user interaction to cancel return animation gracefully
  const userInteractedDuringDolly = useRef(false);

  useEffect(() => {
    const unsubscribe = crystalCeremonyStore.subscribe((state, prevState) => {
      // Detect ceremony start: ceremonyTopicKey transitions from null to non-null
      if (state.ceremonyTopicKey && !prevState.ceremonyTopicKey) {
        const controls = controlsRef.current;
        if (!controls) return;

        const topicKey = state.ceremonyTopicKey;
        const parsed = parseTopicRefKey(topicKey);
        const activeCrystals = useProgressionStore.getState().activeCrystals;
        const crystal = activeCrystals.find(
          (c) => c.subjectId === parsed.subjectId && c.topicId === parsed.topicId,
        );
        if (!crystal) return;

        const [gx, gz] = crystal.gridPosition;
        const ds = dollyState.current;
        ds.active = true;
        ds.savedTarget.copy(controls.target);
        ds.crystalWorldPos.set(gx, FLOOR_SURFACE_Y, gz);
        // Use performance.now() for startedAt to match the time base used in useFrame.
        // ceremonyStartedAt uses Date.now() (epoch ms) which is incompatible.
        ds.startedAt = performance.now();
        userInteractedDuringDolly.current = false;
      }
    });
    return unsubscribe;
  }, [controlsRef]);

  // Detect user orbit interaction during dolly to cancel return animation
  useEffect(() => {
    const handlePointerDown = () => {
      if (dollyState.current.active) {
        userInteractedDuringDolly.current = true;
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useFrame(() => {
    const ds = dollyState.current;
    if (!ds.active) return;

    const controls = controlsRef.current;
    if (!controls) {
      ds.active = false;
      return;
    }

    const now = performance.now();
    const elapsed = now - ds.startedAt;
    const t = Math.min(1, Math.max(0, elapsed / CRYSTAL_CEREMONY_DURATION_MS));

    // If user interacted, restore saved target and cancel
    if (userInteractedDuringDolly.current) {
      controls.target.copy(ds.savedTarget);
      controls.update();
      ds.active = false;
      invalidate();
      return;
    }

    // Three phases:
    // 0.0–0.33: ease toward crystal (dolly in)
    // 0.33–0.67: hold dolly position
    // 0.67–1.0: ease back to original
    let dollyFactor: number;
    if (t < 0.33) {
      // Ease in: smoothstep 0→1 over first third
      const p = t / 0.33;
      dollyFactor = p * p * (3 - 2 * p);
    } else if (t < 0.67) {
      // Hold
      dollyFactor = 1;
    } else {
      // Ease out: smoothstep 1→0 over last third
      const p = (t - 0.67) / 0.33;
      const eased = p * p * (3 - 2 * p);
      dollyFactor = 1 - eased;
    }

    // Interpolate target: savedTarget → crystalWorldPos by dollyFactor * DOLLY_STRENGTH
    const lerpAmount = dollyFactor * DOLLY_STRENGTH;
    controls.target.lerpVectors(ds.savedTarget, ds.crystalWorldPos, lerpAmount);
    controls.update();
    invalidate();

    // Ceremony ended
    if (t >= 1) {
      controls.target.copy(ds.savedTarget);
      controls.update();
      ds.active = false;
      invalidate();
    }
  });
}
