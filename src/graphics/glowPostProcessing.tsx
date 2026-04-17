import * as THREE from 'three/webgpu'
import { useLayoutEffect, useMemo } from 'react'
import { useStore, useThree } from '@react-three/fiber/webgpu'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { emissive, mrt, output, pass, vec4 } from 'three/tsl'

const BLOOM_STRENGTH = 1.25
const BLOOM_RADIUS = 0.75

interface GlowPostProcessingProps {
  bloomExcludeLayer?: number
  bloomMode?: 'emissive' | 'color'
}

export function GlowPostProcessing({
  bloomExcludeLayer = 1,
  bloomMode = 'emissive',
}: GlowPostProcessingProps) {
  const renderer = useThree((state) => state.renderer)
  const isRendererInitialized = useThree((state) => {
    const typedRenderer = state.renderer as
      | ({ hasInitialized?: () => boolean } & NonNullable<unknown>)
      | null
    if (!typedRenderer) {
      return false
    }
    if (!typedRenderer.hasInitialized) {
      return true
    }
    return typedRenderer.hasInitialized()
  })
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const isLegacy = useThree((state) => state.isLegacy)
  const size = useThree((state) => state.size)
  const viewportDpr = useThree((state) => state.viewport.dpr)
  const store = useStore()

  // Pixel-accurate signature of the drawing buffer. When this key changes the
  // RenderPipeline (and every pass/MRT target it owns) must be rebuilt so the
  // WebGPU backend does not issue a CopyTextureToTexture with mismatched sizes
  // between source and destination textures.
  const pipelineSizeKey = useMemo(() => {
    const pixelWidth = Math.max(1, Math.round(size.width * viewportDpr))
    const pixelHeight = Math.max(1, Math.round(size.height * viewportDpr))
    return `${pixelWidth}x${pixelHeight}`
  }, [size.width, size.height, viewportDpr])

  useLayoutEffect(() => {
    if (isLegacy) {
      throw new Error('GlowPostProcessing requires a WebGPU renderer.')
    }

    if (!renderer || !scene || !camera || !isRendererInitialized) {
      return
    }

    // Skip before the canvas has laid out. Building the pipeline against a
    // zero-sized drawing buffer would immediately invalidate on the first real
    // resize, reproducing the very race this effect guards against.
    if (size.width <= 0 || size.height <= 0) {
      return
    }

    const previousState = store.getState()
    const previousPostProcessing = previousState.postProcessing as THREE.RenderPipeline | null
    if (previousPostProcessing?.dispose) {
      previousPostProcessing.dispose()
    }
    store.setState({
      postProcessing: null,
      passes: {},
    })

    const currentPasses = {} as Record<string, unknown>
    const postProcessing = new THREE.RenderPipeline(renderer)

    const scenePass = pass(scene, camera)
    currentPasses.scenePass = scenePass

    postProcessing.outputNode = scenePass

    const sceneLayers = new THREE.Layers()
    sceneLayers.enable(0)
    sceneLayers.enable(bloomExcludeLayer)
    scenePass.setLayers(sceneLayers)

    let bloomPass = currentPasses.bloomPass as ReturnType<typeof pass>
    if (!bloomPass || bloomPass.scene !== scenePass.scene || bloomPass.camera !== scenePass.camera) {
      bloomPass = pass(scenePass.scene, scenePass.camera)
    }

    const bloomLayers = new THREE.Layers()
    bloomLayers.set(0)
    bloomPass.setLayers(bloomLayers)

    if (bloomMode === 'emissive') {
      const bloomMrtNode = mrt({
        output,
        emissive: vec4(emissive, output.a),
      })
      bloomPass.setMRT(bloomMrtNode)

      const bloomTexture = bloomPass.getTexture('emissive')
      if (bloomTexture) {
        bloomTexture.type = THREE.UnsignedByteType
      }
    }

    const baseColorPass = scenePass.getTextureNode('output')
    const bloomSourcePass = bloomMode === 'emissive'
      ? bloomPass.getTextureNode('emissive')
      : bloomPass.getTextureNode()

    if (baseColorPass && bloomSourcePass) {
      postProcessing.outputNode = baseColorPass.add(
        bloom(
          bloomSourcePass,
          BLOOM_STRENGTH,
          BLOOM_RADIUS,
        ),
      )
    }

    currentPasses.bloomPass = bloomPass

    store.setState({
      postProcessing,
      passes: currentPasses,
    })
  }, [
    renderer,
    scene,
    camera,
    isLegacy,
    store,
    bloomMode,
    bloomExcludeLayer,
    isRendererInitialized,
    pipelineSizeKey,
    size.width,
    size.height,
  ])

  useLayoutEffect(() => {
    if (!renderer) {
      return
    }

    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.85

    return () => {
      const previousPostProcessing = store.getState().postProcessing as THREE.RenderPipeline | null
      if (previousPostProcessing?.dispose) {
        previousPostProcessing.dispose()
      }

      store.setState({
        postProcessing: null,
        passes: {},
      })
    }
  }, [renderer, store])

  return null
}
