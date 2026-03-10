 'use client'

import React, { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { abs, float, Fn, instancedBufferAttribute, max, normalWorldGeometry, positionGeometry, positionLocal, pow2, sin, sub, time, uv, vec2, vec3 } from 'three/tsl'

interface MeshTreeProps {
  position?: [number, number, number]
  scale?: number
}

const TREE_MAX_STEPS = 5
const TREE_LENGTH_MULTIPLIER = 0.8
const TREE_BRANCH_COUNT = 5
const TREE_SUB_STEPS = 28

const randomOffset = () => (Math.random() - 0.5) * 2.0

interface TreePayload {
  instanceCount: number
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  data: Float32Array
  attributes: {
    position: THREE.InstancedBufferAttribute
    normal: THREE.InstancedBufferAttribute
    color: THREE.InstancedBufferAttribute
    data: THREE.InstancedBufferAttribute
  }
}

const generateTreePayload = (): TreePayload => {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const data: number[] = []

  let instanceCount = 0

  const newPosition = new THREE.Vector3()
  const position = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const color = new THREE.Color()

  const createTreePart = (angle: number, x: number, y: number, z: number, length: number, count: number) => {
    if (Math.random() > (TREE_MAX_STEPS / Math.max(count, 1)) * 0.25) return

    if (count >= TREE_MAX_STEPS) {
      return
    }

    const newLength = length * TREE_LENGTH_MULTIPLIER
    const newX = x + Math.cos(angle) * length
    const newY = y + Math.sin(angle) * length
    const countSq = Math.min(3.2, count * count)
    const newZ = z + (Math.random() * countSq - countSq / 2) * length

    let size = 30 - count * 8
    if (size > 25) size = 25
    if (size < 10) size = 10

    size = size / 100

    for (let i = 0; i < TREE_SUB_STEPS; i += 1) {
      instanceCount += 1

      const percent = i / TREE_SUB_STEPS
      const extra = 1 / TREE_MAX_STEPS

      newPosition.set(x, y, z).lerp(new THREE.Vector3(newX, newY, newZ), percent)
      position.copy(newPosition)
      position.x += randomOffset() * size * 3
      position.y += randomOffset() * size * 3
      position.z += randomOffset() * size * 3
      positions.push(position.x, position.y, position.z)

      const scale = Math.random() + 5

      normal.copy(position).sub(newPosition).normalize()
      normals.push(normal.x, normal.y, normal.z)

      color.setHSL((count / TREE_MAX_STEPS) * 0.5 + Math.random() * 0.05, 0.75, 0.6 + Math.random() * 0.1)
      colors.push(color.r, color.g, color.b)

      const instanceSize = size * scale
      const instanceTime = (count / TREE_MAX_STEPS) + percent * extra
      const instanceSeed = Math.random()
      data.push(instanceSize, instanceTime, instanceSeed)
    }

    for (let i = 0; i < TREE_BRANCH_COUNT; i += 1) {
      createTreePart(
        angle + randomOffset(),
        newX,
        newY,
        newZ,
        newLength + randomOffset(),
        count + 1,
      )
    }
  }

  createTreePart(Math.PI * 0.5, 0, 0, 0, 16, 0)

  const positionBuffer = new Float32Array(positions)
  const normalBuffer = new Float32Array(normals)
  const colorBuffer = new Float32Array(colors)
  const dataBuffer = new Float32Array(data)
  const instancePosition = new THREE.InstancedBufferAttribute(positionBuffer, 3)
  const instanceNormal = new THREE.InstancedBufferAttribute(normalBuffer, 3)
  const instanceColor = new THREE.InstancedBufferAttribute(colorBuffer, 3)
  const instanceData = new THREE.InstancedBufferAttribute(dataBuffer, 3)

  return {
    instanceCount,
    positions: positionBuffer,
    normals: normalBuffer,
    colors: colorBuffer,
    data: dataBuffer,
    attributes: {
      position: instancePosition,
      normal: instanceNormal,
      color: instanceColor,
      data: instanceData,
    },
  }
}

export const MeshTree: React.FC<MeshTreeProps> = ({ position = [3.75, 0, 0], scale = 0.06 }) => {
  const treePayload = useMemo(() => generateTreePayload(), [])

  const treeGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry()
    geometry.setAttribute('instancePosition', treePayload.attributes.position)
    geometry.setAttribute('instanceNormal', treePayload.attributes.normal)
    geometry.setAttribute('instanceColor', treePayload.attributes.color)
    geometry.setAttribute('instanceData', treePayload.attributes.data)
    return geometry
  }, [treePayload.attributes])

  const treeMaterial = useMemo(() => {
    const material = new THREE.MeshStandardNodeMaterial({
      color: '#7dd3fc',
      metalness: 0.18,
      roughness: 0.5,
      emissive: '#1f3b64',
      transparent: true,
      opacity: 0.95,
    })

    const instancePosition = instancedBufferAttribute(treePayload.attributes.position)
    const instanceNormal = instancedBufferAttribute(treePayload.attributes.normal)
    const instanceColor = instancedBufferAttribute(treePayload.attributes.color)
    const instanceData = instancedBufferAttribute(treePayload.attributes.data)

    material.positionNode = Fn(() => {
      const instanceSize = instanceData.x
      const instanceTime = instanceData.y
      const instanceSeed = instanceData.z

      const pulseA = sin(time.add(instanceSeed.mul(2.7))).mul(0.5).add(1)
      const pulseB = sin(time.mul(1.2).sub(instanceSeed.mul(3.1))).mul(0.5).add(1)

      const dif1 = abs(instanceTime.sub(pulseA)).toConst()
      let effect = dif1.lessThanEqual(0.15).select(sub(0.15, dif1).mul(sub(1.7, instanceTime).mul(10)), float(0))

      const dif2 = abs(instanceTime.sub(pulseB)).toConst()
      effect = dif2.lessThanEqual(0.15).select(sub(0.15, dif2).mul(sub(1.7, instanceTime).mul(10)), effect)

      const direction = positionGeometry.normalize()
      const animationPulse = abs(sin(time.add(instanceSeed.mul(2))).mul(1.5))
      const animated = positionLocal
        .add(instancePosition)
        .add(direction.mul(effect.add(instanceSize)))
        .sub(direction.mul(effect))
        .add(instanceNormal.mul(effect.mul(1)))
        .add(instanceNormal.mul(animationPulse))

      return animated
    })()

    const squareEdge = Fn(() => {
      const squarePosition = uv().sub(vec2(0.5, 0.5))
      const squareDistance = max(abs(squarePosition.x), abs(squarePosition.y))
      return squareDistance.div(0.5).clamp(0.85, 1).sub(0.5).mul(2.0)
    })()

    material.colorNode = Fn(() => {
      return squareEdge.sub(instanceColor)
    })()

    material.emissiveNode = Fn(() => {
      const instanceColorNode = instanceColor
      const instanceTimeNode = instanceData.y
      const instanceSeedNode = instanceData.z
      const pulseA = sin(time.add(instanceSeedNode.mul(2.7))).mul(0.5).add(1)
      const pulseB = sin(time.mul(1.2).sub(instanceSeedNode.mul(3.1))).mul(0.5).add(1)
      const d1 = abs(instanceTimeNode.sub(pulseA)).toConst()
      const pulse1 = d1.lessThanEqual(0.15).select(sub(0.15, d1).mul(sub(1.7, instanceTimeNode).mul(10)), float(0))
      const d2 = abs(instanceTimeNode.sub(pulseB)).toConst()
      const pulse2 = d2.lessThanEqual(0.15).select(sub(0.15, d2).mul(sub(1.7, instanceTimeNode).mul(10)), pulse1)

      return pow2(vec3(pulse1, 0, pulse2)).mul(instanceColorNode)
    })()

    material.normalNode = normalWorldGeometry
    return material
  }, [treePayload.attributes])

  return (
    <group position={position} scale={scale}>
      <instancedMesh
        args={[treeGeometry, treeMaterial, treePayload.instanceCount]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
    </group>
  )
}

