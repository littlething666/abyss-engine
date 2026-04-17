import * as THREE from 'three/webgpu'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useStore, useThree } from '@react-three/fiber/webgpu'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { emissive, mrt, output, pass, vec4 } from 'three/tsl'

const BLOOM_STRENGTH = 1.25
const BLOOM_RADIUS = 0.75

// Time the canvas pixel dimensions must be stable before the bloom pipeline
// is rebuilt. Shorter than a typical resize drag and longer than a single R3F
// layout pass, so transient sizes during a rapid mobile<->desktop transition
// never reach the WebGPU command encoder.
const PIPELINE_REBUILD_SETTLE_MS = 200

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

  // Pixel-accurate signature of the drawing buffer. The bloom node chain can
  // only be safely rebuilt once this key has stopped changing.
  const pipelineSizeKey = useMemo(() => {
    const pixelWidth = Math.max(1, Math.round(size.width * viewportDpr))
    const pixelHeight = Math.max(1, Math.round(size.height * viewportDpr))
    return `${pixelWidth}x${pixelHeight}`
  }, [size.width, size.height, viewportDpr])

  // Settled key: lags pipelineSizeKey by PIPELINE_REBUILD_SETTLE_MS. While the
  // live key disagrees with the settled key the post-processing pipeline is
  // torn down so that no CopyTextureToTexture runs against mismatched targets.
  const [settledSizeKey, setSettledSizeKey] = useState<string | null>(null)

  // Synchronous teardown when the drawing buffer size changes so no rAF frame
  // between layout and the debounced effect still reads a stale pipeline from
  // the store (avoids CopyTextureToTexture size mismatches after resize).
  useLayoutEffect(() => {
    if (!pipelineSizeKey) {
      return
    }
    const previousPostProcessing = store.getState().postProcessing as THREE.RenderPipeline | null
    if (previousPostProcessing?.dispose) {
      previousPostProcessing.dispose()
    }
    store.setState({
      postProcessing: null,
      passes: {},
    })
    setSettledSizeKey(null)
  }, [pipelineSizeKey, store])

  useEffect(() => {
    if (!pipelineSizeKey) {
      return
    }

    const timer = window.setTimeout(() => {
      setSettledSizeKey(pipelineSizeKey)
    }, PIPELINE_REBUILD_SETTLE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [pipelineSizeKey])

  useLayoutEffect(() => {
    if (isLegacy) {
      throw new Error('GlowPostProcessing requires a WebGPU renderer.')
    }

    if (!renderer || !scene || !camera || !isRendererInitialized) {
      return
    }

    // Wait for the debounced size to match the live size before building the
    // pipeline. Until then, no bloom pass exists and frames render directly
    // from the renderer, so no texture copy can fail.
    if (!settledSizeKey || settledSizeKey !== pipelineSizeKey) {
      return
    }

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
    settledSizeKey,
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
