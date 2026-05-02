'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { useShallow } from 'zustand/react/shallow';
import { parseTopicRefKey, topicRefKey } from '@/lib/topicRef';
import {
  ActiveCrystal,
  CrystalBaseShape,
  CRYSTAL_BASE_SHAPES,
  Subject,
  type TopicRef,
} from '../types';
import type { TopicIconName } from '../types/core';
import {
  calculateLevelFromXP,
  crystalBaseShapeFromTopicRef,
  crystalCeremonyStore,
  getCrystalScale,
  subjectSeedFromId,
  topicSeedFromRef,
  useProgressionStore,
} from '../features/progression';
import {
  isCrystalTrialAvailableForPlayer,
} from '../features/crystalTrial';
import { useCrystalTrialStore } from '../features/crystalTrial/crystalTrialStore';
import { selectIsAnyModalOpen, useUIStore } from '../store/uiStore';
import { getSubjectColor } from '../utils/geometryMapping';
import { useTopicMetadata } from '../features/content';
import { GrowthParticles } from '../graphics/GrowthParticles';
import { playLevelUpSound } from '../utils/sound';
import { useSceneInvalidator } from '../hooks/useSceneInvalidator';
import { useCrystalCeremonySync } from '../hooks/useCrystalCeremonySync';
import { useManifest } from '../hooks/useDeckData';
import { useTopicContentStatusMap } from '@/hooks/useTopicContentStatusMap';
import { useCrystalContentCelebrationStore } from '@/store/crystalContentCelebrationStore';
import { CrystalNotificationBillboard } from './CrystalNotificationBillboard';
import {
  resolveCrystalNotificationFlags,
  type ResolvedCrystalNotification,
} from './crystalNotification';
import {
  createCrystalInstancedAttributes,
  createCrystalNodeMaterial,
  CRYSTAL_INSTANCE_OFFSET_COLOR,
  CRYSTAL_INSTANCE_OFFSET_LEVEL,
  CRYSTAL_INSTANCE_OFFSET_MORPH,
  CRYSTAL_INSTANCE_OFFSET_SELECT_CEREMONY,
  CRYSTAL_INSTANCE_OFFSET_SEED,
  CRYSTAL_INSTANCE_OFFSET_TOPIC_SEED,
  CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE,
  CRYSTAL_INSTANCE_STRIDE,
  CRYSTAL_MAX_INSTANCES,
  getClusterGeometry,
} from '../graphics/crystals';
import type { CrystalInstanceArrays, CrystalInstancedAttributes } from '../graphics/crystals';
import { FLOOR_SURFACE_Y } from '../constants/sceneFloor';
import {
  CRYSTAL_LABEL_OFFSET_Y,
  CRYSTAL_NOTIFICATION_LOCAL_Y,
  getLabelOpacity,
  getVisibleLabelCandidates,
  LabelVisibilityState,
  MAX_LABEL_DISTANCE,
  MAX_VISIBLE_LABELS,
} from './crystalLabelVisibility';
import { CrystalLabelBillboard } from './CrystalLabelBillboard';

interface TopicMetadata {
  title?: string;
  subjectId: string;
  subjectName?: string;
  topicName?: string;
  /**
   * Curated lucide icon name from the topic's graph node, plumbed through
   * `useTopicMetadata`. Optional during the Phase 2 migration window.
   */
  iconName?: TopicIconName;
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

/** Trial status that marks trial question pregeneration in-flight for a topic. */
const TRIAL_PREGENERATION_STATUS = 'pregeneration';

/** Tracked state for the unified crystal notification across active + fade-out. */
interface ManagedCrystalNotificationEntry {
  active: boolean;
  resolved: ResolvedCrystalNotification;
}

interface ManagedCrystalNotificationBillboardProps {
  topicKey: string;
  entry: ManagedCrystalNotificationEntry;
  opacitiesRef: React.MutableRefObject<Map<string, number>>;
  localY: number;
  onFadeComplete: (topicKey: string) => void;
}

/**
 * Stable `topicKey` identity for {@link CrystalNotificationBillboard} so WebGPU
 * materials are reused across active → fade-out transitions.
 */
const ManagedCrystalNotificationBillboard: React.FC<ManagedCrystalNotificationBillboardProps> = ({
  topicKey,
  entry,
  opacitiesRef,
  localY,
  onFadeComplete,
}) => {
  const handleFadeOutComplete = useCallback(() => {
    onFadeComplete(topicKey);
  }, [onFadeComplete, topicKey]);

  return (
    <CrystalNotificationBillboard
      topicKey={topicKey}
      glyph={entry.resolved.glyph}
      rotationMode={entry.resolved.rotationMode}
      active={entry.active}
      opacitiesRef={opacitiesRef}
      localY={localY}
      onFadeOutComplete={handleFadeOutComplete}
    />
  );
};

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
  const subjects: Subject[] = manifestQuery.data?.subjects ?? [];

