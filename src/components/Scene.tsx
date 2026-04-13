'use client'

import React, { Suspense, useRef, useMemo, useEffect, useLayoutEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei/webgpu'
import * as THREE from 'three/webgpu'
import { Grid, GRID_SIZE } from './Grid'
import { ReflectiveFloor } from './ReflectiveFloor'
import { WisdomAltar } from './WisdomAltar'
import { Crystals } from './Crystals'
import { MeshTree } from './MeshTree'
import { SelectedCrystalSpotlight } from './SelectedCrystalSpotlight'
import { GlowPostProcessing } from '../graphics/glowPostProcessing'
import { SceneDebugStats } from './debug/SceneDebugStats'
import TopicSelectionBar from './TopicSelectionBar'
import { useProgressionStore as useStudyStore } from '../features/progression'
import { useUIStore } from '../store/uiStore'
import { useTopicMetadata, type TopicMetadata } from '../features/content'
import { Card } from '../types/core'
import { useTopicCardQueriesForActiveTopics } from '../hooks/useTopicCardQueries'
import { useSceneInvalidator } from '../hooks/useSceneInvalidator'
import { useSelectedCrystalSpotlight } from '../hooks/useSelectedCrystalSpotlight'
import '../graphics/nodeMaterialRegistration'
import { SceneSky, SunSyncedAmbientFill, SunSyncedDirectionalLight } from './SceneSky'
import { FLOOR_SURFACE_Y } from '../constants/sceneFloor'
import { CUBE_REFLECTION_EXCLUDED_LAYER } from '../constants/sceneLayers'
import { topicRefKey } from '../lib/topicRef'

interface SceneProps {
  showStats?: boolean
  isCameraAngleUnlocked?: boolean
  dynamicReflections?: boolean
  onCanvasReady?: () => void
  onCanvasReleased?: () => void
}

interface SceneRenderInvalidatorProps {
  activeCrystals: readonly unknown[]
  filteredCrystals: readonly unknown[]
  selectedTopicId: string | null
  selectedTopicXp: number
  currentSubjectId: string | null
  selectedTopicCardsCount: number
}

type RenderQuality = {
  dpr: number | [number, number]
  antialias: boolean
  powerPreference: 'high-performance' | 'low-power'
}

const TARGET_SCENE_FPS = 45
const TARGET_FRAME_INTERVAL_MS = 1000 / TARGET_SCENE_FPS

const SCENE_CONTAINER_STYLE: React.CSSProperties = { width: '100%', height: '100%' }
const CANVAS_BACKDROP = '#1a1f33'
const CANVAS_STYLE: React.CSSProperties = { background: CANVAS_BACKDROP }

const getRenderQuality = (): RenderQuality => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      dpr: [1, 1.25],
      antialias: true,
      powerPreference: 'high-performance',
    }
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const lowCoreCount = typeof navigator.hardwareConcurrency === 'number'
    && navigator.hardwareConcurrency <= 4
  const veryHighDpr = (window.devicePixelRatio || 1) > 2
  const needsReducedQuality = reducedMotion || lowCoreCount || veryHighDpr

  return {
    dpr: needsReducedQuality ? 1 : [1, 1.5],
    antialias: !needsReducedQuality,
    powerPreference: needsReducedQuality ? 'low-power' : 'high-performance',
  }
}

const CAMERA_START_POSITION: [number, number, number] = [-2, 7 + FLOOR_SURFACE_Y, 5]
const ORBIT_TARGET: [number, number, number] = [0, FLOOR_SURFACE_Y, 0]
const CAMERA_START_DISTANCE = Math.hypot(
  CAMERA_START_POSITION[0] - ORBIT_TARGET[0],
  CAMERA_START_POSITION[1] - ORBIT_TARGET[1],
  CAMERA_START_POSITION[2] - ORBIT_TARGET[2],
)
const CAMERA_START_POLAR_ANGLE = Math.acos(
  (CAMERA_START_POSITION[1] - 2 - ORBIT_TARGET[1]) / CAMERA_START_DISTANCE,
)
const CAMERA_START_FOV = 90
const CAMERA_MIN_DISTANCE = CAMERA_START_DISTANCE * 0.5
const CAMERA_MAX_DISTANCE = CAMERA_START_DISTANCE * 0.6
const CAMERA_UNLOCKED_MIN_POLAR_ANGLE = 0.08
const CAMERA_UNLOCKED_MAX_POLAR_ANGLE = Math.PI - CAMERA_UNLOCKED_MIN_POLAR_ANGLE
const CAMERA_FAR = 2_000_000

const LIGHT_AMBIENT_INTENSITY = 2.12
const LIGHT_HEMISPHERE_INTENSITY = 1.48
const LIGHT_SUN_INTENSITY = 2.5

