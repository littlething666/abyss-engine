'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { Billboard, Sparkles } from '@react-three/drei/webgpu';
import { selectIsAnyModalOpen, uiStore } from '../store/uiStore';
import { useRemainingRitualCooldownMs } from '../features/progression';
import { useSceneInvalidator } from '../hooks/useSceneInvalidator';
import {
  createAltarMaterialBundle,
  createAltarRitualUniforms,
  getAltarFragmentSpecs,
  getFracturedBaseGeometry,
  getNexusCrystalGeometry,
} from '../graphics/altar';
import { CUBE_REFLECTION_EXCLUDED_LAYER } from '../constants/sceneLayers';
import { MentorBubble } from './MentorBubble';

/**
 * Visual size of the altar vs. unscaled design geometry: world scale = 1 / divisor.
 * Increase divisor to make the altar smaller; decrease to make it larger (e.g. 1.25 vs 1.5).
 */
export const ALTAR_DESIGN_SCALE_DIVISOR = 1.25;
const ALTAR_SCALE = 1 / ALTAR_DESIGN_SCALE_DIVISOR;

/** Ground ring radii in design units (scaled by `ALTAR_SCALE` with the rest of the monument). */
const GROUND_RING_INNER = 0.5;
const GROUND_RING_OUTER = 1.0;

const groundRingGeometry = new THREE.RingGeometry(GROUND_RING_INNER, GROUND_RING_OUTER, 32);

/** Fractured base cylinder height (see `getFracturedBaseGeometry`). Gap above platform ≈ this value. */
const PLATFORM_HEIGHT = 0.35;
const PLATFORM_TOP_Y = PLATFORM_HEIGHT / 1.5;
/** Nexus mesh local half-extent along Y (double-terminated hex crystal ~1.6 tall → ~0.8). */
const NEXUS_HALF_HEIGHT = 0.8;
/**
 * Vertical center of the nexus so (platform top → crystal bottom) ≈ platform height:
 * centerY - NEXUS_HALF_HEIGHT = PLATFORM_TOP_Y + PLATFORM_HEIGHT
 */
export const NEXUS_CENTER_Y = PLATFORM_TOP_Y + PLATFORM_HEIGHT + NEXUS_HALF_HEIGHT;

/** Local-space bob; world amplitude = this × `ALTAR_SCALE` (scales down with a smaller altar). */
export const NEXUS_BOB_AMPLITUDE_LOCAL = 0.08;

/** Fragment vertical bob in the same local space as `FRAGMENT_ORBITS` (scaled by `ALTAR_SCALE` in world). */
const FRAGMENT_BOB_READY_LOCAL = 0.14;
const FRAGMENT_BOB_COOLDOWN_LOCAL = 0.04;

/** Sparkles field / particle size in altar local space (inherit `ALTAR_SCALE` toward world). */
const SPARKLES_FIELD_SCALE = 1.8;
const SPARKLES_POINT_SIZE = 2.4;

/** Cadence of the wall-clock tick that re-derives the ritual cooldown remaining ms. */
const COOLDOWN_TICK_INTERVAL_MS = 1000;

/** Orbital parameters per fragment (radius, base height, angular speed, phase, bob phase). */
const FRAGMENT_ORBITS: ReadonlyArray<{
  radius: number;
  yBase: number;
  speed: number;
  phase: number;
  bobPhase: number;
}> = [
  { radius: 0.82, yBase: 0.75, speed: 0.38, phase: 0.0, bobPhase: 0.2 },
  { radius: 0.95, yBase: 1.05, speed: -0.31, phase: 1.1, bobPhase: 0.9 },
  { radius: 0.74, yBase: 1.35, speed: 0.42, phase: 2.3, bobPhase: 1.4 },
  { radius: 1.05, yBase: 0.9, speed: -0.36, phase: 3.6, bobPhase: 0.5 },
  { radius: 0.88, yBase: 1.6, speed: 0.29, phase: 4.2, bobPhase: 2.1 },
  { radius: 0.78, yBase: 1.85, speed: -0.44, phase: 5.0, bobPhase: 1.7 },
];

/**
 * Floating Crystal Nexus — central monument at grid origin.
 * Subject-neutral; ritual readiness drives glow and motion intensity.
 */
