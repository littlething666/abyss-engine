import { describe, expect, it } from 'vitest';

import { ActiveCrystal } from '../../types';
import { BuffEngine } from './buffs/buffEngine';
import {
  buildStudyLevelUpSteps,
  captureUndoSnapshot,
  getXpTierProgress01,
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
    studyLevelUpQueue: null,
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

  it('buildStudyLevelUpSteps returns empty when no tier change', () => {
    expect(buildStudyLevelUpSteps(1, 1, 150, 180)).toEqual([]);
  });

  it('buildStudyLevelUpSteps returns one step for a single tier jump', () => {
    expect(buildStudyLevelUpSteps(0, 1, 95, 120)).toEqual([
      {
        newLevel: 1,
        unlockPointsDelta: 1,
        crystalXpAfterStep: 120,
        xpBeforeStep: 95,
      },
    ]);
  });

  it('buildStudyLevelUpSteps chains milestones for multi-tier jumps', () => {
    expect(buildStudyLevelUpSteps(0, 2, 50, 250)).toEqual([
      {
        newLevel: 1,
        unlockPointsDelta: 1,
        crystalXpAfterStep: 100,
        xpBeforeStep: 50,
      },
      {
        newLevel: 2,
        unlockPointsDelta: 1,
        crystalXpAfterStep: 250,
        xpBeforeStep: 100,
      },
    ]);
  });

  it('getXpTierProgress01 is 1 at max tier', () => {
    expect(getXpTierProgress01(600)).toBe(1);
  });
});