interface OrbitCameraControlsProps {
  isCameraAngleUnlocked: boolean
}

const SceneFrameLimiter: React.FC = () => {
  const { invalidate, isPaused } = useSceneInvalidator()

  useEffect(() => {
    if (isPaused) {
      return
    }

    const interval = setInterval(() => {
      invalidate()
    }, TARGET_FRAME_INTERVAL_MS)

    return () => {
      clearInterval(interval)
    }
  }, [invalidate, isPaused])

  return null
}

const SceneRenderInvalidator: React.FC<SceneRenderInvalidatorProps> = ({
  activeCrystals,
  filteredCrystals,
  selectedTopicId,
  selectedTopicXp,
  currentSubjectId,
  selectedTopicCardsCount,
}) => {
  const { invalidate, isPaused } = useSceneInvalidator()

  useEffect(() => {
    if (isPaused) {
      return;
    }

    invalidate()
  }, [
    invalidate,
    isPaused,
    activeCrystals,
    filteredCrystals,
    selectedTopicId,
    selectedTopicXp,
    currentSubjectId,
    selectedTopicCardsCount,
  ])

  return null
}

const DefaultCameraReflectionExcludedLayer: React.FC = () => {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    camera.layers.enable(CUBE_REFLECTION_EXCLUDED_LAYER)
  }, [camera])
  return null
}

const OrbitCameraControls: React.FC<OrbitCameraControlsProps> = ({ isCameraAngleUnlocked }) => {
  const { invalidate, isPaused } = useSceneInvalidator()
  const minPolarAngle = isCameraAngleUnlocked ? CAMERA_UNLOCKED_MIN_POLAR_ANGLE : CAMERA_START_POLAR_ANGLE
  const maxPolarAngle = isCameraAngleUnlocked ? CAMERA_UNLOCKED_MAX_POLAR_ANGLE : CAMERA_START_POLAR_ANGLE

  return (
    <OrbitControls
      enabled={!isPaused}
      enablePan={false}
      enableZoom
      enableRotate
      minDistance={CAMERA_MIN_DISTANCE}
      maxDistance={CAMERA_MAX_DISTANCE}
      minPolarAngle={minPolarAngle}
      maxPolarAngle={maxPolarAngle}
      target={ORBIT_TARGET}
      onChange={() => {
        if (!isPaused) {
          invalidate()
        }
      }}
    />
  )
}

