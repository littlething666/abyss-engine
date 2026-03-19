'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { Billboard, Sparkles } from '@react-three/drei/webgpu';
import { uiStore } from '../store/uiStore';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useSubjectColor, useSubjectGeometry } from '../utils/geometryMapping';
import { useSceneInvalidator } from '../hooks/useSceneInvalidator';

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
  const environmentMap = useThree((state) => state.scene.environment);

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
  const getRemainingRitualCooldownMs = useStudyStore((state) => state.getRemainingRitualCooldownMs);
  const [isRitualSubmissionAvailable, setIsRitualSubmissionAvailable] = useState(true);
  const { isPaused } = useSceneInvalidator();

  // Get subject-specific altar geometry
  const altarGeometry = useSubjectGeometry(currentSubjectId, 'altar');

  // Get subject color for the altar
  const subjectColor = useSubjectColor(currentSubjectId);

  // Memoized materials with subject color applied
  const materials = useMemo(() => {
    const baseColor = subjectColor;
    const pedestalTint = new THREE.Color(baseColor).offsetHSL(0.0, 0.0, -0.06);
    const platformTint = new THREE.Color(baseColor).offsetHSL(0.0, 0.0, 0.08);
    const crystalTint = new THREE.Color(baseColor).offsetHSL(0.0, -0.05, 0.05);
    const ringTint = new THREE.Color(baseColor).offsetHSL(0.0, 0.15, -0.12);

    // Generate darker variant for pedestal
    const basePedestal = new THREE.MeshPhysicalNodeMaterial({
      color: pedestalTint,
      metalness: 0.92,
      roughness: 0.22,
      envMap: environmentMap || null,
      envMapIntensity: 2.0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.4,
      ior: 2.2,
      side: THREE.FrontSide,
    });

    const topPlatform = new THREE.MeshPhysicalNodeMaterial({
      color: platformTint,
      metalness: 0.6,
      roughness: 0.28,
      envMap: environmentMap || null,
      envMapIntensity: 2.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      ior: 1.9,
      emissiveIntensity: 0.3,
      emissive: platformTint,
    });

    const glowRing = new THREE.MeshBasicNodeMaterial({
      color: ringTint,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    const centralCrystal = new THREE.MeshPhysicalNodeMaterial({
      color: crystalTint,
      metalness: 0.05,
      roughness: 0.07,
      transmission: 0.9,
      transparent: true,
      ior: 2.2,
      thickness: 0.55,
      attenuationColor: crystalTint,
      attenuationDistance: 0.8,
      envMap: environmentMap || null,
      envMapIntensity: 1.8,
      clearcoat: 0.25,
      emissive: pedestalTint,
      emissiveIntensity: 0.08,
    });

    return {
      // Base pedestal material - uses subject color
      basePedestal,
      // Top platform material - uses subject color
      topPlatform,
      centralCrystal,
      // Glow ring material - semi-transparent subject color
      glowRing,
    };
  }, [subjectColor, environmentMap]);

  useEffect(() => {
    const updateSubmissionAvailability = () => {
      if (uiStore.getState().isAnyModalOpen) {
        return;
      }

      const remaining = getRemainingRitualCooldownMs(Date.now());
      setIsRitualSubmissionAvailable(remaining <= 0);
    };

    updateSubmissionAvailability();
    const timer = window.setInterval(updateSubmissionAvailability, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [getRemainingRitualCooldownMs]);

  useFrame(() => {
    if (isPaused) {
      return;
    }

    const elapsedTime = performance.now() / 1000;
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
        <primitive
          object={materials.centralCrystal}
          attach="material"
        />
      </mesh>

      {/* Ritual availability glow */}
      {isRitualSubmissionAvailable && !isPaused && (
        <Billboard position={[0, 0.75, 0]}>
          <Sparkles count={17} scale={1.2} size={2.0} speed={3.0} color={'white'} />
        </Billboard>
      )}

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
