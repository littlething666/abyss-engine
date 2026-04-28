import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Heavy-collaborator mocks ---------------------------------------------
//
// eventBusHandlers.ts imports a deep tree of LLM, repository and pipeline
// modules at module init. None of those are exercised by the
// `crystal.trial.awaiting` watcher, but their import side-effects (DB
// constructors, env reads, etc.) would make this test brittle. We stub them
// all out and only let the real `useCrystalTrialStore` and our
// `handleMentorTrigger` spy run.

vi.mock('@/features/mentor/mentorTriggers', () => ({
  handleMentorTrigger: vi.fn(),
}));

vi.mock('@/infrastructure/di', () => ({
  deckRepository: {
    getManifest: vi.fn().mockResolvedValue({ subjects: [] }),
  },
  deckWriter: {},
  chatCompletionsRepository: {},
}));

vi.mock('@/infrastructure/llmInferenceRegistry', () => ({
  getChatCompletionsRepositoryForSurface: vi.fn(() => ({})),
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => ({
  resolveEnableReasoningForSurface: vi.fn(() => false),
}));

vi.mock('@/features/contentGeneration/jobs/runExpansionJob', () => ({
  runExpansionJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  '@/features/contentGeneration/pipelines/runTopicGenerationPipeline',
  () => ({
    runTopicGenerationPipeline: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock('@/features/subjectGeneration', () => ({
  createSubjectGenerationOrchestrator: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ ok: true }),
  })),
  resolveSubjectGenerationStageBindings: vi.fn(() => ({})),
}));

vi.mock('@/features/crystalTrial/generateTrialQuestions', () => ({
  generateTrialQuestions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/features/crystalTrial', () => ({
  resolveCrystalTrialPregenerateLevels: vi.fn(() => null),
  busMayStartTrialPregeneration: vi.fn(() => false),
}));

vi.mock('@/features/progression/progressionStore', () => ({
  useProgressionStore: {
    getState: () => ({ activeCrystals: [], currentSession: null }),
  },
}));

vi.mock('@/features/progression/progressionUtils', () => ({
  calculateLevelFromXP: vi.fn(() => 1),
}));

vi.mock('@/features/progression/crystalCeremonyStore', () => ({
  crystalCeremonyStore: {
    getState: () => ({ notifyLevelUp: vi.fn() }),
  },
}));

vi.mock('@/store/crystalContentCelebrationStore', () => ({
  useCrystalContentCelebrationStore: {
    getState: () => ({ dismissPending: vi.fn() }),
  },
}));

vi.mock('@/features/telemetry', () => ({
  telemetry: { log: vi.fn() },
}));

vi.mock('@/infrastructure/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../pubsub', () => ({
  pubSubClient: { on: vi.fn(), emit: vi.fn() },
}));

vi.mock('../eventBus', () => ({
  appEventBus: { on: vi.fn(), emit: vi.fn(), off: vi.fn() },
}));

// ---- Real imports under test ----------------------------------------------

import { handleMentorTrigger } from '@/features/mentor/mentorTriggers';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';
import type { CrystalTrial } from '@/types/crystalTrial';

// Side-effect import: registers all bus handlers (incl. the crystal-trial
// awaiting_player watcher) under the `__abyssEventBusHandlersRegistered`
// global guard. Done exactly once per test process.
import '../eventBusHandlers';

const handleMentorTriggerSpy = vi.mocked(handleMentorTrigger);

function trialFixture(overrides: Partial<CrystalTrial> = {}): CrystalTrial {
  return {
    trialId: 'trial-fixture',
    subjectId: 'subj-1',
    topicId: 'topic-1',
    targetLevel: 2,
    questions: [],
    status: 'pregeneration',
    answers: {},
    score: null,
    passThreshold: 0.7,
    createdAt: 0,
    completedAt: null,
    cardPoolHash: null,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset trial store to a clean slate. The watcher fires on this reset, but
  // since the previous trials object is replaced with `{}`, no entries are
  // iterated and no mentor trigger is dispatched. We then mockReset to ignore
  // any reset-time noise that does happen.
  useCrystalTrialStore.setState({
    trials: {},
    cooldownCardsReviewed: {},
    cooldownStartedAt: {},
  });
  handleMentorTriggerSpy.mockReset();
});

describe('eventBusHandlers \u2014 crystal-trial awaiting_player watcher', () => {
  it('fires crystal.trial.awaiting when a trial transitions INTO awaiting_player', () => {
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          subjectId: 'subj-1',
          topicId: 'topic-1',
        }),
      },
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal.trial.awaiting', {
      topic: 'topic-1',
    });
  });

  it('does NOT fire when the previous snapshot already had the trial in awaiting_player', () => {
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
        }),
      },
    });
    handleMentorTriggerSpy.mockReset();

    // Replace the trials object reference (different identity, same status
    // for the entry). The watcher must short-circuit on the per-entry guard
    // `prevTrial.status === 'awaiting_player'`.
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
          score: 0.5, // unrelated field flipped to force a fresh entry object
        }),
      },
    });

    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire on transitions into non-awaiting_player statuses', () => {
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'pregeneration',
          topicId: 'topic-1',
        }),
      },
    });

    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();

    // Same store, different transitions — still no fires.
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'in_progress',
          topicId: 'topic-1',
        }),
      },
    });
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'cooldown',
          topicId: 'topic-1',
        }),
      },
    });

    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
  });

  it('short-circuits when the trials object reference is unchanged', () => {
    useCrystalTrialStore.setState({
      cooldownCardsReviewed: { 'subj-1::topic-1': 3 },
    });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
  });

  it('fires per newly-awaiting trial in a single multi-trial update', () => {
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          subjectId: 'subj-1',
          topicId: 'topic-1',
        }),
        'subj-1::topic-2': trialFixture({
          status: 'awaiting_player',
          subjectId: 'subj-1',
          topicId: 'topic-2',
        }),
        'subj-1::topic-3': trialFixture({
          status: 'pregeneration',
          subjectId: 'subj-1',
          topicId: 'topic-3',
        }),
      },
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(2);
    const topics = handleMentorTriggerSpy.mock.calls
      .map((c) => (c[1] as { topic: string }).topic)
      .sort();
    expect(topics).toEqual(['topic-1', 'topic-2']);
    for (const call of handleMentorTriggerSpy.mock.calls) {
      expect(call[0]).toBe('crystal.trial.awaiting');
    }
  });

  it('passes the trial topicId (not subjectId or trialId) in the payload', () => {
    useCrystalTrialStore.setState({
      trials: {
        'subj-9::derivatives': trialFixture({
          status: 'awaiting_player',
          subjectId: 'subj-9',
          topicId: 'derivatives',
          trialId: 'trial-derivatives-L2',
        }),
      },
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal.trial.awaiting', {
      topic: 'derivatives',
    });
  });
});
