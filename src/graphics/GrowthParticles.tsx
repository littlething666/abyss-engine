'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useUniform } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { useSceneInvalidator } from '../hooks/useSceneInvalidator';

interface GrowthParticlesProps {
  position: [number, number, number];
  active: boolean;
  scope?: string;
}

const sanitizeUniformName = (value: string) => `u_${value.replace(/[^a-zA-Z0-9_]/g, '_')}`;

export function GrowthParticles({ position, active, scope }: GrowthParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 24;
  const { isPaused } = useSceneInvalidator();
  const scopeId = useMemo(
    () => scope ?? `growth_particles_${position[0]}_${position[1]}_${position[2]}`,
    [scope, position],
  );
  const uniformName = useMemo(() => sanitizeUniformName(`${scopeId}_opacity`), [scopeId]);
  const opacity = useUniform(uniformName, 1);

  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 0.3;
      pos[i3 + 1] = Math.random() * 0.6;
      pos[i3 + 2] = (Math.random() - 0.5) * 0.3;
      col[i3] = 1;
      col[i3 + 1] = 1;
      col[i3 + 2] = 1;
      sz[i] = Math.random() * 0.04 + 0.02;
    }

    return { positions: pos, colors: col, sizes: sz };
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [positions, colors, sizes]);

  const material = useMemo(() => {
    const m = new THREE.PointsNodeMaterial({
      color: '#fef08c',
      size: 0.06,
      transparent: true,
      depthWrite: false,
      opacityNode: opacity,
      blending: THREE.AdditiveBlending,
    });
    return m;
  }, [opacity]);

  useEffect(() => {
    if (!active) {
      return;
    }
    opacity.value = 1;
    if (pointsRef.current) {
      pointsRef.current.visible = true;
    }
  }, [active, opacity]);

  useFrame((_state, delta) => {
    if (isPaused || !pointsRef.current || !active) {
      return;
    }

    pointsRef.current.position.y += delta * 1.8;
    opacity.value = Math.max(0, opacity.value - delta * 2);

    if (opacity.value <= 0) {
      pointsRef.current.visible = false;
    }
  });

  return active ? (
    <points
      ref={pointsRef}
      position={position}
      geometry={geometry}
      material={material}
    />
  ) : null;
}
