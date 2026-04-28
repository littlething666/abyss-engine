'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { Billboard } from '@react-three/drei/webgpu';
import { tryEnqueueBubbleClick, useMentorStore, type MentorMood } from '../features/mentor';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { NEXUS_BOB_AMPLITUDE_LOCAL, NEXUS_CENTER_Y } from './WisdomAltar';

const BUBBLE_VERTICAL_OFFSET_LOCAL = 1.25;
const DISC_RADIUS_LOCAL = 0.22;
const RING_INNER_LOCAL = 0.24;
const RING_OUTER_LOCAL = 0.30;
const PULSE_FREQUENCY_HZ = 1.4;
const PULSE_AMPLITUDE = 0.07;
const NEUTRAL_DISC_OPACITY = 0.7;
const NEUTRAL_RING_OPACITY = 0.55;
const ACTIVE_DISC_OPACITY = 0.92;
const ACTIVE_RING_OPACITY = 0.95;

const MOOD_COLOR: Record<MentorMood, string> = {
  neutral: '#9bc1ff',
  cheer: '#ffd45a',
  tease: '#ff7ec9',
  concern: '#ff9b6b',
  celebrate: '#7df0e4',
  hint: '#c89bff',
};

// Module-static — matches WisdomAltar's `groundRingGeometry` pattern.
const discGeometry = new THREE.CircleGeometry(DISC_RADIUS_LOCAL, 32);
const ringGeometry = new THREE.RingGeometry(RING_INNER_LOCAL, RING_OUTER_LOCAL, 32);

/**
 * Floating mentor bubble — small WebGPU-safe billboard above the nexus that
 * mirrors the queued/current mentor plan's mood and is the click target for
 * `mentor.bubble.click`. Reduced motion disables the scale pulse; queued
 * state then surfaces via opacity / emissive only.
 *
 * Click selection is delegated to `tryEnqueueBubbleClick()` so the bubble
 * and HUD Quick Actions "🗣️ Mentor" item share identical semantics.
 */
export const MentorBubble: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const reducedMotion = useReducedMotion();

  const mood = useMentorStore((s) => {
    const head = s.currentDialog ?? s.dialogQueue[0] ?? null;
    return head?.messages[0]?.mood ?? 'neutral';
  });
  const isActive = useMentorStore(
    (s) => s.currentDialog !== null || s.dialogQueue.length > 0,
  );

  const discMaterial = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.opacity = NEUTRAL_DISC_OPACITY;
    return m;
  }, []);
  const ringMaterial = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.opacity = NEUTRAL_RING_OPACITY;
    return m;
  }, []);

  // Sync color on mood change rather than every frame.
  useEffect(() => {
    const hex = MOOD_COLOR[mood] ?? MOOD_COLOR.neutral;
    discMaterial.color.set(hex);
    ringMaterial.color.set(hex);
  }, [mood, discMaterial, ringMaterial]);

  // Dispose materials on unmount; geometries are module-static.
  useEffect(
    () => () => {
      discMaterial.dispose();
      ringMaterial.dispose();
    },
    [discMaterial, ringMaterial],
  );

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const t = performance.now() / 1000;
    // Bob in lockstep with the nexus group.
    group.position.y =
      NEXUS_CENTER_Y +
      BUBBLE_VERTICAL_OFFSET_LOCAL +
      Math.sin(t * 0.8) * NEXUS_BOB_AMPLITUDE_LOCAL;

    if (reducedMotion) {
      group.scale.setScalar(1);
      discMaterial.opacity = isActive ? ACTIVE_DISC_OPACITY : NEUTRAL_DISC_OPACITY;
      ringMaterial.opacity = isActive ? ACTIVE_RING_OPACITY : NEUTRAL_RING_OPACITY;
      return;
    }

    if (isActive) {
      const phase = t * PULSE_FREQUENCY_HZ * Math.PI * 2;
      group.scale.setScalar(1 + Math.sin(phase) * PULSE_AMPLITUDE);
      discMaterial.opacity = ACTIVE_DISC_OPACITY;
      ringMaterial.opacity = ACTIVE_RING_OPACITY * (0.85 + 0.15 * Math.sin(phase));
    } else {
      group.scale.setScalar(1);
      discMaterial.opacity = NEUTRAL_DISC_OPACITY;
      ringMaterial.opacity = NEUTRAL_RING_OPACITY;
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    tryEnqueueBubbleClick();
  };
  const stop = (event: ThreeEvent<PointerEvent>) => event.stopPropagation();
  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
  };
  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'auto';
  };

  return (
    <Billboard
      ref={groupRef}
      position={[0, NEXUS_CENTER_Y + BUBBLE_VERTICAL_OFFSET_LOCAL, 0]}
      onClick={handleClick}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <mesh geometry={discGeometry}>
        <primitive object={discMaterial} attach="material" />
      </mesh>
      <mesh geometry={ringGeometry}>
        <primitive object={ringMaterial} attach="material" />
      </mesh>
    </Billboard>
  );
};

export default MentorBubble;
