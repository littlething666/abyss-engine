import { beforeEach, describe, expect, it } from 'vitest';

import type { ProgressionState } from '@/types/progression';
import { BuffEngine } from '../buffs/buffEngine';
import { defaultSM2 } from '../sm2';
import { undoManager } from '../undoManager';

function baseState(over: Partial<ProgressionState> = {}): ProgressionState {
  const activeBuff = BuffEngine.get().grantBuff('clarity_focus', 'quest');
  return {
    activeCrystals: [{ topicId: 'topic-a', gridPosition: [0, 0], xp: 0, spawnedAt: 1 }],
    sm2Data: {
      'card-1': { ...defaultSM2 },
    },
    unlockPoints: 3,
    currentSubjectId: null,
    currentSession: {
      topicId: 'topic-a',
      queueCardIds: ['card-1', 'card-2'],
      currentCardId: 'card-1',
      totalCards: 2,
      sessionId: 'study-session-topic-a-1',
      attempts: [],
      cardDifficultyById: { 'card-1': 1, 'card-2': 1 },
    },
    activeBuffs: [activeBuff],
    pendingRitual: null,
    lastRitualSubmittedAt: null,
    ...over,
  };
}

describe('undoManager', () => {
  beforeEach(() => {
    undoManager.reset();
  });

  it('capture → mutate via partial → undo restores snapshot fields', () => {
    const s0 = baseState();
    undoManager.capture(s0);
    const mutated: Partial<ProgressionState> = {
      sm2Data: { ...s0.sm2Data, 'card-1': { interval: 9, easeFactor: 2, repetitions: 1, nextReview: 0 } },
      currentSession: s0.currentSession
        ? {
            ...s0.currentSession,
            currentCardId: 'card-2',
          }
        : null,
    };
    const afterMutate = { ...s0, ...mutated } as ProgressionState;
    const restored = undoManager.undo(afterMutate);
    expect(restored).not.toBeNull();
    const r = restored as NonNullable<typeof restored>;
    expect(r.sm2Data).toBeDefined();
    const before = s0.sm2Data['card-1'];
    const afterSm2 = r.sm2Data!['card-1'];
    expect(before).toBeDefined();
    expect(afterSm2).toBeDefined();
    expect(afterSm2!.interval).toBe(before!.interval);
    expect(r.currentSession?.currentCardId).toBe('card-1');
  });

  it('redo after undo', () => {
    const s0 = baseState();
    undoManager.capture(s0);
    const after = {
      ...s0,
      currentSession: s0.currentSession
        ? { ...s0.currentSession, currentCardId: 'card-2' as const }
        : null,
    };
    const restored = undoManager.undo(after);
    expect(restored).not.toBeNull();
    const postUndo = { ...after, ...restored! } as ProgressionState;
    const redone = undoManager.redo(postUndo);
    expect(redone?.currentSession?.currentCardId).toBe('card-2');
  });

  it('reset clears both stacks', () => {
    undoManager.capture(baseState());
    expect(undoManager.undoStackSize).toBe(1);
    undoManager.reset();
    expect(undoManager.undoStackSize).toBe(0);
    expect(undoManager.redoStackSize).toBe(0);
  });

  it('undo on empty stack returns null', () => {
    expect(undoManager.undo(baseState())).toBeNull();
  });

  it('redo on empty stack returns null', () => {
    expect(undoManager.redo(baseState())).toBeNull();
  });

  it('capture clears redo stack', () => {
    const s0 = baseState();
    undoManager.capture(s0);
    const s1 = {
      ...s0,
      currentSession: s0.currentSession ? { ...s0.currentSession, currentCardId: 'card-2' as const } : null,
    };
    undoManager.undo(s1);
    expect(undoManager.redoStackSize).toBe(1);
    undoManager.capture({ ...s0, unlockPoints: 2 });
    expect(undoManager.redoStackSize).toBe(0);
  });
});
