'use client';

import React, { useContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { float, vec3 } from 'three/tsl';

import { BalloonOpacityContext } from '../CrystalBalloonIndicator';

const DIAL_RADIUS = 0.15;
const DIAL_TUBE = 0.009;
const DIAL_GEOMETRY = new THREE.TorusGeometry(DIAL_RADIUS, DIAL_TUBE, 8, 48);

const TICK_RADIUS = DIAL_RADIUS - DIAL_TUBE - 0.012;
const TICK_MAJOR_GEOMETRY = new THREE.CircleGeometry(0.012, 12);
const TICK_MINOR_GEOMETRY = new THREE.CircleGeometry(0.006, 10);

/** Hand: a plane pre-translated so its base sits at pivot (local origin). */
function createHandGeometry(width: number, length: number): THREE.PlaneGeometry {
  const geom = new THREE.PlaneGeometry(width, length);
  geom.translate(0, length * 0.5, 0);
  return geom;
}
const HOUR_HAND_GEOMETRY = createHandGeometry(0.018, 0.074);
const MINUTE_HAND_GEOMETRY = createHandGeometry(0.011, 0.108);

const CENTER_GEOMETRY = new THREE.CircleGeometry(0.016, 18);

const HOUR_MARK_POSITIONS: ReadonlyArray<[number, number, number]> = Array.from(
  { length: 12 },
  (_unused, i) => {
    const angle = -Math.PI / 2 + (i / 12) * Math.PI * 2;
    return [Math.cos(angle) * TICK_RADIUS, Math.sin(angle) * TICK_RADIUS, 0];
  },
);

const HOUR_HAND_PERIOD_S = 6;
const MINUTE_HAND_PERIOD_S = 0.9;
const CLOCK_COLOR_RGB = { r: 0.55, g: 0.95, b: 1.0 } as const;

const MIN_DELTA_CLAMP_S = 1 / 20;

/**
 * Analog-clock glyph — a dial ring with 12 hour marks and two spinning hands,
 * rendered inside a {@link CrystalBalloonIndicator} to evoke "time passing"
 * while content generation is in-flight.
 *
 * Requires {@link BalloonOpacityContext} so the clock fades in lockstep with
 * the surrounding balloon. Throws when rendered outside a balloon, per
 * CLAUDE.md "Explicit Failure".
 */
export const ClockGlyph: React.FC = () => {
  const opacityUniform = useContext(BalloonOpacityContext);
  if (!opacityUniform) {
    throw new Error(
      'ClockGlyph must be rendered inside a <CrystalBalloonIndicator> (BalloonOpacityContext is missing).',
    );
  }

  const hourHandRef = useRef<THREE.Group>(null);
  const minuteHandRef = useRef<THREE.Group>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    mat.colorNode = vec3(
      float(CLOCK_COLOR_RGB.r),
      float(CLOCK_COLOR_RGB.g),
      float(CLOCK_COLOR_RGB.b),
    );
    mat.opacityNode = opacityUniform;
    return mat;
  }, [opacityUniform]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, MIN_DELTA_CLAMP_S);
    if (hourHandRef.current) {
      hourHandRef.current.rotation.z -= (dt * Math.PI * 2) / HOUR_HAND_PERIOD_S;
    }
    if (minuteHandRef.current) {
      minuteHandRef.current.rotation.z -= (dt * Math.PI * 2) / MINUTE_HAND_PERIOD_S;
    }
  });

  return (
    <group>
      <mesh geometry={DIAL_GEOMETRY} material={material} />

      {HOUR_MARK_POSITIONS.map((markPosition, i) => (
        <mesh
          key={i}
          position={markPosition}
          geometry={i % 3 === 0 ? TICK_MAJOR_GEOMETRY : TICK_MINOR_GEOMETRY}
          material={material}
        />
      ))}

      <mesh geometry={CENTER_GEOMETRY} material={material} />

      <group ref={hourHandRef}>
        <mesh geometry={HOUR_HAND_GEOMETRY} material={material} />
      </group>

      <group ref={minuteHandRef}>
        <mesh geometry={MINUTE_HAND_GEOMETRY} material={material} />
      </group>
    </group>
  );
};

export default ClockGlyph;
