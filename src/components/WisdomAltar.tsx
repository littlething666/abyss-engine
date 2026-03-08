'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame, useUniforms } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import { uiStore } from '../store/uiStore';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useSubjectColor, useSubjectGeometry } from '../utils/geometryMapping';

// ============================================================================
// Module-level shared geometries (created once, reused across all renders)
// ============================================================================

// Base pedestal - wider bottom cylinder
const basePedestalGeometry = new THREE.CylinderGeometry(0.6, 0.7, 0.3, 8);

// Top platform - narrower upper cylinder
const topPlatformGeometry = new THREE.CylinderGeometry(0.4, 0.5, 0.8, 8);

// Decorative ring - ring around the top platform
const decorativeRingGeometry = new THREE.RingGeometry(0.45, 0.55, 32);

// Glow ring - ground-level ambient glow
const glowRingGeometry = new THREE.RingGeometry(0.5, 0.9, 32);

/**
 * WisdomAltar component - The central crystal at [0,0]
 * A golden/amber cylindrical monument representing accumulated knowledge
 * Clicking it emits an event to open the Discovery Altar study panel
 *
 * Now supports multi-floor architecture:
 * - Uses subject-defined geometry from JSON
 * - Applies subject color to altar materials
 *
 * Optimized with memoized geometries and materials for performance
 */
export const WisdomAltar: React.FC = () => {
  const rotatingRingRef = useRef<THREE.Mesh>(null);
  const altarUniforms = useUniforms(
    {
      centralEmissive: 0.4,
    },
    'wisdomAltar',
  );
  const { centralEmissive } = altarUniforms;

  const handleClick = () => {
    // Open the Discovery Modal using UI store
    uiStore.getState().openDiscoveryModal();
  };

  const handlePointerOver = () => {
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
  };

  // Get current subject ID from store
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId);

  // Get subject-specific altar geometry
  const altarGeometry = useSubjectGeometry(currentSubjectId, 'altar');

  // Get subject color for the altar
  const subjectColor = useSubjectColor(currentSubjectId);

  // Memoized materials with subject color applied
  const materials = useMemo(() => {
    // Darken/lighten the subject color for different elements
    const baseColor = subjectColor;

    // Generate darker variant for pedestal
    const pedestalColor = baseColor;

    // Generate lighter variant for top platform
    const platformColor = baseColor;

    // Generate glowing variant for central crystal
    const crystalColor = baseColor;

    const basePedestal = new THREE.MeshStandardNodeMaterial({
      color: pedestalColor,
      metalness: 0.4,
      roughness: 0.5,
    });

    const topPlatform = new THREE.MeshStandardNodeMaterial({
      color: platformColor,
      metalness: 0.5,
      roughness: 0.4,
    });

    const centralCrystal = new THREE.MeshStandardNodeMaterial({
      color: crystalColor,
      metalness: 0.6,
      roughness: 0.3,
      emissive: crystalColor,
      emissiveIntensity: 1,
      emissiveNode: color(crystalColor).mul(centralEmissive),
    });

    const glowRing = new THREE.MeshBasicNodeMaterial({
      color: crystalColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    return {
      // Base pedestal material - uses subject color
      basePedestal,
      // Top platform material - uses subject color
      topPlatform,
      // Central crystal material - glowing subject color
      centralCrystal,
      // Glow ring material - semi-transparent subject color
      glowRing,
    };
  }, [subjectColor, centralEmissive]);

  useFrame(() => {
    const elapsedTime = performance.now() / 1000;
    const pulse = 0.4 + Math.sin(elapsedTime * 2) * 0.15;

    centralEmissive.value = pulse;

    if (rotatingRingRef.current) {
      rotatingRingRef.current.rotation.y = elapsedTime * 0.3;
    }
  });

  return (
    <group
      position={[0, 0, 0]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Base pedestal */}
      <mesh position={[0, -0.15, 0]} geometry={basePedestalGeometry}>
        <primitive object={materials.basePedestal} attach="material" />
      </mesh>

      {/* Main altar body / top platform */}
      <mesh position={[0, 0.25, 0]} geometry={topPlatformGeometry}>
        <primitive object={materials.topPlatform} attach="material" />
      </mesh>

      {/* Decorative ring around top platform */}
      <mesh
        position={[0, 0.65, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={decorativeRingGeometry}
      >
        <primitive object={materials.topPlatform} attach="material" />
      </mesh>

      {/* Central crystal - subject-specific geometry */}
      <mesh position={[0, 0.75, 0]} geometry={altarGeometry}>
        <primitive object={materials.centralCrystal} attach="material" />
      </mesh>

      {/* Rotating ritual glow ring */}
      <mesh
        ref={rotatingRingRef}
        geometry={decorativeRingGeometry}
        position={[0, 0.65, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <primitive object={materials.glowRing} attach="material" />
      </mesh>

      {/* Glow ring on ground */}
      <mesh
        position={[0, 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={glowRingGeometry}
      >
        <primitive object={materials.glowRing} attach="material" />
      </mesh>
    </group>
  );
};

export default WisdomAltar;
