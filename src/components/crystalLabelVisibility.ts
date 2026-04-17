import * as THREE from 'three';

import { topicRefKey } from '@/lib/topicRef';
import { ActiveCrystal } from '../types';

export interface LabelCandidate {
  /** `topicRefKey` — unique per subject + topic node. */
  topicKey: string;
  distance: number;
  worldPosition: THREE.Vector3;
}

export interface LabelVisibilityState {
  visibleIds: Set<string>;
  distances: Map<string, number>;
}

export const MAX_LABEL_DISTANCE = 18;
export const MAX_VISIBLE_LABELS = 12;
export const CRYSTAL_LABEL_OFFSET_Y = 1.25;

export function getLabelOpacity(distance: number): number {
  if (distance < 6) {
    return 1;
  }

  if (distance < 12) {
    return 0.6;
  }

  if (distance < 18) {
    return 0.2;
  }

  return 0;
}

export function buildLabelCandidates(
  crystals: readonly ActiveCrystal[],
  cameraPosition: THREE.Vector3,
  maxDistance: number,
  labelOffsetY: number,
): LabelCandidate[] {
  return crystals
    .map((crystal) => {
      const worldPosition = new THREE.Vector3(
        crystal.gridPosition[0],
        labelOffsetY,
        crystal.gridPosition[1],
      );
      return {
        topicKey: topicRefKey(crystal),
        distance: cameraPosition.distanceTo(worldPosition),
        worldPosition,
      };
    })
    .filter((item) => item.distance < maxDistance);
}

export function getVisibleLabelCandidates(
  crystals: readonly ActiveCrystal[],
  cameraPosition: THREE.Vector3,
  labelOffsetY: number,
  maxDistance: number,
  maxVisible: number,
): LabelCandidate[] {
  const candidates = buildLabelCandidates(
    crystals,
    cameraPosition,
    maxDistance,
    labelOffsetY,
  );
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, maxVisible);
}
