'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import type { TopicIconName } from '@/types/core';
import {
  createCrystalLabelTexture,
  type CrystalLabelTextureResult,
} from '@/graphics/labels/crystalLabelTexture';
import {
  createCrystalLabelMaterial,
  type CrystalLabelMaterialHandles,
} from '@/graphics/labels/crystalLabelMaterial';
import {
  LABEL_LOCAL_Y,
  LABEL_RENDER_ORDER,
  LABEL_WORLD_HEIGHT,
} from '@/graphics/labels/crystalLabelConstants';

interface CrystalLabelBillboardProps {
  topicKey: string;
  text: string;
  /**
   * Optional Lucide icon glyph rendered to the left of the text. Vector
   * data flows from the build-time-generated `topicIconNodes.ts`; runtime
   * never imports lucide / lucide-react.
   */
  iconName?: TopicIconName;
  /** Per-frame-updated opacity ref, keyed by topicKey. 0 hides the mesh. */
  opacitiesRef: React.MutableRefObject<Map<string, number>>;
  /** Override the default local Y offset. */
  localY?: number;
}

/**
 * GPU depth-aware billboard label. Rotates to face the camera each frame and
 * lets the material's TSL opacity node fade it smoothly when any scene
 * geometry occludes the label.
 */
export const CrystalLabelBillboard: React.FC<CrystalLabelBillboardProps> = ({
  topicKey,
  text,
  iconName,
  opacitiesRef,
  localY = LABEL_LOCAL_Y,
}) => {
  const textureResult = useMemo<CrystalLabelTextureResult>(
    () => createCrystalLabelTexture(text, iconName),
    [text, iconName],
  );
  const materialHandles = useMemo<CrystalLabelMaterialHandles>(
    () => createCrystalLabelMaterial(textureResult.texture),
    [textureResult.texture],
  );
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const meshRef = useRef<THREE.Mesh>(null);

  const scaleVec = useMemo(() => {
    const width = LABEL_WORLD_HEIGHT * textureResult.aspect;
    return new THREE.Vector3(width, LABEL_WORLD_HEIGHT, 1);
  }, [textureResult.aspect]);

  useEffect(() => {
    return () => {
      textureResult.texture.dispose();
      materialHandles.material.dispose();
      geometry.dispose();
    };
  }, [geometry, materialHandles.material, textureResult.texture]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const opacity = opacitiesRef.current.get(topicKey) ?? 0;
    const isVisible = opacity > 0;
    mesh.visible = isVisible;
    if (!isVisible) return;
    mesh.quaternion.copy(camera.quaternion);
    materialHandles.baseOpacityUniform.value = opacity;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={materialHandles.material}
      scale={scaleVec}
      position-y={localY}
      renderOrder={LABEL_RENDER_ORDER}
      frustumCulled={false}
    />
  );
};

export default CrystalLabelBillboard;
