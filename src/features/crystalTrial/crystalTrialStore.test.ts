import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrystalTrialScenarioQuestion, CrystalTrialStatus } from '@/types/crystalTrial';
import { appEventBus } from '@/infrastructure/eventBus';
import { topicRefKey } from '@/lib/topicRef';
import { PASS_THRESHOLD } from './crystalTrialConfig';
import { useCrystalTrialStore } from './crystalTrialStore';

function resetTrialStore() {
  useCrystalTrialStore.setState({
    trials: {},
    cooldownCardsReviewed: {},
    cooldownStartedAt: {},
  });

  if (typeof globalThis.window !== 'undefined' && globalThis.window.localStorage) {
    globalThis.window.localStorage.removeItem('abyss-crystal-trial-v2');
  }
}

function makeQuestion(id: string, correctAnswer: string): CrystalTrialScenarioQuestion {
  return {
    id,
    category: 'interview',
    scenario: `Scenario ${id}`,
    question: `What is ${id}?`,
    options: ['Alpha', 'Beta', 'Gamma', correctAnswer],
    correctAnswer,
    explanation: `Explanation ${id}`,
    sourceCardSummaries: ['a', 'b'],
  };
}

function seedTrial(
  status: CrystalTrialStatus,
  subjectId: string,
  topicId: string,
  questions: CrystalTrialScenarioQuestion[] = [
    makeQuestion('q1', 'A'),
    makeQuestion('q2', 'B'),
    makeQuestion('q3', 'C'),
    makeQuestion('q4', 'D'),
  ],
): { subjectId: string; topicId: string } {
  const key = topicRefKey({ subjectId, topicId });
  const trial = {
    trialId: `trial-${subjectId}-${topicId}-L1`,
    subjectId,
    topicId,
    targetLevel: 2,
    questions,
    status,
    answers: {},
    score: null,
    passThreshold: PASS_THRESHOLD,
    createdAt: Date.now(),
    completedAt: null,
    cardPoolHash: null,
  };
  useCrystalTrialStore.setState({
    trials: { ...useCrystalTrialStore.getState().trials, [key]: trial },
  });
  return { subjectId, topicId };
}

describe('forceCompleteWithCorrectAnswers', () => {
  beforeEach(() => {
    resetTrialStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forces an awaiting_player trial to pass by filling correct answers and submitting', () => {
    const subjectId = 'data-science';
    const topicId = 'topic-a';
    const ref = seedTrial('awaiting_player', subjectId, topicId);
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    const result = useCrystalTrialStore.getState().forceCompleteWithCorrectAnswers(ref);
    const trial = useCrystalTrialStore.getState().getCurrentTrial(ref);

    expect(result).not.toBeNull();
    expect(result?.passed).toBe(true);
    expect(result?.score).toBe(1);
    expect(trial?.status).toBe('passed');
    expect(trial?.answers).toEqual({
      q1: 'A',
      q2: 'B',
      q3: 'C',
      q4: 'D',
    });
    expect(emitSpy).toHaveBeenCalledWith('crystal-trial:completed', {
      subjectId,
      topicId,
      targetLevel: 2,
      passed: true,
      score: 1,
      trialId: trial?.trialId,
    });
  });

  it('forces an in_progress trial to pass with correct answers', () => {
    const subjectId = 'data-science';
    const topicId = 'topic-b';
    const ref = seedTrial('in_progress', subjectId, topicId);
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    const result = useCrystalTrialStore.getState().forceCompleteWithCorrectAnswers(ref);
    const trial = useCrystalTrialStore.getState().getCurrentTrial(ref);

    expect(result).not.toBeNull();
    expect(result?.passed).toBe(true);
    expect(result?.score).toBe(1);
    expect(trial?.status).toBe('passed');
    expect(emitSpy).toHaveBeenCalledWith('crystal-trial:completed', {
      subjectId,
      topicId,
      targetLevel: 2,
      passed: true,
      score: 1,
      trialId: trial?.trialId,
    });
  });

  it('does nothing when trial is not in awaiting_player or in_progress', () => {
    const ref = seedTrial('idle', 'data-science', 'topic-c');
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    const result = useCrystalTrialStore.getState().forceCompleteWithCorrectAnswers(ref);

    expect(result).toBeNull();
    const trial = useCrystalTrialStore.getState().getCurrentTrial(ref);
    expect(trial?.status).toBe('idle');
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('does nothing when there are no questions to evaluate', () => {
    const subjectId = 'data-science';
    const topicId = 'topic-empty';
    const ref = seedTrial('awaiting_player', subjectId, topicId, []);
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    const result = useCrystalTrialStore.getState().forceCompleteWithCorrectAnswers(ref);

    expect(result).toBeNull();
    const trial = useCrystalTrialStore.getState().getCurrentTrial(ref);
    expect(trial?.status).toBe('in_progress');
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
