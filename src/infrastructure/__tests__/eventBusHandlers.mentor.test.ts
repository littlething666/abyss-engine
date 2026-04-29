import { beforeEach, describe, expect, it, vi } from 'vitest';

const BAND_CAP_XP = 99; // CRYSTAL_XP_PER_LEVEL (100) - 1

const {
  busApi,
  mentorApi,
  orchestratorApi,
  toastApi,
  telemetryApi,
  deckApi,
  progressionApi,
} = vi.hoisted(() => {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  const mentorState = {
    firstSubjectGenerationEnqueuedAt: null as number | null,
    markFirstSubjectGenerationEnqueued: vi.fn(),
  };
  mentorState.markFirstSubjectGenerationEnqueued.mockImplementation((atMs: number) => {
    mentorState.firstSubjectGenerationEnqueuedAt = atMs;
  });

  // Minimal subscribable progression-store mock. The real store is a
  // zustand store; eventBusHandlers only depends on `getState().activeCrystals`
  // and `subscribe(listener)` for the trial-availability watcher.
  type ActiveCrystal = { subjectId: string; topicId: string; xp: number };
  type ProgressionState = {
    activeCrystals: Array<ActiveCrystal>;
    currentSession: null;
  };
  let state: ProgressionState = { activeCrystals: [], currentSession: null };
  const listeners = new Set<() => void>();

  const progressionStoreMock = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActiveCrystals: (crystals: Array<ActiveCrystal>) => {
      state = { ...state, activeCrystals: crystals };
      for (const l of listeners) l();
    },
    reset: () => {
      state = { activeCrystals: [], currentSession: null };
    },
  };

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
    progressionApi: progressionStoreMock,
  };
});

// ---- Heavy-collaborator mocks ---------------------------------------------
//
// eventBusHandlers.ts imports a deep tree of LLM, repository and pipeline
// modules at module init. None of those are exercised by the
// `crystal.trial.available_for_player` watcher, but their import side-effects
// (DB constructors, env reads, etc.) would make this test brittle. We stub
// them all out and only let the real `useCrystalTrialStore`, our hand-rolled
// progression-store mock, and our `handleMentorTrigger` spy run.

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
  // Reproduce the production semantics here so the test does not depend on
  // the real selector module: a trial is available iff the store status is
  // `awaiting_player` AND the per-crystal XP is at the band cap.
  isCrystalTrialAvailableForPlayer: (
    status: string | undefined,
    xp: number,
  ) => status === 'awaiting_player' && xp >= BAND_CAP_XP,
}));

vi.mock('@/features/progression/progressionStore', () => ({
  useProgressionStore: progressionApi,
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

// Side-effect import: registers all bus handlers (incl. the trial-
// availability watcher) under the `__abyssEventBusHandlersRegistered`
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
  // Reset trial store + progression store. The watcher fires on these
  // resets, but since the previous and next snapshots both result in empty
  // available sets, no entries dispatch a mentor trigger. We mockReset
  // afterwards regardless to ignore any noise.
  useCrystalTrialStore.setState({
    trials: {},
    cooldownCardsReviewed: {},
    cooldownStartedAt: {},
  });
  progressionApi.reset();
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

describe('eventBusHandlers \u2014 crystal-trial availability watcher', () => {
  it('fires when status flips to awaiting_player AND XP is already at the band cap', () => {
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP },
    ]);
    handleMentorTriggerSpy.mockReset();

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
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith(
      'crystal.trial.available_for_player',
      { topic: 'topic-1' },
    );
  });

  it('does NOT fire when status flips to awaiting_player but XP is below the band cap', () => {
    // "Prepared but XP-deficient" — the modal would show "Trial Prepared"
    // and the bus must stay quiet so the mentor does not announce a
    // trial the player cannot start.
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP - 50 },
    ]);
    handleMentorTriggerSpy.mockReset();

    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
        }),
      },
    });

    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
  });

  it('fires when XP catches up after the trial was already prepared', () => {
    // Step 1: trial prepared while crystal is XP-deficient — no fire.
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP - 1 },
    ]);
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
        }),
      },
    });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
    handleMentorTriggerSpy.mockReset();

    // Step 2: progression store reports the player has caught up. The
    // watcher must observe the false→true transition through the
    // progression-store subscription and fire exactly once.
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP },
    ]);
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith(
      'crystal.trial.available_for_player',
      { topic: 'topic-1' },
    );
  });

  it('does NOT re-fire once a key is already in the available set', () => {
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP + 30 },
    ]);
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
        }),
      },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    handleMentorTriggerSpy.mockReset();

    // Unrelated mutations — different XP value still above the cap, fresh
    // trial entry object identity — must not retrigger.
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP + 40 },
    ]);
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

  it('drops the key (no fire) when status falls out of available, then re-fires on next true transition', () => {
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP },
    ]);
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
        }),
      },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    handleMentorTriggerSpy.mockReset();

    // Status moves to in_progress (modal opened) — falls out of available.
    // The watcher silently drops the key from the available set; no fire.
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'in_progress',
          topicId: 'topic-1',
        }),
      },
    });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();

    // Status transitions back to awaiting_player (e.g. cooldown→retry); the
    // key is no longer in the available set, so the false→true edge must
    // re-fire exactly once.
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
        }),
      },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith(
      'crystal.trial.available_for_player',
      { topic: 'topic-1' },
    );
  });

  it('drops disappeared keys without re-firing on recreate', () => {
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP },
    ]);
    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
        }),
      },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    handleMentorTriggerSpy.mockReset();

    // clearTrial — the trial entry is removed from the store entirely. The
    // watcher must drop the key from its `availableKeys` set so a freshly
    // created trial for the same topic re-fires the false→true edge.
    useCrystalTrialStore.setState({ trials: {} });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();

    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'awaiting_player',
          topicId: 'topic-1',
          trialId: 'trial-recreated',
        }),
      },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
  });

  it('fires per newly-available trial in a single multi-trial update', () => {
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP },
      { subjectId: 'subj-1', topicId: 'topic-2', xp: BAND_CAP_XP + 10 },
      { subjectId: 'subj-1', topicId: 'topic-3', xp: 0 },
    ]);
    handleMentorTriggerSpy.mockReset();

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
          // Prepared but XP-deficient — must not fire.
          status: 'awaiting_player',
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
      expect(call[0]).toBe('crystal.trial.available_for_player');
    }
  });

  it('does NOT fire on transitions into non-awaiting_player statuses regardless of XP', () => {
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP * 5 },
    ]);
    handleMentorTriggerSpy.mockReset();

    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({
          status: 'pregeneration',
          topicId: 'topic-1',
        }),
      },
    });
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

  it('passes the trial topicId (not subjectId or trialId) in the payload', () => {
    progressionApi.setActiveCrystals([
      { subjectId: 'subj-9', topicId: 'derivatives', xp: BAND_CAP_XP },
    ]);
    handleMentorTriggerSpy.mockReset();

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

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith(
      'crystal.trial.available_for_player',
      { topic: 'derivatives' },
    );
  });
});

