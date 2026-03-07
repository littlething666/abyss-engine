import { beforeEach, describe, expect, it } from 'vitest';
import { useProgressionStore } from '.';
import { Card, ActiveCrystal } from '../../types';
import { SubjectGraph } from '../../types/core';
import { AttunementPayload } from '../../types/progression';

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

function crystal(topicId: string): ActiveCrystal {
  return {
    topicId,
    gridPosition: [0, 0],
    xp: 0,
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
  useProgressionStore.setState({
    isCurrentCardFlipped: false,
    unlockedTopicIds: [],
    lockedTopics: [],
    sm2Data: {},
    activeCrystals: [],
    activeBuffs: [],
    attunementSessions: [],
    pendingAttunement: null,
    currentSubjectId: null,
    currentSession: null,
    levelUpMessage: null,
    unlockPoints: 0,
  });
}

function ritualPayload(topicId: string): AttunementPayload {
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

describe('progressionStore card-only canonical API', () => {
  beforeEach(() => {
    resetStore();
  });

  it('starts a study session using card input and advances to next card on submit', () => {
    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      unlockedTopicIds: ['topic-a'],
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
      lockedTopics: ['topic-b'],
    });

    const startResult = useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    expect(startResult).toBeUndefined();

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

  it('uses graph prerequisites and unlock points when unlocking topics', () => {
    useProgressionStore.setState({
      lockedTopics: ['topic-a', 'topic-b'],
      unlockedTopicIds: [],
      activeCrystals: [],
      unlockPoints: 2,
    });

    const firstUnlock = useProgressionStore.getState().unlockTopic('topic-a', topicGraphs);
    expect(firstUnlock).not.toBeNull();

    useProgressionStore.getState().addXP('topic-a', 250);

    const dependentUnlock = useProgressionStore.getState().unlockTopic('topic-b', topicGraphs);
    expect(dependentUnlock).not.toBeNull();

    expect(useProgressionStore.getState().unlockedTopicIds).toContain('topic-b');
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

  it('stores attunement submission and starts session with derived buffs', () => {
    const cards = [createCard('a-1'), createCard('a-2')];
    useProgressionStore.setState({
      unlockedTopicIds: ['topic-a'],
      activeCrystals: [crystal('topic-a')],
      unlockPoints: 3,
      lockedTopics: ['topic-b'],
    });

    useProgressionStore.getState().openAttunementForTopic('topic-a', cards);
    const result = useProgressionStore.getState().submitAttunement(ritualPayload('topic-a'));
    expect(result).not.toBeNull();
    expect(result?.buffs.length).toBeGreaterThan(0);

    const stateAfterSubmission = useProgressionStore.getState();
    const expectedSessionId = stateAfterSubmission.pendingAttunement?.sessionId;
    expect(expectedSessionId).toBeDefined();
    expect(stateAfterSubmission.pendingAttunement?.topicId).toBe('topic-a');
    expect(stateAfterSubmission.attunementSessions).toHaveLength(1);
    expect(stateAfterSubmission.activeBuffs).toHaveLength(result?.buffs.length || 0);
    expect(stateAfterSubmission.activeBuffs[0]?.condition).toBeDefined();

    useProgressionStore.getState().startTopicStudySession('topic-a', cards);
    const startedState = useProgressionStore.getState().currentSession;
    expect(useProgressionStore.getState().pendingAttunement).toBeNull();
    expect(startedState?.sessionId).toBe(expectedSessionId);
    expect(startedState?.activeBuffIds).toEqual(expect.arrayContaining(result?.buffs.map((buff) => buff.buffId) ?? []));

    useProgressionStore.getState().submitStudyResult('a-1', 4);
    useProgressionStore.getState().submitStudyResult('a-2', 4);

    const allSessions = useProgressionStore.getState().attunementSessions;
    const sessionRecord = allSessions[allSessions.length - 1];
    expect(sessionRecord?.completedAt).not.toBeNull();
    expect(sessionRecord?.totalAttempts).toBe(2);
    expect(sessionRecord?.sessionDurationMs).toBeGreaterThanOrEqual(0);
    expect(sessionRecord?.correctRate).toBe(1);
    expect(useProgressionStore.getState().activeBuffs).toHaveLength(0);
  });
});
