import { describe, expect, it } from 'vitest';

import { ActiveCrystal, SubjectGraph } from '../../types';
import { BuffEngine } from './buffs/buffEngine';
import {
  applyCrystalXpDelta,
  captureUndoSnapshot,
  getCrystalLevelProgressToNext,
  getTopicUnlockStatus,
  restoreUndoSnapshot,
  trimUndoSnapshotStack,
} from './progressionUtils';

function createActiveCrystal(topicId: string, xp = 0): ActiveCrystal {
  return {
    topicId,
    gridPosition: [0, 0],
    xp,
    spawnedAt: 100,
  };
}

function createProgressState() {
  const activeBuff = BuffEngine.get().grantBuff('clarity_focus', 'quest');
  const studySession = {
    topicId: 'topic-a',
    queueCardIds: ['card-1', 'card-2'],
    currentCardId: 'card-1',
    totalCards: 2,
    undoStack: [],
    redoStack: [],
    attempts: [
      {
        cardId: 'card-1',
        rating: 3 as 1 | 2 | 3 | 4,
        difficulty: 1,
        timestamp: 1000,
        isCorrect: true,
      },
    ],
    cardDifficultyById: { 'card-1': 1, 'card-2': 1 },
  };
  return {
    activeCrystals: [
      {
        ...createActiveCrystal('topic-a', 42),
        spawnedAt: 100,
      },
    ],
    sm2Data: {
      'card-1': {
        interval: 1,
        easeFactor: 2.4,
        repetitions: 2,
        nextReview: Date.now() + 1000,
      },
    },
    unlockedTopicIds: ['topic-a'],
    unlockPoints: 3,
    currentSubjectId: 'subject-a',
    currentSession: studySession,
    isCurrentCardFlipped: true,
    activeBuffs: [activeBuff],
    pendingRitual: null,
  };
}

describe('progressionUtils', () => {
  it('captures deep snapshot state and isolates future mutations', () => {
    const state = createProgressState();
    const snapshot = captureUndoSnapshot(state);

    const extraCrystal: ActiveCrystal = {
      topicId: 'topic-b',
      gridPosition: [1, 1],
      xp: 10,
      spawnedAt: 200,
    };
    state.activeCrystals.push(extraCrystal);
    state.currentSession.queueCardIds.push('card-3');
    state.currentSession.cardDifficultyById!['card-1'] = 5;
    state.sm2Data['card-1'].repetitions = 5;

    expect(snapshot.activeCrystals).toHaveLength(1);
    expect(snapshot.currentSession.queueCardIds).toHaveLength(2);
    expect(snapshot.currentSession.cardDifficultyById!['card-1']).toBe(1);
    expect(snapshot.sm2Data['card-1'].repetitions).toBe(2);
    expect('undoStack' in snapshot.currentSession).toBe(false);
    expect('redoStack' in snapshot.currentSession).toBe(false);
  });

  it('restores all mutable study session fields and resets flip state', () => {
    const state = createProgressState();
    const snapshot = captureUndoSnapshot(state);
    const restoreTarget = { ...state, isCurrentCardFlipped: true };

    const restored = restoreUndoSnapshot(restoreTarget, snapshot);
    expect(restored.activeCrystals).toEqual(state.activeCrystals);
    expect(restored.currentSession).toMatchObject({
      topicId: state.currentSession.topicId,
      queueCardIds: state.currentSession.queueCardIds,
      currentCardId: state.currentSession.currentCardId,
      totalCards: state.currentSession.totalCards,
      attempts: state.currentSession.attempts,
      cardDifficultyById: state.currentSession.cardDifficultyById!,
    });
    expect(restored.currentSession.topicId).toBe('topic-a');
    expect(restored.isCurrentCardFlipped).toBe(false);
  });

  it('trims the undo stack to the configured depth', () => {
    const stack = [1, 2, 3, 4, 5];
    expect(trimUndoSnapshotStack(stack, 3)).toEqual([3, 4, 5]);
    expect(trimUndoSnapshotStack(stack, 1)).toEqual([5]);
  });

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