  const selectedTopic = useUIStore((state) => state.selectedTopic);
  const selectTopic = useUIStore((state) => state.selectTopic);

  // Content status for generating indicator overlay
  const contentStatusMap = useTopicContentStatusMap();

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
  });
  /**
   * Per-frame-updated opacity map consumed by CrystalLabelBillboard meshes.
   * Using a ref avoids React re-renders on every camera move.
   */
  const labelOpacitiesRef = useRef<Map<string, number>>(new Map());
  const { invalidate, isPaused } = useSceneInvalidator();
  const environmentMap = useThree((state) => state.scene.environment);

  const lastCeremonyKey = useRef<string | null>(null);

  const [particleTopicId, setParticleTopicId] = useState<string | null>(null);
  const suppressNextClickRef = useRef(false);

  const labelAnchorRefs = useRef<(THREE.Group | null)[]>([]);

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
      geometry.setAttribute('instanceTrialAvailable', attributes.instanceTrialAvailable);
      geometry.setAttribute('instanceTopicSeed', attributes.instanceTopicSeed);
      const material = createCrystalNodeMaterial(attributes, environmentMap);
      groups[shape] = { geometry, material, arrays, attributes };
    }
    return groups;
  }, [environmentMap]);

  useCrystalCeremonySync();

  const count = Math.min(crystals.length, CRYSTAL_MAX_INSTANCES);
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

  const isAnyDialogOpen = useUIStore(selectIsAnyModalOpen);
  const prevDialogOpen = useRef(isAnyDialogOpen);
  useEffect(() => {
    if (prevDialogOpen.current && !isAnyDialogOpen) {
      crystalCeremonyStore.getState().onDialogClosed();
    }
    prevDialogOpen.current = isAnyDialogOpen;
  }, [isAnyDialogOpen]);

  // Keys (sorted) of crystals currently in the 'generating' content status.
  // Using a stable joined signature lets downstream effects depend on set identity
  // without thrashing on every render from upstream `contentStatusMap` ref changes.
  const generatingKeysSignature = useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const key = topicRefKey(crystals[i]);
      if (contentStatusMap[key] === 'generating') {
        keys.push(key);
      }
    }
    keys.sort();
    return keys.join('|');
  }, [count, crystals, contentStatusMap]);

  const generatingKeySet = useMemo(() => {
    if (!generatingKeysSignature) {
      return new Set<string>();
    }
    return new Set(generatingKeysSignature.split('|').filter(Boolean));
  }, [generatingKeysSignature]);

  const trialPregeneratingKeysSignature = useCrystalTrialStore((state) => {
    const keys: string[] = [];
    for (const [key, trial] of Object.entries(state.trials)) {
      if (trial.status === TRIAL_PREGENERATION_STATUS) {
        keys.push(key);
      }
    }
    keys.sort();
    return keys.join('|');
  });

  const trialPregeneratingKeySet = useMemo(() => {
    if (!trialPregeneratingKeysSignature) {
      return new Set<string>();
    }
    return new Set(trialPregeneratingKeysSignature.split('|').filter(Boolean));
  }, [trialPregeneratingKeysSignature]);

  const pendingCelebrationSignature = useCrystalContentCelebrationStore(
    useShallow((state) => {
      const keys = Object.keys(state.pendingByTopicKey);
      keys.sort();
      return keys.join('|');
    }),
  );

  /**
   * One notification entry per `topicKey` (generating, trial pregeneration, or
   * celebration). `active` flips false for fade-out; the entry is removed after
   * {@link CrystalNotificationBillboard} reports completion — stable React identity
   * per topic preserves WebGPU material reuse.
   */
  const [crystalNotifications, setCrystalNotifications] = useState<
    Map<string, ManagedCrystalNotificationEntry>
  >(() => new Map());

  useLayoutEffect(() => {
    const trialStoreState = useCrystalTrialStore.getState();
    const celebrationPending =
      useCrystalContentCelebrationStore.getState().pendingByTopicKey;

    const crystalByKey = new Map<string, (typeof crystals)[number]>();
    for (const c of crystals) {
      crystalByKey.set(topicRefKey(c), c);
    }

    setCrystalNotifications((prev) => {
      const next = new Map(prev);
      let changed = false;
      const desiredKeys = new Set<string>();

      for (const c of crystals) {
        const topicKey = topicRefKey(c);
        const isContentGenerating = generatingKeySet.has(topicKey);
        const trial = trialStoreState.trials[topicKey];
        const isTrialPregenerating = trialPregeneratingKeySet.has(topicKey);
        const isCelebrationPending = celebrationPending[topicKey] === true;

        const resolved = resolveCrystalNotificationFlags({
          isContentGenerating,
          isTrialPregenerating,
          isCelebrationPending,
        });

        if (resolved == null) {
          continue;
        }

        desiredKeys.add(topicKey);
        const existing = next.get(topicKey);
        if (!existing) {
          next.set(topicKey, { active: true, resolved });
          changed = true;
        } else {
          const res = existing.resolved;
          const resMatch =
            res.kind === resolved.kind &&
            res.glyph === resolved.glyph &&
            res.rotationMode === resolved.rotationMode;
          if (!resMatch || !existing.active) {
            next.set(topicKey, { active: true, resolved });
            changed = true;
          }
        }
      }

      for (const [key, entry] of next) {
        if (!crystalByKey.has(key)) {
          next.delete(key);
          changed = true;
          continue;
        }

        if (!desiredKeys.has(key) && entry.active) {
          next.set(key, { ...entry, active: false });
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [
    crystals,
    generatingKeySet,
    trialPregeneratingKeySet,
    pendingCelebrationSignature,
  ]);

  const handleCrystalNotificationFadeOut = useCallback((topicKey: string) => {
    setCrystalNotifications((prev) => {
      if (!prev.has(topicKey)) return prev;
      const next = new Map(prev);
      next.delete(topicKey);
      return next;
    });
  }, []);

  const hasLiveCrystalNotifications = crystalNotifications.size > 0;

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

    let needsInvalidate = ceremonyApi.ceremonyTopicKey != null;

    // Keep rendering while any crystal notification is visible (active or fading out).
    if (hasLiveCrystalNotifications) {
      needsInvalidate = true;
    }

    // Pre-compute trial-available keys once per frame: a trial is "available
    // for the player" when prepared (questions generated) AND XP is at the
    // current level-band cap. The pulse VFX uses true availability — not
    // mere preparation — so the player sees it iff the trial is actionable.
    const trialStoreState = useCrystalTrialStore.getState();
    const crystalXpByTopic = new Map(activeCrystals.map((crystal) => [topicRefKey(crystal), crystal.xp]));
    const trialAvailableKeys = new Set<string>();
    for (const [key, trial] of Object.entries(trialStoreState.trials)) {
      if (isCrystalTrialAvailableForPlayer(trial.status, crystalXpByTopic.get(key) ?? 0)) {
        trialAvailableKeys.add(key);
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
      const shape = crystalBaseShapeFromTopicRef(crystal);
      const group = shapeGroups[shape];
      const localIdx = shapeCounts[shape]++;

      const level = calculateLevelFromXP(crystal.xp);
      const [gx, gz] = crystal.gridPosition;
      const bob = Math.sin(elapsedTime * 2 + gx * 0.5) * 0.03;
      const py = 0.3 + bob;
      const isSelected = selectedTopic !== null && topicRefKey(selectedTopic) === topicKey;
      const rotY = isSelected ? elapsedTime * 0.4 : 0;

      const isCeremonyActive = ceremonyApi.isCeremonyActiveForTopic(
        { subjectId: crystal.subjectId, topicId: crystal.topicId },
        now,
      );
      const morphProgress = ceremonyApi.getCeremonyMorphProgress(
        { subjectId: crystal.subjectId, topicId: crystal.topicId },
        now,
      );
      let scale: number;
      if (isCeremonyActive) {
        const fromScale = level > 0 ? getCrystalScale(level - 1) : 0;
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

      const isTrialAvailable = trialAvailableKeys.has(topicKey) ? 1 : 0;
      d[row + CRYSTAL_INSTANCE_OFFSET_TRIAL_AVAILABLE] = isTrialAvailable;
      if (isTrialAvailable) {
        needsInvalidate = true;
      }

      d[row + CRYSTAL_INSTANCE_OFFSET_TOPIC_SEED] = topicSeedFromRef(crystal);

      const anchor = labelAnchorRefs.current[i];
      if (anchor) {
        anchor.position.set(gx, py, gz);
      }
    }

    // Flush label opacities. GPU depth-test handles occlusion inside the
    // billboard material; here we only drive distance-based LOD fade.
    const labelOpacities = labelOpacitiesRef.current;
    labelOpacities.clear();
    const { visibleIds, distances } = labelVisibility.current;
    for (const topicKey of visibleIds) {
      const distance = distances.get(topicKey) ?? Infinity;
      const opacity = getLabelOpacity(distance);
      labelOpacities.set(topicKey, opacity);
      if (opacity > 0) {
        needsInvalidate = true;
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
        // InstancedMesh.raycast lazily computes boundingSphere once and caches it
        // forever; if a pointer event triggered raycasting between a prop-driven
        // re-render (e.g., a newly-unlocked crystal appended to `crystals`) and
        // the next `useFrame` tick, Three.js would cache a sphere built from a
        // stale `count` (or identity matrices during the spawn ceremony when the
        // crystal scales from 0) and forever cull ray hits on the new crystal
        // — the "crystal won't accept clicks after first unlock" bug. Nulling
        // here guarantees the next raycast recomputes against the matrices and
        // count we just wrote above.
        mesh.boundingSphere = null;
        mesh.boundingBox = null;
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

    for (const candidate of candidates) {
      visibleIds.add(candidate.topicKey);
      distances.set(candidate.topicKey, candidate.distance);
    }
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
      const trialStatus = useCrystalTrialStore.getState().getTrialStatus(ref);
      const xp = crystals.find((c) => c.subjectId === ref.subjectId && c.topicId === ref.topicId)?.xp ?? 0;
      if (isCrystalTrialAvailableForPlayer(trialStatus, xp)) {
        useUIStore.getState().openCrystalTrial();
      } else {
        onStartTopicStudySession?.(ref);
      }
    } else {
      selectTopic(ref);
    }
  };

  // Part of the public props API; not referenced after removing Html label zIndex wiring.
  void isStudyPanelOpen;

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
        const notificationEntry = crystalNotifications.get(topicKey);
        return (
          <group
            key={topicKey}
            ref={(el: THREE.Group | null) => {
              labelAnchorRefs.current[index] = el;
            }}
          >
            {topicMeta?.topicName && (
              <CrystalLabelBillboard
                topicKey={topicKey}
                text={topicMeta.topicName}
                iconName={topicMeta.iconName}
                opacitiesRef={labelOpacitiesRef}
              />
            )}
            {notificationEntry ? (
              <ManagedCrystalNotificationBillboard
                key={`${topicKey}-notification`}
                topicKey={topicKey}
                entry={notificationEntry}
                opacitiesRef={labelOpacitiesRef}
                localY={CRYSTAL_NOTIFICATION_LOCAL_Y}
                onFadeComplete={handleCrystalNotificationFadeOut}
              />
            ) : null}
          </group>
        );
      })}

      <GrowthParticles position={[px, particleY, pz]} active={!!particleTopicId} />
    </group>
  );
};

export default Crystals;
