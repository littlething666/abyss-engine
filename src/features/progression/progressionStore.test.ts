import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardRefKey, topicRefKey } from '@/lib/topicRef';
import { Card, ActiveCrystal } from '../../types';
import { SubjectGraph } from '../../types/core';
import type { CrystalTrial, CrystalTrialStatus } from '@/types/crystalTrial';
import { appEventBus } from '@/infrastructure/eventBus';
import { ATTUNEMENT_SUBMISSION_COOLDOWN_MS, MAX_UNDO_DEPTH, useProgressionStore } from '.';
import { BuffEngine } from './buffs/buffEngine';
import { AttunementRitualPayload } from '../../types/progression';
import { undoManager } from './undoManager';
import { PASS_THRESHOLD } from '../crystalTrial/crystalTrialConfig';
import { useCrystalTrialStore } from '../crystalTrial/crystalTrialStore';

const DS = 'data-science' as const;

function topicRef(topicId: string) {
  return { subjectId: DS, topicId };
}

function cr(topicId: string, cardId: string) {
  return cardRefKey({ subjectId: DS, topicId, cardId });
}

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
    subjectId: DS,
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
    resonancePoints: 0,
  });
  useCrystalTrialStore.setState({
    trials: {},
    cooldownCardsReviewed: {},
    cooldownStartedAt: {},
  });
}

function makeTrialWithStatus(
  topicId: string,
  status: CrystalTrial['status'],
): CrystalTrial {
  return {
    trialId: `trial-${DS}-${topicId}-L1-test`,
    subjectId: DS,
    topicId,
    targetLevel: 1,
    questions: [],
    status,
    answers: {},
    score: status === 'passed' ? PASS_THRESHOLD : null,
    passThreshold: PASS_THRESHOLD,
    createdAt: Date.now(),
    completedAt: status === 'passed' ? Date.now() : null,
    cardPoolHash: null,
  };
}

const CAP_STATUSES_FOR_MATRIX: CrystalTrialStatus[] = [
  'idle',
  'pregeneration',
  'awaiting_player',
  'in_progress',
  'failed',
  'cooldown',
];

function seedLastRitualTimestamp(timestamp: number) {
  useProgressionStore.setState({ lastRitualSubmittedAt: timestamp });
}

