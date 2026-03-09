'use client'

import React, { Suspense, useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { PerspectiveCamera, Html, OrbitControls, Environment } from '@react-three/drei/webgpu'
import { useQueries } from '@tanstack/react-query'
import * as THREE from 'three/webgpu'
import { Grid } from './Grid'
import { WisdomAltar } from './WisdomAltar'
import { Crystals } from './Crystals'
import { CrystalGlowPostProcessing } from '../graphics/glowPostProcessing'
import { SceneDebugStats } from './debug/SceneDebugStats'
import TopicSelectionBar from './TopicSelectionBar'
import { useProgressionStore as useStudyStore } from '../features/progression'
import { useUIStore } from '../store/uiStore'
import { useTopicMetadata, type TopicMetadata } from '../features/content'
import { Card } from '../types/core'
import { deckRepository } from '../infrastructure/di'
import '../graphics/nodeMaterialRegistration'

/**
 * Scene component - Main 3D visualization for Abyss Engine
 * Uses a perspective camera with locked polar angle for isometric-like framing
 */
interface SceneProps {
  onStartAttunement?: (topicId: string, cards: Card[]) => void
  showStats?: boolean
  isCameraAngleUnlocked?: boolean
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

const getRenderQuality = (): RenderQuality => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      dpr: [1, 1.5],
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

const CAMERA_START_POSITION: [number, number, number] = [7, 7, 7]
const ORBIT_TARGET: [number, number, number] = [0, 0, 0]
const CAMERA_START_DISTANCE = Math.hypot(
  CAMERA_START_POSITION[0] - ORBIT_TARGET[0],
  CAMERA_START_POSITION[1] - ORBIT_TARGET[1],
  CAMERA_START_POSITION[2] - ORBIT_TARGET[2],
)
const CAMERA_START_POLAR_ANGLE = Math.acos(
  (CAMERA_START_POSITION[1] - ORBIT_TARGET[1]) / CAMERA_START_DISTANCE,
)
const CAMERA_START_FOV = 60
const CAMERA_MIN_DISTANCE = CAMERA_START_DISTANCE * 0.6
const CAMERA_MAX_DISTANCE = CAMERA_START_DISTANCE * 1.05
const CAMERA_UNLOCKED_MIN_POLAR_ANGLE = 0.08
const CAMERA_UNLOCKED_MAX_POLAR_ANGLE = Math.PI - CAMERA_UNLOCKED_MIN_POLAR_ANGLE

interface OrbitCameraControlsProps {
  isCameraAngleUnlocked: boolean
}

const SceneFrameLimiter: React.FC = () => {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const interval = setInterval(() => {
      invalidate()
    }, TARGET_FRAME_INTERVAL_MS)

    return () => {
      clearInterval(interval)
    }
  }, [invalidate])

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
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    invalidate()
  }, [
    invalidate,
    activeCrystals,
    filteredCrystals,
    selectedTopicId,
    selectedTopicXp,
    currentSubjectId,
    selectedTopicCardsCount,
  ])

  return null
}

const OrbitCameraControls: React.FC<OrbitCameraControlsProps> = ({ isCameraAngleUnlocked }) => {
  const invalidate = useThree((state) => state.invalidate)
  const minPolarAngle = isCameraAngleUnlocked ? CAMERA_UNLOCKED_MIN_POLAR_ANGLE : CAMERA_START_POLAR_ANGLE
  const maxPolarAngle = isCameraAngleUnlocked ? CAMERA_UNLOCKED_MAX_POLAR_ANGLE : CAMERA_START_POLAR_ANGLE

  return (
    <OrbitControls
      enablePan={false}
      enableZoom
      enableRotate
      minDistance={CAMERA_MIN_DISTANCE}
      maxDistance={CAMERA_MAX_DISTANCE}
      minPolarAngle={minPolarAngle}
      maxPolarAngle={maxPolarAngle}
      target={ORBIT_TARGET}
      onChange={() => {
        invalidate()
      }}
    />
  )
}

