'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useTopicContentStatusMap } from '@/hooks/useTopicContentStatusMap';
import { CrystalGeneratingIndicator } from './CrystalGeneratingIndicator';
import { CrystalTrialGeneratingIndicator } from './CrystalTrialGeneratingIndicator';
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

/** Trial status that shows the trial-pregeneration balloon above the crystal. */
const TRIAL_PREGENERATION_STATUS = 'pregeneration';

/**
 * Y coordinate of the balloon tail-tip (anchor) for the content-generating
 * indicator — sits just above the crystal's bob-baseline (0.3).
 */
const GENERATING_INDICATOR_Y = 0.6;

/**
 * Y coordinate of the balloon tail-tip for the trial-pregeneration indicator.
 * Offset slightly higher than the content indicator so the rare case where a
 * crystal has both jobs live simultaneously still renders both balloons
 * without overlap.
 */
const TRIAL_INDICATOR_Y = 0.8;

/** Tracked state for a balloon indicator across its active + fade-out lifetime. */
interface ManagedIndicatorEntry {
  position: [number, number, number];
  active: boolean;
}

interface ManagedGeneratingIndicatorProps {
  topicKey: string;
  entry: ManagedIndicatorEntry;
  onFadeComplete: (topicKey: string) => void;
}

/**
 * Wraps {@link CrystalGeneratingIndicator} with a stable `topicKey`-keyed identity so
 * the underlying WebGPU material and geometries are created once per crystal and
 * reused across the active → fade-out transition (prevents per-cycle shader recompile
 * stalls that manifested as a screen freeze on unlock).
 */
const ManagedGeneratingIndicator: React.FC<ManagedGeneratingIndicatorProps> = ({
  topicKey,
  entry,
  onFadeComplete,
}) => {
  const handleFadeOutComplete = useCallback(() => {
    onFadeComplete(topicKey);
  }, [onFadeComplete, topicKey]);

  return (
    <CrystalGeneratingIndicator
      position={entry.position}
      active={entry.active}
      onFadeOutComplete={handleFadeOutComplete}
    />
  );
};

interface ManagedTrialIndicatorProps {
  topicKey: string;
  entry: ManagedIndicatorEntry;
  onFadeComplete: (topicKey: string) => void;
}

/**
 * Trial-pregeneration analogue of {@link ManagedGeneratingIndicator}.
 * Stable per-`topicKey` React identity preserves the per-instance WebGPU pipeline
 * across the active → fade-out transition (same rationale as the content
 * indicator — avoids shader-recompile stalls on lifecycle flips).
 */