function ritualPayload(topicId: string): AttunementRitualPayload {
  return {
    subjectId: DS,
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

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);

    const sessionAfterStart = useProgressionStore.getState().currentSession;
    expect(sessionAfterStart?.topicId).toBe('topic-a');
    expect(sessionAfterStart?.currentCardId).toBe(cr('topic-a', 'a-1'));
    expect(sessionAfterStart?.totalCards).toBe(2);

    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);
    const sessionAfterSubmit = useProgressionStore.getState().currentSession;
    expect(sessionAfterSubmit?.currentCardId).toBe(cr('topic-a', 'a-2'));

    const updated = useProgressionStore.getState().sm2Data[cr('topic-a', 'a-1')];
    expect(updated).toBeDefined();
    expect(updated.interval).toBeGreaterThan(0);
  });

  it('focusStudyCard selects a different queued card without reordering the queue', () => {
    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);
    expect(useProgressionStore.getState().currentSession?.currentCardId).toBe(cr('topic-a', 'a-1'));

    useProgressionStore.getState().focusStudyCard(topicRef('topic-a'), cards, 'a-2');
    const session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe(cr('topic-a', 'a-2'));
    expect(session?.queueCardIds).toEqual([cr('topic-a', 'a-1'), cr('topic-a', 'a-2')]);

    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-2'), 4);
    expect(useProgressionStore.getState().currentSession?.currentCardId).toBe(cr('topic-a', 'a-1'));
  });

  it('adds an unlock point when a study result levels up a crystal', () => {
    const ref = topicRef('topic-a');
    const key = topicRefKey(ref);
    useCrystalTrialStore.setState({
      trials: { [key]: makeTrialWithStatus('topic-a', 'passed') },
    });

    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 95)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().startTopicStudySession(ref, cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

    const updatedState = useProgressionStore.getState();
    expect(updatedState.activeCrystals[0]).toMatchObject({ xp: 110 });
    expect(updatedState.unlockPoints).toBe(1);
  });

  it('caps XP at level boundary during awaiting_player and still grants Resonance on correct', () => {
    const ref = topicRef('topic-a');
    const key = topicRefKey(ref);
    useCrystalTrialStore.setState({
      trials: { [key]: makeTrialWithStatus('topic-a', 'awaiting_player') },
    });

    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 95)],
      unlockPoints: 0,
      resonancePoints: 0,
    });

    useProgressionStore.getState().startTopicStudySession(ref, cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

    expect(useProgressionStore.getState().activeCrystals[0]).toMatchObject({ xp: 99 });
    expect(useProgressionStore.getState().resonancePoints).toBe(1);
  });

  it.each(CAP_STATUSES_FOR_MATRIX)(
    'caps XP at level boundary when trial status is %s',
    (status) => {
      const ref = topicRef('topic-a');
      const key = topicRefKey(ref);
      if (status === 'idle') {
        useCrystalTrialStore.setState({ trials: {} });
      } else {
        useCrystalTrialStore.setState({
          trials: { [key]: makeTrialWithStatus('topic-a', status) },
        });
      }

      const cards = [createCard('a-1')];
      useProgressionStore.setState({
        activeCrystals: [crystal('topic-a', 95)],
        unlockPoints: 0,
        resonancePoints: 0,
      });

      useProgressionStore.getState().startTopicStudySession(ref, cards);
      useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

      expect(useProgressionStore.getState().activeCrystals[0]).toMatchObject({ xp: 99 });
    },
  );

  it('does not emit crystal:trial-pregenerate when XP is capped at boundary while trial is failed', () => {
    const ref = topicRef('topic-a');
    const key = topicRefKey(ref);
    useCrystalTrialStore.setState({
      trials: { [key]: makeTrialWithStatus('topic-a', 'failed') },
    });

    const emitSpy = vi.spyOn(appEventBus, 'emit');

    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 95)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().startTopicStudySession(ref, cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

    const pregenCalls = emitSpy.mock.calls.filter((c) => c[0] === 'crystal:trial-pregenerate');
    expect(pregenCalls).toHaveLength(0);
    emitSpy.mockRestore();
  });

  it('emits crystal:trial-pregenerate on positive XP gain during submitStudyResult', () => {
    const ref = topicRef('topic-a');
    const emitSpy = vi.spyOn(appEventBus, 'emit');
    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 10)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().startTopicStudySession(ref, cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

    const pregenCalls = emitSpy.mock.calls.filter((c) => c[0] === 'crystal:trial-pregenerate');
    expect(pregenCalls).toHaveLength(1);
    expect(pregenCalls[0]?.[1]).toMatchObject({
      subjectId: DS,
      topicId: 'topic-a',
      currentLevel: 0,
      targetLevel: 1,
    });
    emitSpy.mockRestore();
  });

  it('does not emit crystal:trial-pregenerate on addXP when trial is failed', () => {
    const ref = topicRef('topic-a');
    const key = topicRefKey(ref);
    const emitSpy = vi.spyOn(appEventBus, 'emit');
    useCrystalTrialStore.setState({
      trials: { [key]: makeTrialWithStatus('topic-a', 'failed') },
    });

    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 10)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().addXP(ref, 10);

    const pregenCalls = emitSpy.mock.calls.filter((c) => c[0] === 'crystal:trial-pregenerate');
    expect(pregenCalls).toHaveLength(0);
    emitSpy.mockRestore();
  });

  it('restores resonancePoints on undo after a correct review', () => {
    const ref = topicRef('topic-a');
    const key = topicRefKey(ref);
    useCrystalTrialStore.setState({
      trials: { [key]: makeTrialWithStatus('topic-a', 'awaiting_player') },
    });
    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 50)],
      unlockPoints: 0,
      resonancePoints: 2,
    });
    useProgressionStore.getState().startTopicStudySession(ref, cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);
    expect(useProgressionStore.getState().resonancePoints).toBe(3);
    useProgressionStore.getState().undoLastStudyResult();
    expect(useProgressionStore.getState().resonancePoints).toBe(2);
  });

  it('uses graph prerequisites and unlock points when unlocking topics', () => {
    useProgressionStore.setState({
      activeCrystals: [],
      unlockPoints: 2,
    });

    const firstUnlock = useProgressionStore.getState().unlockTopic(topicRef('topic-a'), topicGraphs);
    expect(firstUnlock).not.toBeNull();

    useProgressionStore.getState().addXP(topicRef('topic-a'), 250);

    const dependentUnlock = useProgressionStore.getState().unlockTopic(topicRef('topic-b'), topicGraphs);
    expect(dependentUnlock).not.toBeNull();

    expect(useProgressionStore.getState().activeCrystals.map((storeCrystal) => storeCrystal.topicId)).toContain('topic-b');
  });

  it('returns deterministic topic tiers from graph data', () => {
    expect(useProgressionStore.getState().getTopicTier(topicRef('topic-a'), topicGraphs)).toBe(1);
    expect(useProgressionStore.getState().getTopicTier(topicRef('topic-b'), topicGraphs)).toBe(2);
  });

  it('counts due cards with explicit card data', () => {
    const cards = [createCard('due-1'), createCard('due-2')];
    const dueCount = useProgressionStore.getState().getDueCardsCount(topicRef('topic-a'), cards);
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

    const nextXp = useProgressionStore.getState().addXP(topicRef('topic-a'), -80);
    expect(nextXp).toBe(0);
    expect(useProgressionStore.getState().activeCrystals[0]?.xp).toBe(0);
  });

  it('emits crystal:trial-pregenerate on positive XP gain during addXP', () => {
    const ref = topicRef('topic-a');
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 10)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().addXP(ref, 10);

    const pregenCalls = emitSpy.mock.calls.filter((c) => c[0] === 'crystal:trial-pregenerate');
    expect(pregenCalls).toHaveLength(1);
    expect(pregenCalls[0]?.[1]).toMatchObject({
      subjectId: DS,
      topicId: 'topic-a',
      currentLevel: 0,
      targetLevel: 1,
    });
    emitSpy.mockRestore();
  });

  it('addXP grants unlock points when crossing a level boundary', () => {
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 95)],
      unlockPoints: 0,
    });

    useProgressionStore.getState().addXP(topicRef('topic-a'), 15);

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

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);
    const startedState = useProgressionStore.getState().currentSession;
    expect(useProgressionStore.getState().pendingRitual).toBeNull();
    expect(startedState?.sessionId).toBe(expectedSessionId);
    expect(startedState?.activeBuffIds).toEqual(expect.arrayContaining(result?.buffs.map((buff) => buff.buffId) ?? []));

    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-2'), 4);

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

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-2'), 3);

    let session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe(cr('topic-a', 'a-3'));
    expect(undoManager.undoStackSize).toBe(2);
    expect(undoManager.redoStackSize).toBe(0);

    useProgressionStore.getState().undoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe(cr('topic-a', 'a-2'));
    expect(undoManager.undoStackSize).toBe(1);
    expect(undoManager.redoStackSize).toBe(1);

    useProgressionStore.getState().undoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe(cr('topic-a', 'a-1'));
    expect(undoManager.undoStackSize).toBe(0);
    expect(undoManager.redoStackSize).toBe(2);

    useProgressionStore.getState().redoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe(cr('topic-a', 'a-2'));
    expect(undoManager.undoStackSize).toBe(1);
    expect(undoManager.redoStackSize).toBe(1);

    useProgressionStore.getState().redoLastStudyResult();
    session = useProgressionStore.getState().currentSession;
    expect(session?.currentCardId).toBe(cr('topic-a', 'a-3'));
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
    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

    const persisted = window.localStorage.getItem('abyss-progression-v3');
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

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);

    cards.forEach((card) => {
      useProgressionStore.getState().submitStudyResult(cr('topic-a', card.id), 4);
    });

    expect(undoManager.undoStackSize).toBe(MAX_UNDO_DEPTH);
    expect(undoManager.redoStackSize).toBe(0);

    useProgressionStore.getState().undoLastStudyResult();
    expect(undoManager.undoStackSize).toBe(MAX_UNDO_DEPTH - 1);
    expect(undoManager.redoStackSize).toBe(1);
    expect(useProgressionStore.getState().currentSession?.currentCardId).toBe(
      cr('topic-a', cards[cards.length - 1]!.id),
    );
  });

  it('emits card:reviewed and session:completed events from submission', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

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
      subjectId: string;
      topicId: string;
      buffedReward: number;
      rating: number;
    };
    expect(reviewPayload).toMatchObject({
      cardId: cr('topic-a', 'a-1'),
      subjectId: DS,
      topicId: 'topic-a',
      rating: 4,
    });
    expect(reviewPayload.buffedReward).toBeGreaterThan(0);

    const sessionPayload = (sessionCompleteEvent?.[0] as CustomEvent).detail as {
      subjectId: string;
      topicId: string;
      totalAttempts: number;
      correctRate: number;
    };
    expect(sessionPayload).toMatchObject({
      subjectId: DS,
      topicId: 'topic-a',
      totalAttempts: 1,
    });

    dispatchSpy.mockRestore();
  });

  it('emits crystal:leveled when XP crosses a level boundary', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const ref = topicRef('topic-a');
    const key = topicRefKey(ref);
    useCrystalTrialStore.setState({
      trials: { [key]: makeTrialWithStatus('topic-a', 'passed') },
    });

    const cards = [createCard('a-1')];
    useProgressionStore.setState({
      activeCrystals: [crystal('topic-a', 99)],
      unlockPoints: 3,
    });

    useProgressionStore.getState().startTopicStudySession(ref, cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);

    const levelUpEvent = dispatchSpy.mock.calls.find(
      ([event]) => event instanceof CustomEvent && event.type === 'abyss-crystal:leveled',
    );
    expect(levelUpEvent).toBeDefined();
    const detail = (levelUpEvent?.[0] as CustomEvent).detail as {
      subjectId: string;
      topicId: string;
      from: number;
      to: number;
      levelsGained: number;
    };
    expect(detail).toMatchObject({
      subjectId: DS,
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

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);
    useProgressionStore.getState().submitStudyResult(cr('topic-a', 'a-1'), 4);
    dispatchSpy.mockClear();

    useProgressionStore.getState().undoLastStudyResult();
    const undoEvents = dispatchSpy.mock.calls.filter(
      ([event]) => event instanceof CustomEvent && event.type === 'abyss-study-panel:history',
    );
    expect(undoEvents).toHaveLength(1);
    expect((undoEvents[0]?.[0] as CustomEvent).detail).toMatchObject({
      action: 'undo',
      subjectId: DS,
      topicId: 'topic-a',
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
      subjectId: DS,
      topicId: 'topic-a',
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

    useProgressionStore.getState().startTopicStudySession(topicRef('topic-a'), cards);
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
