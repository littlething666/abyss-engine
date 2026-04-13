import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Card, ActiveCrystal } from '../../types';
import { SubjectGraph } from '../../types/core';
import { ATTUNEMENT_SUBMISSION_COOLDOWN_MS, MAX_UNDO_DEPTH, useProgressionStore } from '.';
import { BuffEngine } from './buffs/buffEngine';
import { AttunementRitualPayload } from '../../types/progression';
import { undoManager } from './undoManager';

function createCard(id: string): Card {
  return {
    id,
    type: 'FLASHCARD',
    difficulty: 1,
    content: {
      front: `front-${id}`,
      back: `back-${id}`,
    },
  };
}

function crystal(topicId: string, xp = 0): ActiveCrystal {
  return {
    topicId,
    gridPosition: [0, 0],
    xp,
    spawnedAt: Date.now(),
  };
}

const topicGraphs: SubjectGraph[] = [
  {
    subjectId: 'data-science',
    title: 'Data Science',
    themeId: 'default',
    maxTier: 2,
    nodes: [
      {
        topicId: 'topic-a',
        title: 'Topic A',
        tier: 1,
        prerequisites: [],
        learningObjective: 'Base',
      },
      {
        topicId: 'topic-b',
        title: 'Topic B',
        tier: 2,
        prerequisites: ['topic-a'],
        learningObjective: 'Depends on A',
      },
    ],
  },
];

function resetStore() {
  undoManager.reset();
  useProgressionStore.setState({
    sm2Data: {},
    activeCrystals: [],
    activeBuffs: [],
    pendingRitual: null,
    currentSubjectId: null,
    currentSession: null,
    unlockPoints: 0,
    lastRitualSubmittedAt: null,
  });
}

function seedLastRitualTimestamp(timestamp: number) {
  useProgressionStore.setState({ lastRitualSubmittedAt: timestamp });
}

function ritualPayload(topicId: string): AttunementRitualPayload {
  return {
    topicId,
    checklist: {
      sleepHours: 8,
      fuelQuality: 'steady-fuel',
      hydration: 'moderate',
      movementMinutes: 20,
      digitalSilence: true,
      visualClarity: true,
      lightingAndAir: true,
      targetCrystal: 'Core',
      microGoal: 'Improve recall',
      confidenceRating: 5,
    },
  };
}

function createCards(count: number): Card[] {
  return Array.from({ length: count }, (_, index) => createCard(`a-${index + 1}`));
}

