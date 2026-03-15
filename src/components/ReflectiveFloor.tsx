'use client';

import React, { useMemo } from 'react';
import { useLoader } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { CubeCamera } from '@react-three/drei/webgpu';
import { float, getParallaxCorrectNormal, pmremTexture, reflectVector, texture, vec3 } from 'three/tsl';
import { GRID_SIZE } from './Grid';
import { useSubjectColor } from '../utils/geometryMapping';
import { useProgressionStore as useStudyStore } from '../features/progression';

const DEFAULT_ROUGHNESS_SCALE = 0.25;
const DEFAULT_METALNESS = 0.05;
const DEFAULT_ENV_MAP_INTENSITY = 1;
const DEFAULT_ROUGHNESS_REPEAT: [number, number] = [2, 2];
const PROJECTION_BOX_HEIGHT = 2;
const TEXTURE_PATH = '/textures/lava/lavatile.jpg';

const useBoxProjectedEnv = (
  envMap: THREE.Texture,
  boxSize: number,
  floorY: number,
) => {
  const projection = getParallaxCorrectNormal(
    reflectVector,
    vec3(boxSize, PROJECTION_BOX_HEIGHT, boxSize),
    vec3(0, floorY - PROJECTION_BOX_HEIGHT / 2, 0),
  );

  return pmremTexture(envMap, projection);
};

interface ReflectiveFloorProps {
  size?: number;
  floorHeight?: number;
  dynamicReflections?: boolean;
  receiveShadow?: boolean;
  roughnessScale?: number;
  metalness?: number;
  envMapIntensity?: number;
  cubeCameraResolution?: number;
}

export const ReflectiveFloor: React.FC<ReflectiveFloorProps> = ({
  size = GRID_SIZE,
  floorHeight = -0.01,
  dynamicReflections = false,
  receiveShadow = true,
  roughnessScale = DEFAULT_ROUGHNESS_SCALE,
  metalness = DEFAULT_METALNESS,
  envMapIntensity = DEFAULT_ENV_MAP_INTENSITY,
  cubeCameraResolution = 512,
}) => {
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId);
  const subjectColor = useSubjectColor(currentSubjectId);
  const floorColor = useMemo(() => {
    const shadedColor = new THREE.Color(subjectColor);
    shadedColor.offsetHSL(0, 0, -0.45);
    return `#${shadedColor.getHexString()}`;
  }, [subjectColor]);

  const roughnessTexture = useLoader(THREE.TextureLoader, TEXTURE_PATH);
  const projectedRoughnessTexture = useMemo(() => {
    const textureCopy = roughnessTexture.clone();
    textureCopy.wrapS = THREE.RepeatWrapping;
    textureCopy.wrapT = THREE.RepeatWrapping;
    textureCopy.repeat.set(...DEFAULT_ROUGHNESS_REPEAT);
    textureCopy.colorSpace = THREE.LinearSRGBColorSpace;
    textureCopy.needsUpdate = true;
    return textureCopy;
  }, [roughnessTexture]);
  const roughnessNode = useMemo(
    () => texture(projectedRoughnessTexture).mul(float(roughnessScale)),
    [projectedRoughnessTexture, roughnessScale],
  );

  const projectionNode = (cubeTexture: THREE.Texture) => useBoxProjectedEnv(cubeTexture, size, floorHeight);
  const frameCount = dynamicReflections ? Infinity : 1;

  return (
    <CubeCamera
      position={[0, floorHeight - 0.01, 0]}
      near={0.1}
      far={1000}
      resolution={cubeCameraResolution}
      frames={frameCount}
    >
      {(reflectionsTexture) => (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, floorHeight, 0]}
          receiveShadow={receiveShadow}
        >
          <planeGeometry args={[size, size]} />
          <meshStandardNodeMaterial
            color={floorColor}
            metalness={metalness}
            roughness={1}
            roughnessNode={roughnessNode}
            envNode={projectionNode(reflectionsTexture)}
            envMapIntensity={envMapIntensity}
          />
        </mesh>
      )}
    </CubeCamera>
  );
};

export default ReflectiveFloor;