describe('eventBusHandlers \u2014 subject generation mentor wiring', () => {
  it('fires the start mentor trigger and records the first subject generation enqueue', async () => {
    busApi.emit('subject:generation-pipeline', {
      subjectId: 'calculus',
      checklist: { topicName: 'Calculus' },
    });
    await flushMicrotasks();

    // The bus handler always passes stage:'topics' so the rule engine can
    // select the topics-stage variant pool.
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generation.started', {
      subjectName: 'Calculus',
      stage: 'topics',
    });
    expect(mentorApi.state.markFirstSubjectGenerationEnqueued).toHaveBeenCalledTimes(1);
    expect(telemetryApi.log).toHaveBeenCalledWith(
      'mentor_first_subject_generation_enqueued',
      expect.objectContaining({
        // Collapsed-onboarding refactor renamed the trigger id from
        // 'onboarding.first_subject' to the canonical pre_first_subject.
        triggerId: 'onboarding.pre_first_subject',
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

  it('subjectGraph.generated fires subject.generated when the subject already has unlocked topics', async () => {
    // Use a unique subjectId so the module-scoped firedSubjectUnlockFirstCrystal
    // dedupe set (which persists across tests because the handlers module is
    // loaded once per process) does not interfere.
    deckApi.getManifest.mockResolvedValueOnce({
      subjects: [{ id: 'celebrate-subj-1', name: 'Celebration Subject' }],
    });
    progressionApi.setActiveCrystals([
      { subjectId: 'celebrate-subj-1', topicId: 'topic-already-unlocked', xp: 0 },
    ]);
    handleMentorTriggerSpy.mockReset();

    busApi.emit('subjectGraph.generated', {
      subjectId: 'celebrate-subj-1',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(toastApi.success).toHaveBeenCalledWith('Curriculum generated: Celebration Subject');
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generated', {
      subjectName: 'Celebration Subject',
    });
    // Onboarding branch must NOT fire when there is at least one unlocked
    // topic in the subject — the player is past the first-crystal moment.
    expect(handleMentorTriggerSpy).not.toHaveBeenCalledWith(
      'onboarding.subject_unlock_first_crystal',
      expect.anything(),
    );
  });

  it('subjectGraph.generated fires the onboarding trigger with subjectId+subjectName when no topic in the subject is unlocked yet', async () => {
    deckApi.getManifest.mockResolvedValueOnce({
      subjects: [{ id: 'first-crystal-subj-1', name: 'Topology' }],
    });
    // activeCrystals contains an unrelated subject's crystal — the branch
    // must scope its check to the just-generated subjectId.
    progressionApi.setActiveCrystals([
      { subjectId: 'unrelated-subj', topicId: 'unrelated-topic', xp: 0 },
    ]);
    handleMentorTriggerSpy.mockReset();

    busApi.emit('subjectGraph.generated', {
      subjectId: 'first-crystal-subj-1',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith(
      'onboarding.subject_unlock_first_crystal',
      { subjectName: 'Topology', subjectId: 'first-crystal-subj-1' },
    );
    // Generic celebration must NOT fire on the same emit — the branches
    // are mutually exclusive per the plan.
    expect(handleMentorTriggerSpy).not.toHaveBeenCalledWith(
      'subject.generated',
      expect.anything(),
    );
  });

  it('subjectGraph.generated dedupes the onboarding trigger per subjectId across regenerates in the same session', async () => {
    // First emit: no unlocked topics — onboarding fires.
    deckApi.getManifest.mockResolvedValue({
      subjects: [{ id: 'first-crystal-subj-2', name: 'Linear Algebra' }],
    });
    progressionApi.setActiveCrystals([]);
    handleMentorTriggerSpy.mockReset();

    busApi.emit('subjectGraph.generated', {
      subjectId: 'first-crystal-subj-2',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith(
      'onboarding.subject_unlock_first_crystal',
      { subjectName: 'Linear Algebra', subjectId: 'first-crystal-subj-2' },
    );
    handleMentorTriggerSpy.mockReset();

    // Second emit: same subjectId, still no unlocked topics. The dedupe set
    // already contains this subjectId, so the handler must fall back to the
    // generic celebration line instead of re-firing the onboarding prod.
    busApi.emit('subjectGraph.generated', {
      subjectId: 'first-crystal-subj-2',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generated', {
      subjectName: 'Linear Algebra',
    });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalledWith(
      'onboarding.subject_unlock_first_crystal',
      expect.anything(),
    );
  });
});
