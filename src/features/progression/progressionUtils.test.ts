import { describe, expect, it } from 'vitest';

import { AttunementRitualRecord } from '../../types/progression';
import { BuffEngine } from './buffs/buffEngine';
import { captureUndoSnapshot, restoreUndoSnapshot, trimUndoSnapshotStack } from './progressionUtils';

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
        rating: 3,
        difficulty: 1,
        timestamp: 1000,
        isCorrect: true,
      },
    ],
    cardDifficultyById: { 'card-1': 1, 'card-2': 1 },
  };
  const attunementSession: AttunementRitualRecord = {
    sessionId: 'session-1',
    topicId: 'topic-a',
    startedAt: Date.now() - 1000,
    completedAt: null,
    harmonyScore: 30,
    readinessBucket: 'low',
    checklist: {},
    buffs: [activeBuff],
  };

  return {
    activeCrystals: [
      {
        topicId: 'topic-a',
        gridPosition: [0, 0],
        xp: 42,
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
    levelUpMessage: null,
    isCurrentCardFlipped: true,
    activeBuffs: [activeBuff],
    attunementRituals: [attunementSession],
    studySessionHistory: [],
    pendingRitual: null,
  };
}

describe('progressionUtils', () => {
  it('captures deep snapshot state and isolates future mutations', () => {
    const state = createProgressState();
    const snapshot = captureUndoSnapshot(state);

    state.activeCrystals.push({
      topicId: 'topic-b',
      gridPosition: [1, 1],
      xp: 10,
      spawnedAt: 200,
    });
    state.currentSession.queueCardIds.push('card-3');
    state.currentSession.cardDifficultyById['card-1'] = 5;
    state.sm2Data['card-1'].repetitions = 5;

    expect(snapshot.activeCrystals).toHaveLength(1);
    expect(snapshot.currentSession.queueCardIds).toHaveLength(2);
    expect(snapshot.currentSession.cardDifficultyById['card-1']).toBe(1);
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
      cardDifficultyById: state.currentSession.cardDifficultyById,
    });
    expect(restored.currentSession.topicId).toBe('topic-a');
    expect(restored.attunementRituals).toEqual(state.attunementRituals);
    expect(restored.studySessionHistory).toEqual(state.studySessionHistory);
    expect(restored.isCurrentCardFlipped).toBe(false);
  });

  it('trims the undo stack to the configured depth', () => {
    const stack = [1, 2, 3, 4, 5];
    expect(trimUndoSnapshotStack(stack, 3)).toEqual([3, 4, 5]);
    expect(trimUndoSnapshotStack(stack, 1)).toEqual([5]);
  });
});
