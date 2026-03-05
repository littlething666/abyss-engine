'use client';

import React, { Suspense, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, Html } from '@react-three/drei';
import { useQueries } from '@tanstack/react-query';
import * as THREE from 'three';
import { Grid } from './Grid';
import { WisdomAltar } from './WisdomAltar';
import { Crystals } from './Crystals';
import TopicSelectionBar from './TopicSelectionBar';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useUIStore } from '../store/uiStore';
import { useTopicMetadata, type TopicMetadata } from '../features/content/selectors';
import { Card } from '../types/core';
import { deckRepository } from '../infrastructure/di';

/**
 * Scene component - Main 3D visualization for Abyss Engine
 * Uses fixed orthographic camera for isometric view
 */
interface SceneProps {
  onStartAttunement?: (topicId: string, cards: Card[]) => void;
}

export const Scene: React.FC<SceneProps> = ({ onStartAttunement }) => {
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const activeCrystals = useStudyStore((state) => state.activeCrystals);
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId);
  const selectedTopicId = useUIStore((state) => state.selectedTopicId);
  const startTopicStudySession = useStudyStore((state) => state.startTopicStudySession);
  const openStudyPanel = useUIStore((state) => state.openStudyPanel);
  const allTopicMetadata = useTopicMetadata(activeCrystals.map((crystal) => crystal.topicId));
  const activeTopicIds = useMemo(
    () => Array.from(new Set(activeCrystals.map((crystal) => crystal.topicId))),
    [activeCrystals],
  );
  const topicCardQueries = useQueries({
    queries: activeTopicIds.map((topicId) => {
      const subjectId = allTopicMetadata[topicId]?.subjectId || '';
      return {
        queryKey: ['content', 'topic-cards', subjectId, topicId],
        queryFn: () => deckRepository.getTopicCards(subjectId, topicId),
        enabled: Boolean(subjectId),
        staleTime: Infinity,
      };
    }),
  });
  const topicCardsById = useMemo(() => {
    const map = new Map<string, Card[]>();
    activeTopicIds.forEach((topicId, index) => {
      const cards = topicCardQueries[index]?.data;
      if (cards) {
        map.set(topicId, cards);
      }
    });
    return map;
  }, [activeTopicIds, topicCardQueries]);

  const selectedTopicMetadata: TopicMetadata | undefined = selectedTopicId
    ? allTopicMetadata[selectedTopicId]
    : undefined;
  const selectedTopicCards = useMemo(
    () => (selectedTopicId ? topicCardsById.get(selectedTopicId) ?? [] : []),
    [selectedTopicId, topicCardsById],
  );
  const selectedTopicXp = useMemo(() => {
    if (!selectedTopicId) return 0;
    return activeCrystals.find((crystal) => crystal.topicId === selectedTopicId)?.xp || 0;
  }, [activeCrystals, selectedTopicId]);

  const startTopicStudySessionFromCards = (topicId: string, cards: Card[]) => {
    if (!cards.length) {
      console.warn(`[Scene] No cards available for topic ${topicId}; unable to start study session.`);
      return;
    }
    startTopicStudySession(topicId, cards);
    openStudyPanel();
  };

  const startTopicStudySessionFromSelection = (topicId: string) => {
    const cards = topicCardsById.get(topicId) ?? [];
    if (!cards.length) {
      console.warn(`[Scene] No cards available for topic ${topicId}; unable to start study session.`);
      return;
    }
    if (onStartAttunement) {
      onStartAttunement(topicId, cards);
      return;
    }
    startTopicStudySessionFromCards(topicId, cards);
  };

  // Filter crystals based on current subject selection
  // If a subject is selected, only show crystals belonging to that subject
  const filteredCrystals = useMemo(() => {
    if (!currentSubjectId) {
      return activeCrystals;
    }

    // Get topic-subject mapping from deck
    return activeCrystals.filter((crystal) => {
      const topicMeta = allTopicMetadata[crystal.topicId];
      return topicMeta?.subjectId === currentSubjectId;
    });
  }, [activeCrystals, currentSubjectId, allTopicMetadata]);

  // Track selected crystal's 3D position for positioning the topic selection bar
  // Compute synchronously during render using useMemo - no more race conditions!
  const selectedCrystalPosition = useMemo(() => {
    if (!selectedTopicId) return null;

    const crystal = filteredCrystals.find((c) => c.topicId === selectedTopicId);
    if (!crystal) return null;

    const [x, z] = crystal.gridPosition;
    return [x, 0.3, z] as [number, number, number];
  }, [selectedTopicId, filteredCrystals]);

  // Note: Removed handleSelectedCrystalPositionChange callback
  // The position is now computed synchronously in useMemo above

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#0a0a1a' }}>
      <Canvas
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance'
        }}
        style={{ background: '#0a0a1a' }}
      >
        {/* Orthographic camera with isometric view */}
        <OrthographicCamera
          ref={cameraRef}
          makeDefault
          position={[8, 8, 8]}
          zoom={50}
          near={0.1}
          far={1000}
          onUpdate={(c) => c.lookAt(0, 0, 0)}
        />

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

        {/* Accent light from above for the altar */}
        <pointLight
          position={[0, 5, 0]}
          intensity={1}
          color="#ffd700"
          distance={20}
          decay={2}
        />

        {/* Simple background color */}
        <color attach="background" args={['#0a0a1a']} />

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
          />
        </Suspense>

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
            const { selectTopic } = useUIStore.getState();
            selectTopic(null);
          }}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Canvas>
    </div>
  );
};

export default Scene;
