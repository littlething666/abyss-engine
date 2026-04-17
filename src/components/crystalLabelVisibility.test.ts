import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { topicRefKey } from '@/lib/topicRef';
import { ActiveCrystal } from '../types';
import {
  CRYSTAL_LABEL_OFFSET_Y,
  buildLabelCandidates,
  getLabelOpacity,
  getVisibleLabelCandidates,
} from './crystalLabelVisibility';

describe('crystal label visibility helpers', () => {
  it('uses explicit distance LOD bands', () => {
    expect(getLabelOpacity(5.99)).toBe(1);
    expect(getLabelOpacity(11.99)).toBe(0.6);
    expect(getLabelOpacity(17.99)).toBe(0.2);
    expect(getLabelOpacity(18)).toBe(0);
  });

  it('buildLabelCandidates filters by max distance', () => {
    const cameraPosition = new THREE.Vector3(0, 0, 0);
    const sub = 'test-subject';
    const crystals: ActiveCrystal[] = [
      { subjectId: sub, topicId: 'near', gridPosition: [1, 0], xp: 0, spawnedAt: 0 },
      { subjectId: sub, topicId: 'far', gridPosition: [30, 0], xp: 0, spawnedAt: 0 },
    ];
    const candidates = buildLabelCandidates(
      crystals,
      cameraPosition,
      18,
      CRYSTAL_LABEL_OFFSET_Y,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].topicKey).toBe(
      topicRefKey({ subjectId: sub, topicId: 'near' }),
    );
  });

  it('getVisibleLabelCandidates applies nearest-first cap', () => {
    const cameraPosition = new THREE.Vector3(0, 0, 0);
    const sub = 'test-subject';
    const crystals: ActiveCrystal[] = [
      { subjectId: sub, topicId: 'farther', gridPosition: [10, 0], xp: 0, spawnedAt: 0 },
      { subjectId: sub, topicId: 'closest', gridPosition: [1, 0], xp: 0, spawnedAt: 0 },
      { subjectId: sub, topicId: 'mid', gridPosition: [3, 0], xp: 0, spawnedAt: 0 },
      { subjectId: sub, topicId: 'hidden', gridPosition: [20, 0], xp: 0, spawnedAt: 0 },
    ];

    const candidates = getVisibleLabelCandidates(
      crystals,
      cameraPosition,
      CRYSTAL_LABEL_OFFSET_Y,
      18,
      2,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates.map((item) => item.topicKey)).toEqual([
      topicRefKey({ subjectId: sub, topicId: 'closest' }),
      topicRefKey({ subjectId: sub, topicId: 'mid' }),
    ]);
    expect(candidates.every((item) => item.distance < 18)).toBe(true);
  });
});
