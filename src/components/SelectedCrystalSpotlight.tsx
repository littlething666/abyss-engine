'use client'

import React, { useState } from 'react'
import * as THREE from 'three/webgpu'
import { SpotLight } from '@react-three/drei/webgpu'

interface SelectedCrystalSpotlightProps {
  spotlightPosition: [number, number, number]
  spotlightTarget: [number, number, number]
  spotlightOpacity: number
}

const SPOTLIGHT_RADIUS_TOP = 0.1
const SPOTLIGHT_RADIUS_BOTTOM = 0.55
const SPOTLIGHT_ANGLE_POWER = 4
const SPOTLIGHT_INTENSITY = 1.2
const SPOTLIGHT_DISTANCE = 5
const SPOTLIGHT_ANGLE = 0.35
const SPOTLIGHT_ATTENUATION = 10
const SPOTLIGHT_PENUMBRA = 0.2

export const SelectedCrystalSpotlight: React.FC<SelectedCrystalSpotlightProps> = ({
  spotlightPosition,
  spotlightTarget,
  spotlightOpacity,
}) => {
  const [spotlightTargetRef] = useState(() => new THREE.Object3D())

  return (
    <>
      <SpotLight
        castShadow
        target={spotlightTargetRef}
        position={spotlightPosition}
        penumbra={SPOTLIGHT_PENUMBRA}
        radiusTop={SPOTLIGHT_RADIUS_TOP}
        radiusBottom={SPOTLIGHT_RADIUS_BOTTOM}
        distance={SPOTLIGHT_DISTANCE}
        angle={SPOTLIGHT_ANGLE}
        attenuation={SPOTLIGHT_ATTENUATION}
        anglePower={SPOTLIGHT_ANGLE_POWER}
        intensity={SPOTLIGHT_INTENSITY}
        opacity={spotlightOpacity}
      />
      <primitive object={spotlightTargetRef} position={spotlightTarget} />
    </>
  )
}
