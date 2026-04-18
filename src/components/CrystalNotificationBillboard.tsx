'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';

import type { CrystalNotificationRotationMode } from '@/components/crystalNotification';
import {
  createCrystalGlyphTexture,
  type CrystalGlyphTextureResult,
} from '@/graphics/labels/crystalGlyphTexture';
import {
  createCrystalLabelMaterial,
  type CrystalLabelMaterialHandles,
} from '@/graphics/labels/crystalLabelMaterial';
import {
  CRYSTAL_NOTIFICATION_RENDER_ORDER,
  CRYSTAL_NOTIFICATION_WORLD_HEIGHT,
} from '@/graphics/labels/crystalLabelConstants';
import { stepCrystalNotificationFadeOpacity } from './crystalNotificationFadeStep';

const HOURGLASS_WAIT_S = 3;
const HOURGLASS_SPIN_S = 0.5;
const HOURGLASS_CYCLE_S = HOURGLASS_WAIT_S + HOURGLASS_SPIN_S;
/** One full gear rotation (radians per second) for trial pregeneration. */
const TRIAL_GEAR_RAD_PER_S = (Math.PI * 2) / 2.4;
const MIN_DELTA_CLAMP_S = 1 / 20;

function hourglassRotationRad(elapsedSpinS: number): number {
  const seg = Math.floor(elapsedSpinS / HOURGLASS_CYCLE_S);
  const u = elapsedSpinS - seg * HOURGLASS_CYCLE_S;
  const base = seg * Math.PI;
  if (u < HOURGLASS_WAIT_S) {
    return base;
  }
  const p = Math.min(1, Math.max(0, (u - HOURGLASS_WAIT_S) / HOURGLASS_SPIN_S));
  return base + p * Math.PI;
}

export interface CrystalNotificationBillboardProps {
  topicKey: string;
  glyph: string;
  rotationMode: CrystalNotificationRotationMode;
  /** While true the notification fades in; false starts fade-out. */
  active: boolean;
  /** Same distance-based opacity map as {@link CrystalLabelBillboard}. */
  opacitiesRef: React.MutableRefObject<Map<string, number>>;
  /** Local Y above the bobbing crystal anchor. */
  localY: number;
  onFadeOutComplete?: () => void;
}

/**
 * Depth-aware unicode billboard for crystal notifications. Opacity combines
 * label distance LOD with a local fade envelope, matching topic labels.
 */
export const CrystalNotificationBillboard: React.FC<CrystalNotificationBillboardProps> = ({
  topicKey,
  glyph,
  rotationMode,
  active,
  opacitiesRef,
  localY,
  onFadeOutComplete,
}) => {
  const textureResult = useMemo<CrystalGlyphTextureResult>(
    () => createCrystalGlyphTexture(glyph),
    [glyph],
  );
  const materialHandles = useMemo<CrystalLabelMaterialHandles>(
    () => createCrystalLabelMaterial(textureResult.texture),
    [textureResult.texture],
  );
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const billboardRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const fadeRef = useRef(0);
  const fadeOutNotifiedRef = useRef(false);
  const spinClockStartRef = useRef<number | null>(null);
  const trialGearAngleRef = useRef(0);

  const scaleVec = useMemo(() => {
    const h = CRYSTAL_NOTIFICATION_WORLD_HEIGHT;
    const w = h * textureResult.aspect;
    return new THREE.Vector3(w, h, 1);
  }, [textureResult.aspect]);

  const groupPositionTuple = useMemo((): [number, number, number] => [0, localY, 0], [localY]);

  useEffect(() => {
    return () => {
      textureResult.texture.dispose();
      materialHandles.material.dispose();
      geometry.dispose();
    };
  }, [geometry, materialHandles.material, textureResult.texture]);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, MIN_DELTA_CLAMP_S);

    if (active) {
      fadeOutNotifiedRef.current = false;
    }

    const current = fadeRef.current;
    const next = stepCrystalNotificationFadeOpacity(current, active, dt);
    fadeRef.current = next;

    const labelOpacity = opacitiesRef.current.get(topicKey) ?? 0;
    materialHandles.baseOpacityUniform.value = labelOpacity * next;

    const billboard = billboardRef.current;
    const mesh = meshRef.current;
    if (billboard) {
      const visible = next > 0.001 && labelOpacity > 0.001;
      billboard.visible = visible;
      if (visible) {
        billboard.quaternion.copy(camera.quaternion);
      }
    }

    if (mesh && active && next > 0.01) {
      if (rotationMode === 'hourglass') {
        if (spinClockStartRef.current == null) {
          spinClockStartRef.current = performance.now();
        }
        const start = spinClockStartRef.current;
        const elapsedS = (performance.now() - start) / 1000;
        mesh.rotation.z = hourglassRotationRad(elapsedS);
        trialGearAngleRef.current = 0;
      } else if (rotationMode === 'trial_gear') {
        spinClockStartRef.current = null;
        trialGearAngleRef.current += dt * TRIAL_GEAR_RAD_PER_S;
        mesh.rotation.z = trialGearAngleRef.current;
      } else {
        mesh.rotation.z = 0;
        spinClockStartRef.current = null;
        trialGearAngleRef.current = 0;
      }
    } else if (mesh) {
      mesh.rotation.z = 0;
      spinClockStartRef.current = null;
      trialGearAngleRef.current = 0;
    }

    if (
      !active &&
      next <= 0.001 &&
      !fadeOutNotifiedRef.current &&
      onFadeOutComplete
    ) {
      fadeOutNotifiedRef.current = true;
      onFadeOutComplete();
    }
  });

  return (
    <group position={groupPositionTuple}>
      <group ref={billboardRef}>
        <mesh
          ref={meshRef}
          geometry={geometry}
          material={materialHandles.material}
          scale={scaleVec}
          renderOrder={CRYSTAL_NOTIFICATION_RENDER_ORDER}
          frustumCulled={false}
        />
      </group>
    </group>
  );
};

export default CrystalNotificationBillboard;