export const WisdomAltar: React.FC = () => {
  const environmentMap = useThree((state) => state.scene.environment);
  const nexusGroupRef = useRef<THREE.Group>(null);
  const fragmentRefs = useRef<Array<THREE.Mesh | null>>([]);
  const sparklesRef = useRef<THREE.InstancedMesh | null>(null);

  const ritualUniforms = useMemo(() => createAltarRitualUniforms(), []);

  const bundle = useMemo(
    () => createAltarMaterialBundle(environmentMap ?? null, ritualUniforms),
    [environmentMap, ritualUniforms],
  );

  const { nexus, base, fragment, groundRing } = bundle;
  const fragmentSpecs = useMemo(() => getAltarFragmentSpecs(), []);

  const nexusGeometry = useMemo(() => getNexusCrystalGeometry(), []);
  const baseGeometry = useMemo(() => getFracturedBaseGeometry(), []);

  const handleClick = () => {
    uiStore.getState().openDiscoveryModal();
  };

  const handlePointerOver = () => {
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
  };

  // Phase 2 step 10 — WisdomAltar cooldown-poll restructure.
  // The data source flips from the legacy `useStudyStore.getRemainingRitualCooldownMs`
  // imperative getter to the `useRemainingRitualCooldownMs(atMs)` hook. The hook
  // subscribes to `lastRitualSubmittedAt` on the new study-session store and
  // derives remaining ms against the supplied `atMs`; we still need a wall-clock
  // tick to advance `atMs` (the hook would otherwise return a stale value between
  // ritual submissions). The modal-open guard is preserved — while any modal is
  // open we freeze the tick, which freezes the derived availability without
  // ever calling the hook conditionally.
  const [now, setNow] = useState(() => Date.now());
  const remainingCooldownMs = useRemainingRitualCooldownMs(now);
  const isRitualSubmissionAvailable = remainingCooldownMs <= 0;
  const { isPaused, invalidate } = useSceneInvalidator();

  useLayoutEffect(() => {
    const mesh = sparklesRef.current;
    if (!mesh) {
      return;
    }
    mesh.layers.set(CUBE_REFLECTION_EXCLUDED_LAYER);
  }, [isRitualSubmissionAvailable, isPaused]);

  useEffect(() => {
    const tick = () => {
      if (selectIsAnyModalOpen(uiStore.getState())) {
        return;
      }
      setNow(Date.now());
    };

    tick();
    const timer = window.setInterval(tick, COOLDOWN_TICK_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useFrame(() => {
    if (isPaused) {
      return;
    }

    const elapsedTime = performance.now() / 1000;
    const ready = isRitualSubmissionAvailable && !isPaused;

    const glowIntensity = ready ? 1.0 : 0.25;
    const cycleSpeed = ready ? 1.0 : 0.2;
    const pulseAmplitude = ready ? 0.3 : 0.05;
    const groundRingOpacity = ready ? 0.58 : 0.14;

    ritualUniforms.glowIntensity.value = glowIntensity;
    ritualUniforms.cycleSpeed.value = cycleSpeed;
    ritualUniforms.pulseAmplitude.value = pulseAmplitude;
    ritualUniforms.groundRingOpacity.value = groundRingOpacity;

    const speedMul = ready ? 2.0 : 0.12;

    if (nexusGroupRef.current) {
      const g = nexusGroupRef.current;
      g.position.y = NEXUS_CENTER_Y + Math.sin(elapsedTime * 0.8) * NEXUS_BOB_AMPLITUDE_LOCAL;
      g.rotation.y = elapsedTime * 0.15;
      const s = 1 + Math.sin(elapsedTime * 0.5) * 0.02;
      g.scale.setScalar(s);
    }

    for (let i = 0; i < FRAGMENT_ORBITS.length; i++) {
      const mesh = fragmentRefs.current[i];
      const orbit = FRAGMENT_ORBITS[i];
      if (!mesh || !orbit) continue;

      const t = elapsedTime * orbit.speed * speedMul + orbit.phase;
      const x = Math.cos(t) * orbit.radius;
      const z = Math.sin(t) * orbit.radius;
      const bobAmp = ready ? FRAGMENT_BOB_READY_LOCAL : FRAGMENT_BOB_COOLDOWN_LOCAL;
      const y = orbit.yBase + Math.sin(elapsedTime * 1.15 + orbit.bobPhase) * bobAmp;
      mesh.position.set(x, y, z);
      mesh.rotation.x = elapsedTime * 0.4 + i * 0.5;
      mesh.rotation.y = elapsedTime * 0.55 + i * 0.3;
    }

    invalidate();
  });

  return (
    <group
      position={[0, 0, 0]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <group scale={[ALTAR_SCALE, ALTAR_SCALE, ALTAR_SCALE]}>
        <mesh position={[0, PLATFORM_HEIGHT / 2, 0]} geometry={baseGeometry} castShadow receiveShadow>
          <primitive object={base} attach="material" />
        </mesh>

        <group ref={nexusGroupRef} position={[0, NEXUS_CENTER_Y, 0]}>
          <mesh geometry={nexusGeometry} castShadow receiveShadow>
            <primitive object={nexus} attach="material" />
          </mesh>
        </group>

        {fragmentSpecs.map((spec, i) => (
          <mesh
            key={i}
            ref={(el: THREE.Mesh | null) => {
              fragmentRefs.current[i] = el;
            }}
            geometry={spec.geometry}
            scale={spec.scale}
            castShadow
            receiveShadow
          >
            <primitive object={fragment} attach="material" />
          </mesh>
        ))}

        {isRitualSubmissionAvailable && !isPaused && (
          <Billboard position={[0, NEXUS_CENTER_Y, 0]}>
            <Sparkles
              ref={sparklesRef}
              count={12}
              scale={SPARKLES_FIELD_SCALE}
              size={SPARKLES_POINT_SIZE}
              speed={3.2}
              color="#ffe8cc"
            />
          </Billboard>
        )}

        <mesh
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={groundRingGeometry}
        >
          <primitive object={groundRing} attach="material" />
        </mesh>

        <MentorBubble />
      </group>
    </group>
  );
};

export default WisdomAltar;
