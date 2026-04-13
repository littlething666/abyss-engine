import { describe, expect, it } from 'vitest';

import { ActiveCrystal, SubjectGraph } from '../../types';
import {
  applyCrystalXpDelta,
  getCrystalLevelProgressToNext,
  getTopicUnlockStatus,
} from './progressionUtils';

function createActiveCrystal(topicId: string, xp = 0): ActiveCrystal {
  return {
    topicId,
    gridPosition: [0, 0],
    xp,
    spawnedAt: 100,
  };
}

describe('progressionUtils', () => {
  describe('getCrystalLevelProgressToNext', () => {
    it.each([
      { xp: -10, level: 0, progressPercent: 0, isMax: false, totalXp: 0 },
      { xp: 0, level: 0, progressPercent: 0, isMax: false, totalXp: 0 },
      { xp: 50, level: 0, progressPercent: 50, isMax: false, totalXp: 50 },
      { xp: 99, level: 0, progressPercent: 99, isMax: false, totalXp: 99 },
      { xp: 100, level: 1, progressPercent: 0, isMax: false, totalXp: 100 },
      { xp: 150, level: 1, progressPercent: 50, isMax: false, totalXp: 150 },
      { xp: 199, level: 1, progressPercent: 99, isMax: false, totalXp: 199 },
      { xp: 400, level: 4, progressPercent: 0, isMax: false, totalXp: 400 },
      { xp: 499, level: 4, progressPercent: 99, isMax: false, totalXp: 499 },
      { xp: 500, level: 5, progressPercent: 100, isMax: true, totalXp: 500 },
      { xp: 999, level: 5, progressPercent: 100, isMax: true, totalXp: 999 },
    ] as const)('xp=$xp → level $level, $progressPercent%, isMax=$isMax', ({ xp, level, progressPercent, isMax, totalXp }) => {
      expect(getCrystalLevelProgressToNext(xp)).toEqual({
        level,
        progressPercent,
        isMax,
        totalXp,
      });
    });
  });

  describe('getTopicUnlockStatus', () => {
    const graphWithPrereq: SubjectGraph[] = [
      {
        subjectId: 's1',
        title: 'S1',
        themeId: 't1',
        maxTier: 2,
        nodes: [
          { topicId: 'a', title: 'A', tier: 1, learningObjective: '', prerequisites: [] },
          { topicId: 'b', title: 'B', tier: 2, learningObjective: '', prerequisites: ['a'] },
        ],
      },
    ];

    it('returns unlockPoints on the status object', () => {
      const status = getTopicUnlockStatus('missing', [], 2, [], []);
      expect(status.unlockPoints).toBe(2);
    });

    it('topic prereqs met but no points: canUnlock false, hasPrerequisites true, hasEnoughPoints false', () => {
      const crystals = [createActiveCrystal('a', 100)];
      const status = getTopicUnlockStatus('b', crystals, 0, graphWithPrereq, []);
      expect(status.hasPrerequisites).toBe(true);
      expect(status.hasEnoughPoints).toBe(false);
      expect(status.canUnlock).toBe(false);
      expect(status.unlockPoints).toBe(0);
    });

    it('topic prereqs met and has points: canUnlock true', () => {
      const crystals = [createActiveCrystal('a', 100)];
      const status = getTopicUnlockStatus('b', crystals, 1, graphWithPrereq, []);
      expect(status.hasPrerequisites).toBe(true);
      expect(status.hasEnoughPoints).toBe(true);
      expect(status.canUnlock).toBe(true);
    });

    it('object prerequisite with minLevel 2: false when parent crystal is only level 1', () => {
      const graphMin2: SubjectGraph[] = [
        {
          subjectId: 's1',
          title: 'S1',
          themeId: 't1',
          maxTier: 2,
          nodes: [
            { topicId: 'a', title: 'A', tier: 1, learningObjective: '', prerequisites: [] },
            {
              topicId: 'b',
              title: 'B',
              tier: 2,
              learningObjective: '',
              prerequisites: [{ topicId: 'a', minLevel: 2 }],
            },
          ],
        },
      ];
      const crystalsL1 = [createActiveCrystal('a', 100)];
      const blocked = getTopicUnlockStatus('b', crystalsL1, 1, graphMin2, []);
      expect(blocked.hasPrerequisites).toBe(false);
      expect(blocked.missingPrerequisites[0]).toMatchObject({
        topicId: 'a',
        requiredLevel: 2,
        currentLevel: 1,
      });

      const crystalsL2 = [createActiveCrystal('a', 200)];
      const open = getTopicUnlockStatus('b', crystalsL2, 1, graphMin2, []);
      expect(open.hasPrerequisites).toBe(true);
      expect(open.canUnlock).toBe(true);
    });
  });

  describe('applyCrystalXpDelta', () => {
    it('returns null when topic is missing', () => {
      expect(applyCrystalXpDelta([createActiveCrystal('a', 0)], 'missing', 50)).toBeNull();
    });

    it('applies delta, clamps at zero, and reports level gains', () => {
      const crystals = [createActiveCrystal('topic-a', 95)];
      const result = applyCrystalXpDelta(crystals, 'topic-a', 15);
      expect(result).not.toBeNull();
      expect(result!.nextXp).toBe(110);
      expect(result!.previousLevel).toBe(0);
      expect(result!.nextLevel).toBe(1);
      expect(result!.levelsGained).toBe(1);
      expect(result!.nextActiveCrystals[0]?.xp).toBe(110);
      expect(crystals[0]?.xp).toBe(95);
    });
  });
});
