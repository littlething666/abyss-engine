'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import * as THREE from 'three/webgpu';
import { ActiveCrystal, CrystalBaseShape, CRYSTAL_BASE_SHAPES, DEFAULT_CRYSTAL_BASE_SHAPE, Subject } from '../types';
import {
  calculateLevelFromXP,
  crystalCeremonyStore,
  getCrystalScale,
  subjectSeedFromId,
} from '../features/progression';
import { useUIStore } from '../store/uiStore';
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
  onStartTopicStudySession?: (topicId: string) => void;
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
  topicId: string,
  metadataLookup: Record<string, TopicMetadata | undefined>,
  subjects: Subject[],
): CrystalBaseShape {
  const meta = metadataLookup[topicId];
  if (!meta?.subjectId) return DEFAULT_CRYSTAL_BASE_SHAPE;
  const subject = subjects.find((s) => s.id === meta.subjectId);
  return subject?.crystalBaseShape ?? DEFAULT_CRYSTAL_BASE_SHAPE;
}

export const Crystals: React.FC<CrystalsProps> = ({
  crystals,
  onStartTopicStudySession,
  isStudyPanelOpen = false,
}) => {
  const metadataLookup = useTopicMetadata(crystals.map((crystal) => crystal.topicId));
  const manifestQuery = useManifest();
  const subjects = manifestQuery.data?.subjects ?? [];

  const selectedTopicId = useUIStore((state) => state.selectedTopicId);
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

  const prevPanelOpen = useRef(isStudyPanelOpen);
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
      const material = createCrystalNodeMaterial(attributes, environmentMap);
      groups[shape] = { geometry, material, arrays, attributes };
    }
    return groups;
  }, [environmentMap]);

  useCrystalCeremonySync();

  const count = Math.min(crystals.length, CRYSTAL_MAX_INSTANCES);

  /** When layout or per-instance scale (xp → level) changes, drop cached bounds so raycast recomputes. */
  const crystalBoundsKey = useMemo(
    () =>
      crystals
        .map((c) => `${c.topicId}:${c.gridPosition[0]},${c.gridPosition[1]}:${c.xp}`)
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

  useEffect(() => {
    if (!prevPanelOpen.current && isStudyPanelOpen) {
      // opened — no flush
    }
    if (prevPanelOpen.current && !isStudyPanelOpen) {
      crystalCeremonyStore.getState().onStudyPanelClosed();
    }
    prevPanelOpen.current = isStudyPanelOpen;
  }, [isStudyPanelOpen]);

  useFrame(() => {
    if (isPaused) return;

    const now = performance.now();
    const elapsedTime = now / 1000;

    const ceremonyApi = crystalCeremonyStore.getState();
    ceremonyApi.syncCeremonyClock(now);
    const ceremonyKey =
      ceremonyApi.ceremonyTopicId != null && ceremonyApi.ceremonyStartedAt != null
        ? `${ceremonyApi.ceremonyTopicId}:${ceremonyApi.ceremonyStartedAt}`
        : null;
    if (ceremonyKey && ceremonyKey !== lastCeremonyKey.current) {
      lastCeremonyKey.current = ceremonyKey;
      playLevelUpSound();
      if (ceremonyApi.ceremonyTopicId) {
        setParticleTopicId(ceremonyApi.ceremonyTopicId);
        window.setTimeout(() => setParticleTopicId(null), 1200);
      }
    }
    if (!ceremonyKey) {
      lastCeremonyKey.current = null;
    }

    let needsInvalidate = false;

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
      const topicMeta = metadataLookup[crystal.topicId] as TopicMetadata | undefined;
      const shape = resolveCrystalBaseShape(crystal.topicId, metadataLookup, subjects);
      const group = shapeGroups[shape];
      const localIdx = shapeCounts[shape]++;

      const level = calculateLevelFromXP(crystal.xp);
      const [gx, gz] = crystal.gridPosition;
      const bob = Math.sin(elapsedTime * 2 + gx * 0.5) * 0.03;
      const py = 0.3 + bob;
      const isSelected = selectedTopicId === crystal.topicId;
      const rotY = isSelected ? elapsedTime * 0.4 : 0;
      const scale = getCrystalScale(level);

      positionScratch.set(gx, py, gz);
      quaternionScratch.setFromAxisAngle(yAxis, rotY);
      scaleScratch.setScalar(scale);
      matrixScratch.compose(positionScratch, quaternionScratch, scaleScratch);

      const mesh = meshRefs.current[shape];
      if (mesh) {
        mesh.setMatrixAt(localIdx, matrixScratch);
        topicMap.get(mesh)![localIdx] = crystal.topicId;
      }

      const morphProgress = ceremonyApi.getCeremonyMorphProgress(crystal.topicId, now);
      const linear = ceremonyApi.getCeremonyLinearProgress(crystal.topicId, now);
      const ceremonyPhase = linear * (1 - linear) * 4;

      const colorHex = getSubjectColor(topicMeta?.subjectId ?? null, subjects);
      const color = new THREE.Color(colorHex);

      group.arrays.instanceLevel[localIdx] = level;
      group.arrays.instanceMorphProgress[localIdx] = morphProgress;
      group.arrays.instanceSubjectSeed[localIdx] = subjectSeedFromId(topicMeta?.subjectId);
      group.arrays.instanceColor[localIdx * 3] = color.r;
      group.arrays.instanceColor[localIdx * 3 + 1] = color.g;
      group.arrays.instanceColor[localIdx * 3 + 2] = color.b;
      group.arrays.instanceSelectCeremony[localIdx * 2] = isSelected ? 1 : 0;
      group.arrays.instanceSelectCeremony[localIdx * 2 + 1] = ceremonyPhase;

      const anchor = labelAnchorRefs.current[i];
      if (anchor) {
        anchor.position.set(gx, py, gz);
      }

      const labelEl = labelOpacityRefs.current[i];
      if (labelEl && topicMeta?.topicName) {
        const isLabelVisible = labelVisibility.current.visibleIds.has(crystal.topicId);
        const distance = isLabelVisible
          ? labelVisibility.current.distances.get(crystal.topicId) ?? Infinity
          : Infinity;
        const occlusionFactor = labelVisibility.current.occlusion.get(crystal.topicId) ?? 1;
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
      const group = shapeGroups[shape];
      const shapeCount = shapeCounts[shape];
      if (mesh) {
        mesh.count = shapeCount;
        if (shapeCount > 0) {
          mesh.instanceMatrix.needsUpdate = true;
          group.attributes.instanceLevel.needsUpdate = true;
          group.attributes.instanceMorphProgress.needsUpdate = true;
          group.attributes.instanceSubjectSeed.needsUpdate = true;
          group.attributes.instanceColor.needsUpdate = true;
          group.attributes.instanceSelectCeremony.needsUpdate = true;
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
      visibleIds.add(candidate.topicId);
      distances.set(candidate.topicId, candidate.distance);

      const occlusionFactor = getLabelOcclusionFactor(
        cam.position,
        candidate.worldPosition,
        raycasterRef.current,
        occluders,
        null,
        LABEL_SECONDARY_OFFSET_Y,
        undefined,
      );
      labelVisibility.current.occlusion.set(candidate.topicId, occlusionFactor);
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
    const topicId = topics?.[id];
    if (!topicId) return;

    if (selectedTopicId === topicId) {
      onStartTopicStudySession?.(topicId);
    } else {
      selectTopic(topicId);
    }
  };

  if (crystals.length === 0) {
    return <group />;
  }

  const particleCrystal = particleTopicId
    ? crystals.find((c) => c.topicId === particleTopicId)
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
        const topicMeta = metadataLookup[crystal.topicId] as TopicMetadata | undefined;
        const labelLayerRange = isStudyPanelOpen ? [0, 10] : selectedTopicId === crystal.topicId ? [50, 100] : [0, 10];
        return (
          <group
            key={crystal.topicId}
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
                style={{
                  pointerEvents: 'none',
                  width: '100px',
                  textAlign: 'center',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <div
                  ref={(el: HTMLDivElement | null) => {
                    labelOpacityRefs.current[index] = el;
                  }}
                  style={{ opacity: 0 }}
                  className="pointer-events-none max-w-[100px] truncate rounded-sm border border-border/50 bg-card/75 px-0.5 py-0.5 text-center font-sans text-[5px] font-normal leading-none tracking-wide text-foreground shadow-sm backdrop-blur-sm"
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
