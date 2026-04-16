'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import * as THREE from 'three/webgpu';
import { parseTopicRefKey, topicRefKey } from '@/lib/topicRef';
import {
  ActiveCrystal,
  CrystalBaseShape,
  CRYSTAL_BASE_SHAPES,
  DEFAULT_CRYSTAL_BASE_SHAPE,
  Subject,
  type TopicRef,
} from '../types';
import {
  calculateLevelFromXP,
  crystalCeremonyStore,
  getCrystalScale,
  isXpMaxedForCurrentLevel,
  subjectSeedFromId,
  useProgressionStore,
} from '../features/progression';
import { useCrystalTrialStore } from '../features/crystalTrial/crystalTrialStore';
import { selectIsAnyModalOpen, useUIStore } from '../store/uiStore';
import { getSubjectColor } from '../utils/geometryMapping';
import { useTopicMetadata } from '../features/content';
import { GrowthParticles } from '../graphics/GrowthParticles';
import { playLevelUpSound } from '../utils/sound';
import { useSceneInvalidator } from '../hooks/useSceneInvalidator';
import { useCrystalCeremonySync } from '../hooks/useCrystalCeremonySync';
import { useManifest } from '../hooks/useDeckData';
import {
  createCrystalInstancedAttributes,
  createCrystalNodeMaterial,
  CRYSTAL_INSTANCE_OFFSET_COLOR,
  CRYSTAL_INSTANCE_OFFSET_LEVEL,
  CRYSTAL_INSTANCE_OFFSET_MORPH,
  CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY,
  CRYSTAL_INSTANCE_OFFSET_SEED,
  CRYSTAL_INSTANCE_OFFSET_TRIAL_READY,
  CRYSTAL_INSTANCE_STRIDE,
  CRYSTAL_MAX_INSTANCES,
  getClusterGeometry,
} from '../graphics/crystals';
import type { CrystalInstanceArrays, CrystalInstancedAttributes } from '../graphics/crystals';
import { FLOOR_SURFACE_Y } from '../constants/sceneFloor';
import {
  getLabelOpacity,
  getLabelOcclusionFactor,
  getVisibleLabelCandidates,
  LabelVisibilityState,
  MAX_LABEL_DISTANCE,
  MAX_VISIBLE_LABELS,
  CRYSTAL_LABEL_OFFSET_Y,
  LABEL_SECONDARY_OFFSET_Y,
} from './crystalLabelVisibility';

interface TopicMetadata {
  title?: string;
  subjectId: string;
  subjectName?: string;
  topicName?: string;
}

interface CrystalsProps {
  crystals: ActiveCrystal[];
  onStartTopicStudySession?: (ref: TopicRef) => void;
  isStudyPanelOpen?: boolean;
}

interface ShapeGroup {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalNodeMaterial;
  arrays: CrystalInstanceArrays;
  attributes: CrystalInstancedAttributes;
}

const matrixScratch = new THREE.Matrix4();
const positionScratch = new THREE.Vector3();
const quaternionScratch = new THREE.Quaternion();
const scaleScratch = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

function resolveCrystalBaseShape(
  topicKey: string,
  metadataLookup: Record<string, TopicMetadata | undefined>,
  subjects: Subject[],
): CrystalBaseShape {
  const meta = metadataLookup[topicKey];
  if (!meta?.subjectId) return DEFAULT_CRYSTAL_BASE_SHAPE;
  const subject = subjects.find((s) => s.id === meta.subjectId);
  return subject?.crystalBaseShape ?? DEFAULT_CRYSTAL_BASE_SHAPE;
}

/** Trial statuses that should show the trial-ready pulse VFX on the crystal. */
const TRIAL_READY_STATUSES = new Set(['awaiting_player']);

