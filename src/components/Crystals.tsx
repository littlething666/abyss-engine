'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { ActiveCrystal } from '../types';
import { calculateLevelFromXP } from '../features/progression';
import { useUIStore } from '../store/uiStore';
import { useSubjectColor, useSubjectGeometry } from '../utils/geometryMapping';
import { useTopicMetadata } from '../features/content';
import { GrowthParticles } from '../graphics/GrowthParticles';
import { playLevelUpSound } from '../utils/sound';

const crystalInnerGeometry = new THREE.SphereGeometry(0.15, 8, 6);
const levelIndicatorGeometry = new THREE.SphereGeometry(0.08, 16, 16);
const glowRingGeometry = new THREE.RingGeometry(0.35, 0.55, 32);

interface TopicMetadata {
  title?: string;
  subjectId: string;
  subjectName?: string;
  topicName?: string;
}

export function getCrystalScale(level: number): number {
  const baseScale = 0.6;
  const scaleIncrement = 0.15;
  return baseScale + level * scaleIncrement;
}

interface CrystalsProps {
  crystals: ActiveCrystal[];
  onStartTopicStudySession?: (topicId: string) => void;
  isStudyPanelOpen?: boolean;
}

interface SingleCrystalProps {
  crystal: ActiveCrystal;
  isSelected: boolean;
  topicMeta?: TopicMetadata;
  onSelect: (crystal: ActiveCrystal) => void;
  isStudyPanelOpen: boolean;
}

