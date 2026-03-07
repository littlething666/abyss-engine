'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

interface GrowthParticlesProps {
  position: [number, number, number];
  active: boolean;
}

export function GrowthParticles({ position, active }: GrowthParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 24;

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
      blending: THREE.AdditiveBlending,
    });
    m.opacity = 1;
    return m;
  }, []);

  useFrame((_state, delta) => {
    if (!pointsRef.current || !active) {
      return;
    }

    pointsRef.current.position.y += delta * 1.8;
    material.opacity = Math.max(0, material.opacity - delta * 2);

    if (material.opacity <= 0) {
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