export const Crystals: React.FC<CrystalsProps> = ({
  crystals,
  onStartTopicStudySession,
  isStudyPanelOpen = false,
}) => {
  const activeCrystals = useProgressionStore((state) => state.activeCrystals);
  const metadataLookup = useTopicMetadata(
    crystals.map((crystal) => ({ subjectId: crystal.subjectId, topicId: crystal.topicId })),
  );
  const manifestQuery = useManifest();
  const subjects = manifestQuery.data?.subjects ?? [];

  const selectedTopic = useUIStore((state) => state.selectedTopic);
  const selectTopic = useUIStore((state) => state.selectTopic);

  const meshRefs = useRef<Record<CrystalBaseShape, THREE.InstancedMesh | null>>({
    icosahedron: null,
    octahedron: null,
    tetrahedron: null,
    dodecahedron: null,
  });

  const instanceToTopicRef = useRef<Map<THREE.InstancedMesh, string[]>>(new Map());

  const labelVisibility = useRef<LabelVisibilityState>({
    visibleIds: new Set(),
    distances: new Map(),
    occlusion: new Map(),
  });
  const raycasterRef = useRef(new THREE.Raycaster());
  const { invalidate, isPaused } = useSceneInvalidator();
  const environmentMap = useThree((state) => state.scene.environment);

  const lastCeremonyKey = useRef<string | null>(null);

  const [particleTopicId, setParticleTopicId] = useState<string | null>(null);
  const suppressNextClickRef = useRef(false);

  const labelAnchorRefs = useRef<(THREE.Group | null)[]>([]);
  const labelOpacityRefs = useRef<(HTMLDivElement | null)[]>([]);

  const shapeGroups = useMemo(() => {
    const groups = {} as Record<CrystalBaseShape, ShapeGroup>;
    for (const shape of CRYSTAL_BASE_SHAPES) {
      const { arrays, attributes } = createCrystalInstancedAttributes(CRYSTAL_MAX_INSTANCES);
      const geometry = getClusterGeometry(shape).clone();
      geometry.setAttribute('instanceLevel', attributes.instanceLevel);
      geometry.setAttribute('instanceMorphProgress', attributes.instanceMorphProgress);
      geometry.setAttribute('instanceSubjectSeed', attributes.instanceSubjectSeed);
      geometry.setAttribute('instanceColor', attributes.instanceColor);
      geometry.setAttribute('instanceSelectCeremony', attributes.instanceSelectCeremony);
      geometry.setAttribute('instanceTrialReady', attributes.instanceTrialReady);
      const material = createCrystalNodeMaterial(attributes, environmentMap);
      groups[shape] = { geometry, material, arrays, attributes };
    }
    return groups;
  }, [environmentMap]);

  useCrystalCeremonySync();

  const count = Math.min(crystals.length, CRYSTAL_MAX_INSTANCES);

  /** When layout or per-instance scale (xp -> level) changes, drop cached bounds so raycast recomputes. */
  const crystalBoundsKey = useMemo(
    () =>
      crystals
        .map(
          (c) =>
            `${topicRefKey(c)}:${c.gridPosition[0]},${c.gridPosition[1]}:${c.xp}`,
        )
        .join('|'),
    [crystals],
  );

  useLayoutEffect(() => {
    for (const shape of CRYSTAL_BASE_SHAPES) {
      const mesh = meshRefs.current[shape];
      if (mesh) {
        mesh.boundingSphere = null;
        mesh.boundingBox = null;
      }
    }
  }, [crystalBoundsKey]);

  // Phase 2: Dialog-aware ceremony deferral — trigger onDialogClosed when
  // any modal transitions from open to closed.
  const isAnyDialogOpen = useUIStore(selectIsAnyModalOpen);
  const prevDialogOpen = useRef(isAnyDialogOpen);
  useEffect(() => {
    if (prevDialogOpen.current && !isAnyDialogOpen) {
      crystalCeremonyStore.getState().onDialogClosed();
    }
    prevDialogOpen.current = isAnyDialogOpen;
  }, [isAnyDialogOpen]);

  useFrame(() => {
    if (isPaused) return;

    const now = performance.now();
    const elapsedTime = now / 1000;

    const ceremonyApi = crystalCeremonyStore.getState();
    ceremonyApi.syncCeremonyClock(now);
    const ceremonyKey =
      ceremonyApi.ceremonyTopicKey != null && ceremonyApi.ceremonyStartedAt != null
        ? `${ceremonyApi.ceremonyTopicKey}:${ceremonyApi.ceremonyStartedAt}`
        : null;
    if (ceremonyKey && ceremonyKey !== lastCeremonyKey.current) {
      lastCeremonyKey.current = ceremonyKey;
      playLevelUpSound();
      if (ceremonyApi.ceremonyTopicKey) {
        setParticleTopicId(ceremonyApi.ceremonyTopicKey);
        window.setTimeout(() => setParticleTopicId(null), 1200);
      }
    }
    if (!ceremonyKey) {
      lastCeremonyKey.current = null;
    }

    // Phase 4: Force continuous rendering while ceremony is active
    let needsInvalidate = ceremonyApi.ceremonyTopicKey != null;

    // Pre-compute trial-ready keys once per frame to avoid N individual getTrialStatus calls
    const trialStoreState = useCrystalTrialStore.getState();
    const crystalXpByTopic = new Map(activeCrystals.map((crystal) => [topicRefKey(crystal), crystal.xp]));
    const trialReadyKeys = new Set<string>();
    for (const [key, trial] of Object.entries(trialStoreState.trials)) {
      if (
        TRIAL_READY_STATUSES.has(trial.status)
        && isXpMaxedForCurrentLevel(crystalXpByTopic.get(key) ?? 0)
      ) {
        trialReadyKeys.add(key);
      }
    }

    const shapeCounts: Record<CrystalBaseShape, number> = {
      icosahedron: 0,
      octahedron: 0,
      tetrahedron: 0,
      dodecahedron: 0,
    };

    const topicMap = instanceToTopicRef.current;
    for (const shape of CRYSTAL_BASE_SHAPES) {
      const mesh = meshRefs.current[shape];
      if (mesh) {
        if (!topicMap.has(mesh)) topicMap.set(mesh, []);
        topicMap.get(mesh)!.length = 0;
      }
    }

    for (let i = 0; i < count; i++) {
      const crystal = crystals[i];
      const topicKey = topicRefKey(crystal);
      const topicMeta = metadataLookup[topicKey] as TopicMetadata | undefined;
      const shape = resolveCrystalBaseShape(topicKey, metadataLookup, subjects);
      const group = shapeGroups[shape];
      const localIdx = shapeCounts[shape]++;

      const level = calculateLevelFromXP(crystal.xp);
      const [gx, gz] = crystal.gridPosition;
      const bob = Math.sin(elapsedTime * 2 + gx * 0.5) * 0.03;
      const py = 0.3 + bob;
      const isSelected = selectedTopic !== null && topicRefKey(selectedTopic) === topicKey;
      const rotY = isSelected ? elapsedTime * 0.4 : 0;

      // Phase 1: Animated instance scale — lerp between old and new scale
      // during the ceremony window, synced with morphProgress (2.5s smoothstep).
      const isCeremonyActive = ceremonyApi.isCeremonyActiveForTopic(
        { subjectId: crystal.subjectId, topicId: crystal.topicId },
        now,
      );
      const morphProgress = ceremonyApi.getCeremonyMorphProgress(
        { subjectId: crystal.subjectId, topicId: crystal.topicId },
        now,
      );
      let scale: number;
      if (isCeremonyActive && level > 0) {
        const fromScale = getCrystalScale(level - 1);
        const toScale = getCrystalScale(level);
        scale = fromScale + (toScale - fromScale) * morphProgress;
      } else {
        scale = getCrystalScale(level);
      }

      positionScratch.set(gx, py, gz);
      quaternionScratch.setFromAxisAngle(yAxis, rotY);
      scaleScratch.setScalar(scale);
      matrixScratch.compose(positionScratch, quaternionScratch, scaleScratch);

      const mesh = meshRefs.current[shape];
      if (mesh) {
        mesh.setMatrixAt(localIdx, matrixScratch);
        topicMap.get(mesh)![localIdx] = topicKey;
      }

      const linear = ceremonyApi.getCeremonyLinearProgress(
        { subjectId: crystal.subjectId, topicId: crystal.topicId },
        now,
      );
      const ceremonyPhase = linear * (1 - linear) * 4;

      const colorHex = getSubjectColor(topicMeta?.subjectId ?? null, subjects);
      const color = new THREE.Color(colorHex);

      const row = localIdx * CRYSTAL_INSTANCE_STRIDE;
      const d = group.arrays.instanceData;
      d[row + CRYSTAL_INSTANCE_OFFSET_LEVEL] = level;
      d[row + CRYSTAL_INSTANCE_OFFSET_MORPH] = morphProgress;
      d[row + CRYSTAL_INSTANCE_OFFSET_SEED] = subjectSeedFromId(topicMeta?.subjectId);
      d[row + CRYSTAL_INSTANCE_OFFSET_COLOR] = color.r;
      d[row + CRYSTAL_INSTANCE_OFFSET_COLOR + 1] = color.g;
      d[row + CRYSTAL_INSTANCE_OFFSET_COLOR + 2] = color.b;
      d[row + CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY] = isSelected ? 1 : 0;
      d[row + CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY + 1] = ceremonyPhase;

      // Crystal Trial VFX: use pre-computed trial-ready set instead of per-crystal getTrialStatus
      const isTrialReady = trialReadyKeys.has(topicKey) ? 1 : 0;
      d[row + CRYSTAL_INSTANCE_OFFSET_TRIAL_READY] = isTrialReady;
      if (isTrialReady) {
        needsInvalidate = true; // Keep rendering for pulse animation
      }

      const anchor = labelAnchorRefs.current[i];
      if (anchor) {
        anchor.position.set(gx, py, gz);
      }

      const labelEl = labelOpacityRefs.current[i];
      if (labelEl && topicMeta?.topicName) {
        const isLabelVisible = labelVisibility.current.visibleIds.has(topicKey);
        const distance = isLabelVisible
          ? labelVisibility.current.distances.get(topicKey) ?? Infinity
          : Infinity;
        const occlusionFactor = labelVisibility.current.occlusion.get(topicKey) ?? 1;
        const opacity = getLabelOpacity(distance) * occlusionFactor;
        labelEl.style.opacity = `${opacity}`;
        labelEl.style.display = opacity === 0 ? 'none' : 'block';
        if (opacity > 0) {
          needsInvalidate = true;
        }
      }
    }

    for (const shape of CRYSTAL_BASE_SHAPES) {
      const mesh = meshRefs.current[shape];
      const shapeGroup = shapeGroups[shape];
      const shapeCount = shapeCounts[shape];
      if (mesh) {
        mesh.count = shapeCount;
        if (shapeCount > 0) {
          mesh.instanceMatrix.needsUpdate = true;
          shapeGroup.attributes.interleaved.needsUpdate = true;
        }
      }
    }

    if (needsInvalidate) {
      invalidate();
    }
  });

  useFrame(({ camera: cam }) => {
    if (isPaused) return;

    const candidates = getVisibleLabelCandidates(
      crystals,
      cam.position,
      FLOOR_SURFACE_Y + CRYSTAL_LABEL_OFFSET_Y,
      MAX_LABEL_DISTANCE,
      MAX_VISIBLE_LABELS,
    );
    const { visibleIds, distances } = labelVisibility.current;
    visibleIds.clear();
    distances.clear();
    labelVisibility.current.occlusion.clear();

    const occluders: THREE.InstancedMesh[] = [];
    for (const shape of CRYSTAL_BASE_SHAPES) {
      const mesh = meshRefs.current[shape];
      if (mesh && mesh.count > 0) occluders.push(mesh);
    }

    candidates.forEach((candidate) => {
      visibleIds.add(candidate.topicKey);
      distances.set(candidate.topicKey, candidate.distance);

      const occlusionFactor = getLabelOcclusionFactor(
        cam.position,
        candidate.worldPosition,
        raycasterRef.current,
        occluders,
        null,
        LABEL_SECONDARY_OFFSET_Y,
        undefined,
      );
      labelVisibility.current.occlusion.set(candidate.topicKey, occlusionFactor);
    });
  });

  const handleCrystalPointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    suppressNextClickRef.current = true;
    handleSelectFromEvent(e);
  };

  const handleCrystalClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    handleSelectFromEvent(e);
  };

  const handleSelectFromEvent = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const id = e.instanceId;
    if (id === undefined || id < 0) return;
    const mesh = e.object as THREE.InstancedMesh;
    const topics = instanceToTopicRef.current.get(mesh);
    const topicKey = topics?.[id];
    if (!topicKey) return;

    const ref = parseTopicRefKey(topicKey);
    if (selectedTopic && topicRefKey(selectedTopic) === topicKey) {
      const isCurrentCrystalReadyForTrial = isXpMaxedForCurrentLevel(
        activeCrystals.find((item) => topicRefKey(item) === topicKey)?.xp ?? 0,
      );
      // Check if trial is awaiting player — open trial modal instead of study
      const trialStatus = useCrystalTrialStore.getState().getTrialStatus(ref);
      if (trialStatus === 'awaiting_player' && isCurrentCrystalReadyForTrial) {
        useUIStore.getState().openCrystalTrial();
        return;
      }
      onStartTopicStudySession?.(ref);
    } else {
      selectTopic(ref);
    }
  };

  if (crystals.length === 0) {
    return <group />;
  }

  const particleCrystal = particleTopicId
    ? crystals.find((c) => topicRefKey(c) === particleTopicId)
    : undefined;
  const [px, pz] = particleCrystal?.gridPosition ?? [0, 0];
  const particleY = 0.3;

  return (
    <group>
      {CRYSTAL_BASE_SHAPES.map((shape) => (
        <instancedMesh
          key={shape}
          ref={(el: THREE.InstancedMesh | null) => {
            meshRefs.current[shape] = el;
          }}
          args={[shapeGroups[shape].geometry, shapeGroups[shape].material, CRYSTAL_MAX_INSTANCES]}
          frustumCulled={false}
          onPointerUp={handleCrystalPointerUp}
          onClick={handleCrystalClick}
        />
      ))}

      {crystals.map((crystal, index) => {
        const topicKey = topicRefKey(crystal);
        const topicMeta = metadataLookup[topicKey] as TopicMetadata | undefined;
        const labelLayerRange = isStudyPanelOpen
          ? [0, 10]
          : selectedTopic && topicRefKey(selectedTopic) === topicKey
            ? [50, 100]
            : [0, 10];
        return (
          <group
            key={topicKey}
            ref={(el: THREE.Group | null) => {
              labelAnchorRefs.current[index] = el;
            }}
          >
            {topicMeta?.topicName && (
              <Html
                center
                transform
                sprite
                position={[0, -0.7, 0]}
                zIndexRange={labelLayerRange}
                className="pointer-events-none"
              >
                <div
                  ref={(el: HTMLDivElement | null) => {
                    labelOpacityRefs.current[index] = el;
                  }}
                  className="opacity-0 pointer-events-none max-w-[100px] truncate rounded-sm border border-border/50 bg-card/75 px-0.5 py-0.5 text-center font-sans text-[5px] font-normal leading-none tracking-wide text-foreground shadow-sm backdrop-blur-sm"
                >
                  {topicMeta.topicName}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      <GrowthParticles position={[px, particleY, pz]} active={!!particleTopicId} />
    </group>
  );
};

export default Crystals;
