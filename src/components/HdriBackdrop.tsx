'use client';

import React, { useEffect } from 'react';
import { useLoader, useThree } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const HdriBackdrop: React.FC = () => {
  const scene = useThree((state) => state.scene);
  const renderer = useThree((state) => state.renderer);
  const texture = useLoader(
    HDRLoader,
    '/hdri/kloppenheim_02_1k.hdr',
    (loader) => {
      loader.setDataType(THREE.FloatType);
    },
  );

  useEffect(() => {
    if (!texture.image) {
      return;
    }

    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    let envRenderTarget: ReturnType<typeof pmremGenerator.fromEquirectangular> | null = null;

    try {
      envRenderTarget = pmremGenerator.fromEquirectangular(texture);
      if (envRenderTarget?.texture) {
        scene.environment = envRenderTarget.texture;
      }
    } catch (error) {
      console.warn('[Scene] Failed to generate HDR environment map.', error);
    }

    return () => {
      scene.environment = null;
      if (envRenderTarget?.texture) {
        envRenderTarget.texture.dispose();
      }
      if (envRenderTarget) {
        envRenderTarget.dispose();
      }
      pmremGenerator.dispose();
    };
  }, [scene, renderer, texture]);

  return null;
};

export default HdriBackdrop;