export const Scene: React.FC<SceneProps> = ({
  showStats = false,
  isCameraAngleUnlocked = false,
  dynamicReflections = false,
  onCanvasReady,
  onCanvasReleased,
}) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const sunDirectionRef = useRef(new THREE.Vector3(0, 1, 0))
  const activeCrystals = useStudyStore((state) => state.activeCrystals)
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId)
  const selectedTopicRef = useUIStore((state) => state.selectedTopicRef)
  const selectedTopicId = selectedTopicRef?.topicId ?? null
  const isStudyPanelOpen = useUIStore((state) => state.isStudyPanelOpen)
  const startTopicStudySession = useStudyStore((state) => state.startTopicStudySession)
  const openStudyPanel = useUIStore((state) => state.openStudyPanel)
  const allTopicMetadata = useTopicMetadata(activeCrystals.map((crystal) => crystal.topicId))
  const activeTopicIds = useMemo(
    () => Array.from(new Set(activeCrystals.map((crystal) => crystal.topicId))),
    [activeCrystals],
  )
  const { topicCardsByRef } = useTopicCardQueriesForActiveTopics(activeTopicIds, allTopicMetadata)

  const selectedTopicMetadata: TopicMetadata | undefined = selectedTopicId
    ? allTopicMetadata[selectedTopicId]
    : undefined
  const selectedTopicCards = useMemo(
    () => {
      if (!selectedTopicRef) return [] as Card[]
      return topicCardsByRef.get(topicRefKey(selectedTopicRef.subjectId, selectedTopicRef.topicId)) ?? []
    },
    [selectedTopicRef, topicCardsByRef],
  )
  const selectedTopicXp = useMemo(() => {
    if (!selectedTopicRef) return 0
    return activeCrystals.find(
      (crystal) => crystal.subjectId === selectedTopicRef.subjectId && crystal.topicId === selectedTopicRef.topicId,
    )?.xp || 0
  }, [activeCrystals, selectedTopicRef])

  const startTopicStudySessionFromCards = (topicId: string, cards: Card[]) => {
    const crystal = activeCrystals.find(c => c.topicId === topicId)
    const subjectId = crystal?.subjectId ?? allTopicMetadata[topicId]?.subjectId ?? ''
    if (!cards.length || !subjectId) {
      console.warn(`[Scene] No cards or subjectId for topic ${topicId}; unable to start study session.`)
      return
    }
    startTopicStudySession({ subjectId, topicId }, cards)
    openStudyPanel()
  }

  const startTopicStudySessionFromSelection = (topicId: string) => {
    const crystal = activeCrystals.find(c => c.topicId === topicId)
    const subjectId = crystal?.subjectId ?? allTopicMetadata[topicId]?.subjectId ?? ''
    if (!subjectId) return
    const cards = topicCardsByRef.get(topicRefKey(subjectId, topicId)) ?? []
    if (!cards.length) {
      console.warn(`[Scene] No cards available for topic ${topicId}; unable to start study session.`)
      return
    }
    startTopicStudySession({ subjectId, topicId }, cards)
    openStudyPanel()
  }

  const filteredCrystals = useMemo(() => {
    if (!currentSubjectId) {
      return activeCrystals
    }
    return activeCrystals.filter((crystal) => crystal.subjectId === currentSubjectId)
  }, [activeCrystals, currentSubjectId])

  const {
    spotlightPosition,
    spotlightTarget,
    spotlightOpacity,
  } = useSelectedCrystalSpotlight({
    selectedTopicId,
    crystals: filteredCrystals,
  })

  const renderQuality = useMemo(() => getRenderQuality(), [])
  const [statsText, setStatsText] = useState(showStats ? 'Initializing...' : '')

  useEffect(() => {
    return () => {
      onCanvasReleased?.()
    }
  }, [onCanvasReleased])

  return (
    <div style={SCENE_CONTAINER_STYLE}>
      <Canvas
        frameloop="demand"
        dpr={renderQuality.dpr}
        style={CANVAS_STYLE}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 0.55
          onCanvasReady?.()
        }}
      >
        {showStats && <SceneDebugStats onReport={setStatsText} />}
        <SceneFrameLimiter />
        <SceneRenderInvalidator
          activeCrystals={activeCrystals}
          filteredCrystals={filteredCrystals}
          selectedTopicId={selectedTopicId}
          selectedTopicXp={selectedTopicXp}
          currentSubjectId={currentSubjectId}
          selectedTopicCardsCount={selectedTopicCards.length}
        />

        <PerspectiveCamera
          ref={cameraRef}
          makeDefault
          position={CAMERA_START_POSITION}
          fov={CAMERA_START_FOV}
          near={0.1}
          far={CAMERA_FAR}
          onUpdate={(c: THREE.PerspectiveCamera) => {
            c.lookAt(...ORBIT_TARGET)
          }}
        />
        <DefaultCameraReflectionExcludedLayer />
        <OrbitCameraControls isCameraAngleUnlocked={isCameraAngleUnlocked} />

        <SceneSky sunDirectionRef={sunDirectionRef} />

        <SunSyncedAmbientFill
          sunDirectionRef={sunDirectionRef}
          ambientBaseIntensity={LIGHT_AMBIENT_INTENSITY}
          hemisphereBaseIntensity={LIGHT_HEMISPHERE_INTENSITY}
        />
        <SunSyncedDirectionalLight sunDirectionRef={sunDirectionRef} intensity={LIGHT_SUN_INTENSITY} />
        <SelectedCrystalSpotlight
          spotlightPosition={spotlightPosition}
          spotlightTarget={spotlightTarget}
          spotlightOpacity={spotlightOpacity}
        />


        <group position={[0, FLOOR_SURFACE_Y, 0]}>
          <Suspense fallback={null}>
            <ReflectiveFloor
              size={GRID_SIZE}
              floorHeight={-0.01}
              dynamicReflections={dynamicReflections}
              receiveShadow
            />
          </Suspense>

          <Grid />

          <WisdomAltar />

          <Suspense fallback={null}>
            <Crystals
              crystals={filteredCrystals}
              onStartTopicStudySession={startTopicStudySessionFromSelection}
              isStudyPanelOpen={isStudyPanelOpen}
            />
          </Suspense>

          <mesh
            position={[0, -0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow={false}
            onClick={() => {
              const { selectTopic } = useUIStore.getState()
              selectTopic(null)
            }}
          >
            <planeGeometry args={[GRID_SIZE, GRID_SIZE]} />
            <meshBasicNodeMaterial visible={false} />
          </mesh>
        </group>
      </Canvas>
      <TopicSelectionBar
        onStartTopicStudySession={startTopicStudySessionFromCards}
        selectedMetadata={selectedTopicMetadata}
        selectedCards={selectedTopicCards}
        selectedXp={selectedTopicXp}
      />
      {showStats && (
        <div className="pointer-events-none absolute left-2 top-2 z-20 max-w-[min(calc(100%-1rem),22rem)] whitespace-pre rounded-md border border-border/40 bg-card/70 px-2 py-1 font-mono text-[10px] leading-tight text-muted-foreground shadow-sm backdrop-blur-sm">
          {statsText}
        </div>
      )}
    </div>
  )
}

export default Scene