const SingleCrystal: React.FC<SingleCrystalProps> = ({
  crystal,
  isSelected,
  topicMeta,
  onSelect,
  isStudyPanelOpen,
}) => {
  const [x, z] = crystal.gridPosition;
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const levelRef = useRef<THREE.Mesh>(null);
  const glowRingRef = useRef<THREE.Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const animationRef = useRef({
    start: performance.now(),
    from: 0,
    to: 0,
    running: false,
  });
  const growthRef = useRef({
    phase: 0,
    progress: 0,
  });

  const subjectColor = useSubjectColor(topicMeta?.subjectId || null);
  const crystalGeometry = useSubjectGeometry(topicMeta?.subjectId || null, 'crystal');
  const colors = useMemo(() => ({
    outerColor: subjectColor,
    innerColor: subjectColor,
    emissiveColor: subjectColor,
  }), [subjectColor]);
  const level = calculateLevelFromXP(crystal.xp);
  const [targetScale, setTargetScale] = useState(() => getCrystalScale(level));
  const [showParticles, setShowParticles] = useState(false);
  const previousLevel = useRef(level);
  const pendingTargetScale = useRef<number | null>(null);
  const pendingParticles = useRef(false);
  const pendingLevelUpSound = useRef(false);
  const burstTimerRef = useRef<number | null>(null);
  const initialized = useRef(false);

  const triggerParticleBurst = () => {
    if (burstTimerRef.current !== null) {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    setShowParticles(true);
    burstTimerRef.current = window.setTimeout(() => {
      setShowParticles(false);
      burstTimerRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    const nextScale = getCrystalScale(level);
    if (!initialized.current) {
      initialized.current = true;
      pendingTargetScale.current = null;
      setTargetScale(nextScale);
      const currentScale = groupRef.current?.scale.x ?? 0;
      animationRef.current = {
        start: performance.now(),
        from: currentScale,
        to: nextScale,
        running: true,
      };
      growthRef.current = {
        phase: 0,
        progress: 0,
      };
      invalidate();
      return;
    }

    if (level === previousLevel.current) {
      return;
    }

    if (level > previousLevel.current && isStudyPanelOpen) {
      pendingTargetScale.current = nextScale;
    } else {
      pendingTargetScale.current = null;
      setTargetScale(nextScale);
      if (!isStudyPanelOpen) {
        const currentScale = groupRef.current?.scale.x ?? 0;
        animationRef.current = {
          start: performance.now(),
          from: currentScale,
          to: nextScale,
          running: true,
        };
        growthRef.current = {
          phase: 0,
          progress: 0,
        };
        invalidate();
      }
    }
  }, [level, isStudyPanelOpen, invalidate]);

  useEffect(() => {
    if (isStudyPanelOpen || pendingTargetScale.current === null) {
      return;
    }
    const nextScale = pendingTargetScale.current;
    pendingTargetScale.current = null;
    setTargetScale(nextScale);

    const currentScale = groupRef.current?.scale.x ?? 0;
    animationRef.current = {
      start: performance.now(),
      from: currentScale,
      to: nextScale,
      running: true,
    };
    growthRef.current = {
      phase: 0,
      progress: 0,
    };
    invalidate();
  }, [isStudyPanelOpen, invalidate]);

  useEffect(() => {
    if (level > previousLevel.current && level > 0) {
      if (isStudyPanelOpen) {
        pendingParticles.current = true;
        pendingLevelUpSound.current = true;
      } else {
        playLevelUpSound();
        triggerParticleBurst();
      }
    }

    previousLevel.current = level;
  }, [level, isStudyPanelOpen]);

  useEffect(() => {
    if (!isStudyPanelOpen && pendingParticles.current) {
      pendingParticles.current = false;
      triggerParticleBurst();
      if (pendingLevelUpSound.current) {
        pendingLevelUpSound.current = false;
        playLevelUpSound();
      }
    }
  }, [isStudyPanelOpen]);

  useEffect(() => () => {
    if (burstTimerRef.current !== null) {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
  }, []);

  const selectedEmissiveIntensity = isSelected ? 0.6 : 0.2;
  const selectedEmissiveIntensityInner = isSelected ? 0.9 : 0.4;
  const camera = useThree((state) => state.camera);

  const outerMaterial = useMemo(
    () => {
      const material = new THREE.MeshStandardNodeMaterial({
        color: colors.outerColor,
        metalness: 0.4,
        roughness: 0.3,
        emissive: colors.emissiveColor,
        emissiveIntensity: selectedEmissiveIntensity,
      });
      return material;
    },
    [colors, selectedEmissiveIntensity],
  );

  const innerMaterial = useMemo(
    () => {
      const material = new THREE.MeshStandardNodeMaterial({
        color: colors.innerColor,
        metalness: 0.7,
        roughness: 0.1,
        emissive: colors.emissiveColor,
        transparent: true,
        opacity: 0.8,
        emissiveIntensity: selectedEmissiveIntensityInner,
      });
      return material;
    },
    [colors, selectedEmissiveIntensityInner],
  );

  const levelMaterial = useMemo(
    () => {
      const material = new THREE.MeshStandardNodeMaterial({
        color: '#fbbf24',
        metalness: 0.5,
        roughness: 0.3,
        emissive: '#f59e0b',
        emissiveIntensity: 0.3,
      });
      return material;
    },
    [],
  );

  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicNodeMaterial({
        color: colors.emissiveColor,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [colors.emissiveColor],
  );

  useFrame(() => {
    const state = animationRef.current;
    const elapsedTime = performance.now() / 1000;

    if (groupRef.current) {
      const bob = Math.sin(elapsedTime * 2 + x * 0.5) * 0.03;
      groupRef.current.position.y = 0.3 + bob;
      groupRef.current.rotation.y = isSelected ? elapsedTime * 0.4 : 0;
    }

    if (state.running && groupRef.current) {
      const elapsed = performance.now() - state.start;
      const progress = Math.min(elapsed / 800, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextScale = THREE.MathUtils.lerp(state.from, state.to, eased);
      growthRef.current.progress = progress;

      if (growthRef.current.phase === 0 && progress >= 0.4) {
        growthRef.current.phase = 1;
      }

      groupRef.current.scale.set(nextScale, nextScale, nextScale);

      if (innerRef.current) {
        const innerLift = progress < 0.4 ? progress * 2.5 : 1;
        innerRef.current.position.y = 0.1 * nextScale * innerLift;
      }

      if (levelRef.current && level > 0) {
        const pop = Math.max(0, (progress - 0.4) * 2.5);
        levelRef.current.position.y = 0.4 * nextScale + Math.sin(pop * Math.PI) * 0.15;
      }

      outerMaterial.emissiveIntensity = THREE.MathUtils.lerp(
        selectedEmissiveIntensity,
        selectedEmissiveIntensity + 1.2,
        Math.sin(progress * Math.PI * 6) * 0.5 + 0.5,
      );

      if (progress >= 1) {
        state.running = false;
        growthRef.current.phase = 1;
        growthRef.current.progress = 1;
        outerMaterial.emissiveIntensity = selectedEmissiveIntensity;
        innerRef.current && (innerRef.current.position.y = 0.1 * nextScale);
        if (levelRef.current && level > 0) {
          levelRef.current.position.y = 0.4 * nextScale;
        }
      } else {
        invalidate();
      }
    }

    if (glowRingRef.current) {
      const pulse = 1 + Math.sin(elapsedTime * 3 + x + z) * 0.08;
      glowRingRef.current.quaternion.copy(camera.quaternion);
      glowRingRef.current.scale.setScalar(pulse * (isSelected ? 1.25 : 1));
      glowMaterial.opacity = isSelected ? 0.55 : 0.35;
    }
  });

  return (
    <group ref={groupRef} position={[x, 0.3, z]} scale={[0, 0, 0]}>
      <mesh
        geometry={crystalGeometry}
        material={outerMaterial}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(crystal);
        }}
      />

      <mesh
        geometry={crystalInnerGeometry}
        material={innerMaterial}
        ref={innerRef}
        position={[0, 0.1, 0]}
      />

      {level > 0 && (
        <mesh
          geometry={levelIndicatorGeometry}
          material={levelMaterial}
          ref={levelRef}
          visible={level > 0}
          position={[0, 0, 0]}
        />
      )}

      <GrowthParticles
        position={[0, 0.3, 0]}
        active={showParticles}
      />

      <mesh
        ref={glowRingRef}
        geometry={glowRingGeometry}
        material={glowMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
      />
    </group>
  );
};

export const Crystals: React.FC<CrystalsProps> = ({
  crystals,
  onStartTopicStudySession,
  isStudyPanelOpen = false,
}) => {
  const metadataLookup = useTopicMetadata(crystals.map((crystal) => crystal.topicId));
  const resolvedMetadata = metadataLookup;
  const selectedTopicId = useUIStore((state) => state.selectedTopicId);
  const selectTopic = useUIStore((state) => state.selectTopic);

  if (crystals.length === 0) {
    return <group />;
  }

  const handleCrystalClick = (crystal: ActiveCrystal) => {
    if (selectedTopicId === crystal.topicId) {
      onStartTopicStudySession?.(crystal.topicId);
    } else {
      selectTopic(crystal.topicId);
    }
  };

  return (
    <group>
      {crystals.map((crystal, index) => (
        <SingleCrystal
          key={`${crystal.topicId}-${index}`}
          crystal={crystal}
          isSelected={selectedTopicId === crystal.topicId}
          onSelect={handleCrystalClick}
          topicMeta={resolvedMetadata[crystal.topicId]}
          isStudyPanelOpen={!!isStudyPanelOpen}
        />
      ))}
    </group>
  );
};

export default Crystals;