const ManagedTrialIndicator: React.FC<ManagedTrialIndicatorProps> = ({
  topicKey,
  entry,
  onFadeComplete,
}) => {
  const handleFadeOutComplete = useCallback(() => {
    onFadeComplete(topicKey);
  }, [onFadeComplete, topicKey]);

  return (
    <CrystalTrialGeneratingIndicator
      position={entry.position}
      active={entry.active}
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
  const subjects = manifestQuery.data?.subjects ?? [];

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
    occlusion: new Map(),
  });
  const raycasterRef = useRef(new THREE.Raycaster());
  const { invalidate, isPaused } = useSceneInvalidator();
  const environmentMap = useThree((state) => state.scene.environment);
  const webgpuRenderer = useThree((state) => state.renderer);
  const sceneForPrewarm = useThree((state) => state.scene);
  const cameraForPrewarm = useThree((state) => state.camera);

  const crystalPrewarmGenRef = useRef(0);

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

  /**
   * Pre-compiles instanced crystal node materials once the meshes exist so the first
   * unlock does not pay ~400ms of WebGPU pipeline creation on the ceremony frame.
   * Re-runs when `shapeGroups` is rebuilt (e.g. environment map arrives).
   */
  useEffect(() => {
    const renderer = webgpuRenderer as THREE.WebGPURenderer & {
      compileAsync?: (
        object: THREE.Object3D,
        camera: THREE.Camera,
        targetScene?: THREE.Scene,
      ) => Promise<void>;
    };
    if (typeof renderer.compileAsync !== 'function') {
      return;
    }

    const generation = ++crystalPrewarmGenRef.current;
    let cancelled = false;

    const run = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (cancelled || crystalPrewarmGenRef.current !== generation) {
        return;
      }

      for (const shape of CRYSTAL_BASE_SHAPES) {
        const mesh = meshRefs.current[shape];
        if (!mesh) {
          continue;
        }

        const savedCount = mesh.count;

        if (savedCount > 0) {
          await renderer.compileAsync(mesh, cameraForPrewarm, sceneForPrewarm);
          if (cancelled || crystalPrewarmGenRef.current !== generation) {
            return;
          }
          continue;
        }

        positionScratch.set(0, -9000, 0);
        quaternionScratch.identity();
        scaleScratch.setScalar(1e-6);
        matrixScratch.compose(positionScratch, quaternionScratch, scaleScratch);
        mesh.setMatrixAt(0, matrixScratch);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.count = 1;

        try {
          await renderer.compileAsync(mesh, cameraForPrewarm, sceneForPrewarm);
        } finally {
          mesh.count = savedCount;
          mesh.instanceMatrix.needsUpdate = true;
        }

        if (cancelled || crystalPrewarmGenRef.current !== generation) {
          return;
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [webgpuRenderer, cameraForPrewarm, sceneForPrewarm, shapeGroups]);

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

  /**
   * Unified indicator state — one entry per topicKey that ever went generating.
   * `active: true` while generation is in-flight, flips to `false` on completion
   * (and the entry is removed once {@link CrystalGeneratingIndicator} reports its
   * fade-out is complete). Keeping the React element mounted across this lifecycle
   * preserves the per-instance `MeshBasicNodeMaterial` pipeline cache and avoids
   * the shader-recompile stall that previously froze the screen on unlock.
   */
  const [indicators, setIndicators] = useState<Map<string, ManagedIndicatorEntry>>(
    () => new Map(),
  );

  useLayoutEffect(() => {
    const activeKeys = generatingKeysSignature
      ? new Set(generatingKeysSignature.split('|'))
      : new Set<string>();

    const crystalByKey = new Map<string, (typeof crystals)[number]>();
    for (const c of crystals) {
      crystalByKey.set(topicRefKey(c), c);
    }

    setIndicators((prev) => {
      const next = new Map(prev);
      let changed = false;

      // Upsert entries for every topic currently generating.
      for (const key of activeKeys) {
        const crystal = crystalByKey.get(key);
        if (!crystal) continue;
        const [gx, gz] = crystal.gridPosition;
        const existing = next.get(key);
        if (!existing) {
          next.set(key, { position: [gx, GENERATING_INDICATOR_Y, gz], active: true });
          changed = true;
        } else if (
          !existing.active
          || existing.position[0] !== gx
          || existing.position[2] !== gz
        ) {
          next.set(key, { position: [gx, GENERATING_INDICATOR_Y, gz], active: true });
          changed = true;
        }
      }

      // Flip entries whose generation ended to inactive so they fade out.
      for (const [key, entry] of next) {
        if (!activeKeys.has(key) && entry.active) {
          next.set(key, { ...entry, active: false });
          changed = true;
        }
        // If the underlying crystal was removed entirely, drop the entry outright.
        if (!crystalByKey.has(key)) {
          next.delete(key);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [generatingKeysSignature, crystals]);

  const handleGeneratingIndicatorFadeOut = useCallback((topicKey: string) => {
    setIndicators((prev) => {
      if (!prev.has(topicKey)) return prev;
      const next = new Map(prev);
      next.delete(topicKey);
      return next;
    });
  }, []);

  // --- Trial pregeneration balloon lifecycle ---
  //
  // Mirrors the content-generation indicator pattern: a stable joined signature
  // driven by the Crystal Trial store lets the sync effect react only on
  // pregeneration-set membership changes, avoiding per-frame state churn.
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

  const [trialIndicators, setTrialIndicators] = useState<
    Map<string, ManagedIndicatorEntry>
  >(() => new Map());

  useLayoutEffect(() => {
    const activeKeys = trialPregeneratingKeysSignature
      ? new Set(trialPregeneratingKeysSignature.split('|'))
      : new Set<string>();

    const crystalByKey = new Map<string, (typeof crystals)[number]>();
    for (const c of crystals) {
      crystalByKey.set(topicRefKey(c), c);
    }

    setTrialIndicators((prev) => {
      const next = new Map(prev);
      let changed = false;

      for (const key of activeKeys) {
        const crystal = crystalByKey.get(key);
        if (!crystal) continue;
        const [gx, gz] = crystal.gridPosition;
        const existing = next.get(key);
        if (!existing) {
          next.set(key, { position: [gx, TRIAL_INDICATOR_Y, gz], active: true });
          changed = true;
        } else if (
          !existing.active
          || existing.position[0] !== gx
          || existing.position[2] !== gz
        ) {
          next.set(key, { position: [gx, TRIAL_INDICATOR_Y, gz], active: true });
          changed = true;
        }
      }

      for (const [key, entry] of next) {
        if (!activeKeys.has(key) && entry.active) {
          next.set(key, { ...entry, active: false });
          changed = true;
        }
        if (!crystalByKey.has(key)) {
          next.delete(key);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [trialPregeneratingKeysSignature, crystals]);

  const handleTrialIndicatorFadeOut = useCallback((topicKey: string) => {
    setTrialIndicators((prev) => {
      if (!prev.has(topicKey)) return prev;
      const next = new Map(prev);
      next.delete(topicKey);
      return next;
    });
  }, []);

  const hasLiveIndicators = indicators.size > 0 || trialIndicators.size > 0;

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

    // Keep rendering while any generating indicator is visible (active or fading out).
    if (hasLiveIndicators) {
      needsInvalidate = true;
    }

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

      {/* Content-generation indicators — stable identity per topic across the
          active → fade-out lifecycle avoids per-cycle WebGPU shader recompiles. */}
      {Array.from(indicators.entries()).map(([topicKey, entry]) => (
        <ManagedGeneratingIndicator
          key={topicKey}
          topicKey={topicKey}
          entry={entry}
          onFadeComplete={handleGeneratingIndicatorFadeOut}
        />
      ))}

      {/* Crystal Trial pregeneration indicators — same stable-identity pattern
          so the WebGPU pipeline is preserved across active → fade-out. */}
      {Array.from(trialIndicators.entries()).map(([topicKey, entry]) => (
        <ManagedTrialIndicator
          key={topicKey}
          topicKey={topicKey}
          entry={entry}
          onFadeComplete={handleTrialIndicatorFadeOut}
        />
      ))}

      <GrowthParticles position={[px, particleY, pz]} active={!!particleTopicId} />
    </group>
  );
};

export default Crystals;
