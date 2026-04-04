'use client'

import React, { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'

/** Defaults aligned with three.js webgpu sky example (art direction hub). */
export const SCENE_SKY_DEFAULTS = {
  scale: 450_000,
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  /** Degrees above horizon */
  elevation: 2.5,
  /** Degrees, 0 = +Z */
  azimuth: 180,
  cloudCoverage: 0.4,
  cloudDensity: 0.4,
  cloudElevation: 0.5,
} as const

export interface SceneSkyProps {
  /** Filled with normalized direction toward the sun (world space). */
  sunDirectionRef: React.MutableRefObject<THREE.Vector3>
}

/**
 * WebGPU Preetham skydome + clouds. Must sit inside a Canvas with a large camera far plane.
 */
export const SceneSky: React.FC<SceneSkyProps> = ({ sunDirectionRef }) => {
  const sky = useMemo(() => {
    const mesh = new SkyMesh()
    mesh.scale.setScalar(SCENE_SKY_DEFAULTS.scale)
    // Scene Fog uses depth/distance; SkyMesh snaps to camera far — would otherwise blend to fogColor.
    mesh.material.fog = false
    mesh.frustumCulled = false
    return mesh
  }, [])

  useLayoutEffect(() => {
    const d = SCENE_SKY_DEFAULTS
    sky.turbidity.value = d.turbidity
    sky.rayleigh.value = d.rayleigh
    sky.mieCoefficient.value = d.mieCoefficient
    sky.mieDirectionalG.value = d.mieDirectionalG
    sky.cloudCoverage.value = d.cloudCoverage
    sky.cloudDensity.value = d.cloudDensity
    sky.cloudElevation.value = d.cloudElevation

    const sun = new THREE.Vector3()
    const phi = THREE.MathUtils.degToRad(90 - d.elevation)
    const theta = THREE.MathUtils.degToRad(d.azimuth)
    sun.setFromSphericalCoords(1, phi, theta)
    sky.sunPosition.value.copy(sun)
    sunDirectionRef.current.copy(sun)
  }, [sky, sunDirectionRef])

  return <primitive object={sky} />
}

const SUN_LIGHT_DISTANCE = 120

export interface SunSyncedDirectionalLightProps {
  sunDirectionRef: React.MutableRefObject<THREE.Vector3>
  intensity?: number
  color?: string
  castShadow?: boolean
}

/**
 * Key light: direction matches analytic sky sun vector.
 */
export const SunSyncedDirectionalLight: React.FC<SunSyncedDirectionalLightProps> = ({
  sunDirectionRef,
  intensity = 1.15,
  color = '#ffffff',
  castShadow = true,
}) => {
  const lightRef = useRef<THREE.DirectionalLight>(null)

  useLayoutEffect(() => {
    const light = lightRef.current
    if (!light) {
      return
    }
    const sun = sunDirectionRef.current
    light.position.set(
      sun.x * SUN_LIGHT_DISTANCE,
      sun.y * SUN_LIGHT_DISTANCE,
      sun.z * SUN_LIGHT_DISTANCE,
    )
    light.target.position.set(0, 0, 0)
    light.target.updateMatrixWorld()
  }, [sunDirectionRef])

  return (
    <directionalLight ref={lightRef} intensity={intensity} color={color} castShadow={castShadow}>
      <object3D attach="target" position={[0, 0, 0]} />
    </directionalLight>
  )
}
