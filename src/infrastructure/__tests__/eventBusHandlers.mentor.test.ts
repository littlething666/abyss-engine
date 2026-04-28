import { beforeEach, describe, expect, it, vi } from 'vitest';

const { busApi, mentorApi, orchestratorApi, toastApi, telemetryApi, deckApi } =
  vi.hoisted(() => {
    const handlers = new Map<string, Array<(payload: unknown) => void>>();
    const mentorState = {
      firstSubjectGenerationEnqueuedAt: null as number | null,
      markFirstSubjectGenerationEnqueued: vi.fn(),
    };
    mentorState.markFirstSubjectGenerationEnqueued.mockImplementation((atMs: number) => {
      mentorState.firstSubjectGenerationEnqueuedAt = atMs;
    });

    return {
      busApi: {
        handlers,
        on: vi.fn((event: string, handler: (payload: unknown) => void) => {
          const existing = handlers.get(event) ?? [];
          existing.push(handler);
          handlers.set(event, existing);
          return vi.fn();
        }),
        emit: vi.fn((event: string, payload: unknown) => {
          for (const handler of handlers.get(event) ?? []) {
            handler(payload);
          }
        }),
      },
      mentorApi: {
        handleMentorTrigger: vi.fn(),
        state: mentorState,
      },
      orchestratorApi: {
        execute: vi.fn().mockResolvedValue({ ok: true }),
      },
      toastApi: {
        error: vi.fn(),
        success: vi.fn(),
      },
      telemetryApi: {
        log: vi.fn(),
      },
      deckApi: {
        getManifest: vi.fn().mockResolvedValue({ subjects: [] }),
      },
    };
  });

// ---- Heavy-collaborator mocks ---------------------------------------------
//
// eventBusHandlers.ts imports a deep tree of LLM, repository and pipeline
// modules at module init. None of those are exercised by the
// `crystal.trial.awaiting` watcher, but their import side-effects (DB
// constructors, env reads, etc.) would make this test brittle. We stub them
// all out and only let the real `useCrystalTrialStore` and our
// `handleMentorTrigger` spy run.

vi.mock('@/features/mentor', () => ({
  handleMentorTrigger: mentorApi.handleMentorTrigger,
  MENTOR_VOICE_ID: 'witty-sarcastic',
  useMentorStore: {
    getState: () => mentorApi.state,
  },
}));

vi.mock('@/infrastructure/di', () => ({
  deckRepository: {
    getManifest: deckApi.getManifest,
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
    execute: orchestratorApi.execute,
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
  telemetry: telemetryApi,
}));

vi.mock('@/infrastructure/toast', () => ({
  toast: toastApi,
}));

vi.mock('../pubsub', () => ({
  pubSubClient: { on: vi.fn(), emit: vi.fn() },
}));

vi.mock('../eventBus', () => ({
  appEventBus: { on: busApi.on, emit: busApi.emit, off: vi.fn() },
}));

// ---- Real imports under test ----------------------------------------------

import { handleMentorTrigger } from '@/features/mentor';
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
  mentorApi.state.firstSubjectGenerationEnqueuedAt = null;
  mentorApi.state.markFirstSubjectGenerationEnqueued.mockClear();
  orchestratorApi.execute.mockReset();
  orchestratorApi.execute.mockResolvedValue({ ok: true });
  deckApi.getManifest.mockReset();
  deckApi.getManifest.mockResolvedValue({ subjects: [] });
  toastApi.error.mockReset();
  toastApi.success.mockReset();
  telemetryApi.log.mockReset();
  busApi.emit.mockClear();
  handleMentorTriggerSpy.mockReset();
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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

describe('eventBusHandlers — subject generation mentor wiring', () => {
  it('fires the start mentor trigger and records the first subject generation enqueue', async () => {
    busApi.emit('subject:generation-pipeline', {
      subjectId: 'calculus',
      checklist: { topicName: 'Calculus' },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generation.started', {
      subjectName: 'Calculus',
    });
    expect(mentorApi.state.markFirstSubjectGenerationEnqueued).toHaveBeenCalledTimes(1);
    expect(telemetryApi.log).toHaveBeenCalledWith(
      'mentor_first_subject_generation_enqueued',
      expect.objectContaining({
        triggerId: 'onboarding.first_subject',
        voiceId: 'witty-sarcastic',
      }),
      { subjectId: 'calculus' },
    );
  });

  it('routes failed subject generation to a generic toast and mentor failure trigger', async () => {
    orchestratorApi.execute.mockResolvedValueOnce({
      ok: false,
      error: 'edges failed',
      pipelineId: 'pipeline-1',
      stage: 'edges',
    });

    busApi.emit('subject:generation-pipeline', {
      subjectId: 'calculus',
      checklist: { topicName: 'Calculus' },
    });
    await flushMicrotasks();

    expect(toastApi.error).toHaveBeenCalledWith(
      'Curriculum generation needs attention: Calculus',
    );
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generation.failed', {
      subjectName: 'Calculus',
      stage: 'edges',
      pipelineId: 'pipeline-1',
    });
    expect(telemetryApi.log).toHaveBeenCalledWith(
      'subject_graph_generation_failed',
      expect.objectContaining({
        subjectId: 'calculus',
        subjectName: 'Calculus',
        pipelineId: 'pipeline-1',
        stage: 'edges',
        error: 'edges failed',
      }),
      { subjectId: 'calculus' },
    );
  });

  it('routes subjectGraph.generated through success toast and mentor completion trigger', async () => {
    deckApi.getManifest.mockResolvedValueOnce({
      subjects: [{ id: 'calculus', name: 'Calculus' }],
    });

    busApi.emit('subjectGraph.generated', {
      subjectId: 'calculus',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(toastApi.success).toHaveBeenCalledWith('Curriculum generated: Calculus');
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generated', {
      subjectName: 'Calculus',
    });
  });
});