describe('progressionStore card-only canonical API', () => {
  beforeEach(() => {
    resetStore();
  });

  it('starts a study session using card input and advances to next card on submit', () => {
    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);

    const sessionAfterStart = useProgressionStore.getState().currentSession;
    expect(sessionAfterStart?.topicId).toBe('topic-a');
    expect(sessionAfterStart?.currentCardId).toBe('a-1');
    expect(sessionAfterStart?.totalCards).toBe(2);

    useProgressionStore.getState().submitStudyResult('a-1', 4);
    const sessionAfterSubmit = useProgressionStore.getState().currentSession;
    expect(sessionAfterSubmit?.currentCardId).toBe('a-2');

    const updated = useProgressionStore.getState().sm2Data['a-1'];
    expect(updated).toBeDefined();
    expect(updated.interval).toBeGreaterThan(0);
  });

  it('focusStudyCard selects a different queued card without reordering the queue', () => {
    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    expect(useProgressionStore.getState().currentSession?.currentCardId).toBe('a-1');

    useProgressionStore.getState().focusStudyCard('topic-a', cards, 'a-2');
    const session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe('a-2');
    expect(session?.queueCardIds).toEqual(['a-1', 'a-2']);

    useProgressionStore.getState().submitStudyResult('a-2', 4);
    expect(useProgressionStore.getState().currentSession?.currentCardId).toBe('a-1');
  });

  it('adds an unlock point when a study result levels up a crystal', () => {
    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 95)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    useProgressionStore.getState().submitStudyResult('a-1', 4);

    const updatedState = useProgressionStore.getState();
    expect(updatedState.activeCrystals[0]).toMatchObject({ xp: 110 });
    expect(updatedState.unlockPoints).toBe(1);
  });

  it('uses graph prerequisites and unlock points when unlocking topics', () => {
    useProgressionStore.setState({
      activeCrystals: [],
      unlockPoints: 2,
    });

    const firstUnlock = useProgressionStore.getState().unlockTopic('topic-a', topicGraphs);
    expect(firstUnlock).not.toBeNull();

    useProgressionStore.getState().addXP('topic-a', 250);

    const dependentUnlock = useProgressionStore.getState().unlockTopic('topic-b', topicGraphs);
    expect(dependentUnlock).not.toBeNull();

    expect(useProgressionStore.getState().activeCrystals.map((storeCrystal) => storeCrystal.topicId)).toContain('topic-b');
  });

  it('returns deterministic topic tiers from graph data', () => {
    expect(useProgressionStore.getState().getTopicTier('topic-a', topicGraphs)).toBe(1);
    expect(useProgressionStore.getState().getTopicTier('topic-b', topicGraphs)).toBe(2);
  });

  it('counts due cards with explicit card data', () => {
    const cards = [createCard('due-1'), createCard('due-2')];
    const dueCount = useProgressionStore.getState().getDueCardsCount(cards);
    expect(dueCount).toBe(2);
  });

  it('grantBuffFromCatalog merges dev XP buff with existing buffs', () => {
    const existing = BuffEngine.get().grantBuff('clarity_focus', 'test_source', 1.2);
    useProgressionStore.setState({ activeBuffs: [existing] });

    useProgressionStore.getState().grantBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');

    const buffs = useProgressionStore.getState().activeBuffs;
    expect(buffs.some((b) => b.buffId === 'clarity_focus')).toBe(true);
    const devBuff = buffs.find((b) => b.buffId === 'dev_xp_multiplier_5x');
    expect(devBuff).toMatchObject({
      modifierType: 'xp_multiplier',
      magnitude: 5,
      condition: 'manual',
    });
  });

  it('toggleBuffFromCatalog grants then removes the same catalog buff', () => {
    useProgressionStore.getState().toggleBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');
    expect(useProgressionStore.getState().activeBuffs.some((b) => b.buffId === 'dev_xp_multiplier_5x')).toBe(true);

    useProgressionStore.getState().toggleBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');
    expect(useProgressionStore.getState().activeBuffs.some((b) => b.buffId === 'dev_xp_multiplier_5x')).toBe(false);
  });

  it('addXP clamps crystal XP at zero when subtracting', () => {
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 50)],
      unlockPoints: 3,
    });

    const nextXp = useProgressionStore.getState().addXP('topic-a', -80);
    expect(nextXp).toBe(0);
    expect(useProgressionStore.getState().activeCrystals[0]?.xp).toBe(0);
  });

  it('addXP grants unlock points when crossing a level boundary', () => {
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 95)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().addXP('topic-a', 15);

    const updated = useProgressionStore.getState();
    expect(updated.activeCrystals[0]).toMatchObject({ xp: 110 });
    expect(updated.unlockPoints).toBe(1);
  });

  it('stores attunement submission and starts session with derived buffs', () => {
    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    const result = useProgressionStore.getState().submitAttunementRitual(ritualPayload('topic-a'));
    expect(result).not.toBeNull();
    expect(result?.buffs.length).toBeGreaterThan(0);

    const stateAfterSubmission = useProgressionStore.getState();
    const expectedSessionId = stateAfterSubmission.pendingRitual?.sessionId;
    expect(expectedSessionId).toBeDefined();
    expect(stateAfterSubmission.pendingRitual?.topicId).toBe('topic-a');
    expect(stateAfterSubmission.activeBuffs).toHaveLength(result?.buffs.length || 0);
    expect(stateAfterSubmission.activeBuffs[0]?.condition).toBeDefined();

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    const startedState = useProgressionStore.getState().currentSession;
    expect(useProgressionStore.getState().pendingRitual).toBeNull();
    expect(startedState?.sessionId).toBe(expectedSessionId);
    expect(startedState?.activeBuffIds).toEqual(expect.arrayContaining(result?.buffs.map((buff) => buff.buffId) ?? []));

    useProgressionStore.getState().submitStudyResult('a-1', 4);
    useProgressionStore.getState().submitStudyResult('a-2', 4);

    expect(useProgressionStore.getState().activeBuffs).toHaveLength(0);
  });

  it('blocks attunement submission while cooldown is active', () => {
    const now = Date.now();
    seedLastRitualTimestamp(now);
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    const result = useProgressionStore.getState().submitAttunementRitual(ritualPayload('topic-a'));
    expect(result).toBeNull();
    expect(useProgressionStore.getState().getRemainingRitualCooldownMs(now + 60 * 60 * 1000)).toBeGreaterThan(0);
  });

  it('allows attunement submission once cooldown window has passed', () => {
    const now = Date.now();
    seedLastRitualTimestamp(now - (ATTUNEMENT_SUBMISSION_COOLDOWN_MS + 60 * 60 * 1000));
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    const result = useProgressionStore.getState().submitAttunementRitual(ritualPayload('topic-a'));
    expect(result).not.toBeNull();
    expect(result?.buffs.length).toBeGreaterThan(0);
  });

  it('supports multiple undo/redo steps in a single study session', () => {
    const cards = [createCard('a-1'), createCard('a-2'), createCard('a-3')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    useProgressionStore.getState().submitStudyResult('a-1', 4);
    useProgressionStore.getState().submitStudyResult('a-2', 3);

    let session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe('a-3');
    expect(undoManager.undoStackSize).toBe(2);
    expect(undoManager.redoStackSize).toBe(0);

    useProgressionStore.getState().undoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe('a-2');
    expect(undoManager.undoStackSize).toBe(1);
    expect(undoManager.redoStackSize).toBe(1);

    useProgressionStore.getState().undoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe('a-1');
    expect(undoManager.undoStackSize).toBe(0);
    expect(undoManager.redoStackSize).toBe(2);

    useProgressionStore.getState().redoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe('a-2');
    expect(undoManager.undoStackSize).toBe(1);
    expect(undoManager.redoStackSize).toBe(1);

    useProgressionStore.getState().redoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe('a-3');
    expect(undoManager.undoStackSize).toBe(2);
    expect(undoManager.redoStackSize).toBe(0);
  });

  it('does not persist undo stacks on the study session snapshot', () => {
    localStorage.clear();

    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });
    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    useProgressionStore.getState().submitStudyResult('a-1', 4);

    const persisted = window.localStorage.getItem('abyss-progression');
    expect(persisted).not.toBeNull();
    const storedState = persisted ? JSON.parse(persisted) : null;
    expect(storedState?.state?.currentSession?.undoStack).toBeUndefined();
    expect(storedState?.state?.currentSession?.redoStack).toBeUndefined();
  });

  it('supports deep undo history bounded by MAX_UNDO_DEPTH in memory', () => {
    const cards = createCards(MAX_UNDO_DEPTH + 5);
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);

    cards.forEach((card) => {
      useProgressionStore.getState().submitStudyResult(card.id, 4);
    });

    expect(undoManager.undoStackSize).toBe(MAX_UNDO_DEPTH);
    expect(undoManager.redoStackSize).toBe(0);

    useProgressionStore.getState().undoLastStudyResult();
    expect(undoManager.undoStackSize).toBe(MAX_UNDO_DEPTH - 1);
    expect(undoManager.redoStackSize).toBe(1);
    expect(useProgressionStore.getState().currentSession?.currentCardId).toBe(cards[cards.length - 1].id);
  });

  it('emits card:reviewed and session:completed events from submission', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    useProgressionStore.getState().submitStudyResult('a-1', 4);

    const eventCalls = dispatchSpy.mock.calls;
    const cardReviewed = eventCalls.find(
      ([event]) => event instanceof CustomEvent && event.type === 'abyss-card:reviewed',
    );
    const sessionCompleteEvent = eventCalls.find(
      ([event]) => event instanceof CustomEvent && event.type === 'abyss-session:completed',
    );

    expect(cardReviewed).toBeDefined();
    expect(sessionCompleteEvent).toBeDefined();

    const reviewPayload = (cardReviewed?.[0] as CustomEvent).detail as {
      cardId: string;
      topicId: string;
      buffedReward: number;
      rating: number;
    };
    expect(reviewPayload).toMatchObject({
      cardId: 'a-1',
      topicId: 'topic-a',
      rating: 4,
    });
    expect(reviewPayload.buffedReward).toBeGreaterThan(0);

    const sessionPayload = (sessionCompleteEvent?.[0] as CustomEvent).detail as {
      topicId: string;
      totalAttempts: number;
      correctRate: number;
    };
    expect(sessionPayload).toMatchObject({
      topicId: 'topic-a',
      totalAttempts: 1,
    });

    dispatchSpy.mockRestore();
  });

  it('emits crystal:leveled when XP crosses a level boundary', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 99)],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    useProgressionStore.getState().submitStudyResult('a-1', 4);

    const levelUpEvent = dispatchSpy.mock.calls.find(
      ([event]) => event instanceof CustomEvent && event.type === 'abyss-crystal:leveled',
    );
    expect(levelUpEvent).toBeDefined();
    const detail = (levelUpEvent?.[0] as CustomEvent).detail as {
      topicId: string;
      from: number;
      to: number;
      levelsGained: number;
    };
    expect(detail).toMatchObject({
      topicId: 'topic-a',
      from: 0,
      to: 1,
      levelsGained: 1,
    });

    dispatchSpy.mockRestore();
  });

  it('emits history events for undo and redo', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    useProgressionStore.getState().submitStudyResult('a-1', 4);
    dispatchSpy.mockClear();

    useProgressionStore.getState().undoLastStudyResult();
    const undoEvents = dispatchSpy.mock.calls.filter(
      ([event]) => event instanceof CustomEvent && event.type === 'abyss-study-panel:history',
    );
    expect(undoEvents).toHaveLength(1);
    expect((undoEvents[0]?.[0] as CustomEvent).detail).toMatchObject({
      action: 'undo',
      undoCount: 0,
      redoCount: 1,
    });

    useProgressionStore.getState().redoLastStudyResult();
    const redoEvents = dispatchSpy.mock.calls.filter(
      ([event]) => event instanceof CustomEvent && event.type === 'abyss-study-panel:history',
    );
    expect(redoEvents).toHaveLength(2);
    expect((redoEvents[1]?.[0] as CustomEvent).detail).toMatchObject({
      action: 'redo',
      undoCount: 1,
      redoCount: 0,
    });

    dispatchSpy.mockRestore();
  });

  it('does not emit history events when undo or redo are unavailable', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    dispatchSpy.mockClear();

    useProgressionStore.getState().undoLastStudyResult();
    useProgressionStore.getState().redoLastStudyResult();
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'abyss-study-panel:history',
      }),
    );

    dispatchSpy.mockRestore();
  });
});