export const Scene: React.FC<SceneProps> = ({
  onStartAttunement,
  showStats = false,
  isCameraAngleUnlocked = false,
}) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const activeCrystals = useStudyStore((state) => state.activeCrystals)
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId)
  const selectedTopicId = useUIStore((state) => state.selectedTopicId)
  const isStudyPanelOpen = useUIStore((state) => state.isStudyPanelOpen)
  const startTopicStudySession = useStudyStore((state) => state.startTopicStudySession)
  const openStudyPanel = useUIStore((state) => state.openStudyPanel)
  const allTopicMetadata = useTopicMetadata(activeCrystals.map((crystal) => crystal.topicId))
  const activeTopicIds = useMemo(
    () => Array.from(new Set(activeCrystals.map((crystal) => crystal.topicId))),
    [activeCrystals],
  )
  const topicCardQueries = useQueries({
    queries: activeTopicIds.map((topicId) => {
      const subjectId = allTopicMetadata[topicId]?.subjectId || ''
      return {
        queryKey: ['content', 'topic-cards', subjectId, topicId],
        queryFn: () => deckRepository.getTopicCards(subjectId, topicId),
        enabled: Boolean(subjectId),
        staleTime: Infinity,
      }
    }),
  })
  const topicCardsById = useMemo(() => {
    const map = new Map<string, Card[]>()
    activeTopicIds.forEach((topicId, index) => {
      const cards = topicCardQueries[index]?.data
      if (cards) {
        map.set(topicId, cards)
      }
    })
    return map
  }, [activeTopicIds, topicCardQueries])

  const selectedTopicMetadata: TopicMetadata | undefined = selectedTopicId
    ? allTopicMetadata[selectedTopicId]
    : undefined
  const selectedTopicCards = useMemo(
    () => (selectedTopicId ? topicCardsById.get(selectedTopicId) ?? [] : []),
    [selectedTopicId, topicCardsById],
  )
  const selectedTopicXp = useMemo(() => {
    if (!selectedTopicId) return 0
    return activeCrystals.find((crystal) => crystal.topicId === selectedTopicId)?.xp || 0
  }, [activeCrystals, selectedTopicId])

  const startTopicStudySessionFromCards = (topicId: string, cards: Card[]) => {
    if (!cards.length) {
      console.warn(`[Scene] No cards available for topic ${topicId}; unable to start study session.`)
      return
    }
    startTopicStudySession(topicId, cards)
    openStudyPanel()
  }

  const startTopicStudySessionFromSelection = (topicId: string) => {
    const cards = topicCardsById.get(topicId) ?? []
    if (!cards.length) {
      console.warn(`[Scene] No cards available for topic ${topicId}; unable to start study session.`)
      return
    }
    if (onStartAttunement) {
      onStartAttunement(topicId, cards)
      return
    }
    startTopicStudySessionFromCards(topicId, cards)
  }

  // Filter crystals based on current subject selection
  // If a subject is selected, only show crystals belonging to that subject
  const filteredCrystals = useMemo(() => {
    if (!currentSubjectId) {
      return activeCrystals
    }

    // Get topic-subject mapping from deck
    return activeCrystals.filter((crystal) => {
      const topicMeta = allTopicMetadata[crystal.topicId]
      return topicMeta?.subjectId === currentSubjectId
    })
  }, [activeCrystals, currentSubjectId, allTopicMetadata])

  // Track selected crystal's 3D position for positioning the topic selection bar
  // Compute synchronously during render using useMemo - no more race conditions!
  const selectedCrystalPosition = useMemo(() => {
    if (!selectedTopicId) return null

    const crystal = filteredCrystals.find((c) => c.topicId === selectedTopicId)
    if (!crystal) return null

    const [x, z] = crystal.gridPosition
    return [x, 0.3, z] as [number, number, number]
  }, [selectedTopicId, filteredCrystals])

  // Note: Removed handleSelectedCrystalPositionChange callback
  // The position is now computed synchronously in useMemo above
  const renderQuality = useMemo(() => getRenderQuality(), [])
  const [statsText, setStatsText] = useState(showStats ? 'Initializing...' : '')

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#0a0a1a' }}>
      <Canvas
        frameloop="demand"
        dpr={renderQuality.dpr}
        style={{ background: '#0a0a1a' }}
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

        <Environment preset="forest" background />

        {/* Orthographic camera with isometric view */}
        <PerspectiveCamera
          ref={cameraRef}
          makeDefault
          position={CAMERA_START_POSITION}
          fov={CAMERA_START_FOV}
          near={0.1}
          far={1000}
          onUpdate={(c: THREE.PerspectiveCamera) => {
            c.lookAt(...ORBIT_TARGET)
          }}
        />
        <OrbitCameraControls isCameraAngleUnlocked={isCameraAngleUnlocked} />

        {/* Lighting setup */}
        <ambientLight intensity={0.6} color="#ffffff" />
        <directionalLight
          position={[5, 10, 5]}
          intensity={1.2}
          color="#ffffff"
          castShadow
        />
        <directionalLight
          position={[-5, 5, -5]}
          intensity={0.4}
          color="#a0a0ff"
        />


        {/* Fog for depth */}
        <fog attach="fog" args={['#0a0a1a', 10, 50]} />

        {/* Grid floor */}
        <Grid />

        {/* Wisdom Altar at center [0,0] */}
        <WisdomAltar />

        {/* Crystals from props (data from parent/store) */}
        <Suspense fallback={null}>
          <Crystals
            crystals={filteredCrystals}
            onStartTopicStudySession={startTopicStudySessionFromSelection}
            isStudyPanelOpen={isStudyPanelOpen}
          />
        </Suspense>

        <CrystalGlowPostProcessing />

        {/* Topic Selection Bar - rendered as HTML overlay following selected crystal */}
        {selectedCrystalPosition && (
          <Html
            position={[selectedCrystalPosition[0], selectedCrystalPosition[1] - 1.2, selectedCrystalPosition[2]]}
            center
            style={{
              pointerEvents: 'auto',
            }}
          >
            <TopicSelectionBar
              isEmbedded
              onStartTopicStudySession={startTopicStudySessionFromCards}
              onStartAttunement={onStartAttunement}
              selectedMetadata={selectedTopicMetadata}
              selectedCards={selectedTopicCards}
              selectedXp={selectedTopicXp}
            />
          </Html>
        )}

        {/* Invisible floor plane to detect clicks outside crystals */}
        <mesh
          position={[0, -0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={() => {
            // Clear selection when clicking on empty space
            const { selectTopic } = useUIStore.getState()
            selectTopic(null)
          }}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicNodeMaterial visible={false} />
        </mesh>
      </Canvas>
      {showStats && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 20,
            color: '#8ef',
            pointerEvents: 'none',
            fontFamily: 'monospace',
            fontSize: 12,
            textShadow: '0 0 3px rgba(0, 0, 0, 0.8)',
            whiteSpace: 'pre',
          }}
        >
          {statsText}
        </div>
      )}
    </div>
  )
}

export default Scene
