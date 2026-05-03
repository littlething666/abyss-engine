import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { failureKeyForJob, failureKeyForRetryRoutingInstance } from '@/features/contentGeneration';

const BAND_CAP_XP = 99; // CRYSTAL_XP_PER_LEVEL (100) - 1

const {
  busApi,
  mentorApi,
  orchestratorApi,
  telemetryApi,
  deckApi,
  progressionApi,
  studySessionApi,
} = vi.hoisted(() => {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  const mentorState = {
    firstSubjectGenerationEnqueuedAt: null as number | null,
    markFirstSubjectGenerationEnqueued: vi.fn(),
  };
  mentorState.markFirstSubjectGenerationEnqueued.mockImplementation((atMs: number) => {
    mentorState.firstSubjectGenerationEnqueuedAt = atMs;
  });

  // Phase 1 step 6 (a-d): eventBusHandlers reads from the new
  // `useCrystalGardenStore` (activeCrystals) and `useStudySessionStore`
  // (currentSession) instead of the legacy `useProgressionStore`. We mock
  // both new-store paths here. The garden mock keeps the same shape as
  // before (`getState()` + `subscribe(listener)`); the session mock is
  // minimal because the mentor specs do not exercise the
  // `study-panel:opened` handler.
  type ActiveCrystal = { subjectId: string; topicId: string; xp: number };
  type CrystalGardenState = { activeCrystals: Array<ActiveCrystal> };
  let crystalGardenState: CrystalGardenState = { activeCrystals: [] };
  const listeners = new Set<() => void>();

  const crystalGardenStoreMock = {
    getState: () => crystalGardenState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setActiveCrystals: (crystals: Array<ActiveCrystal>) => {
      crystalGardenState = { ...crystalGardenState, activeCrystals: crystals };
      for (const l of listeners) l();
    },
    reset: () => {
      crystalGardenState = { activeCrystals: [] };
    },
  };

  const studySessionStoreMock = {
    getState: () => ({ currentSession: null }),
    subscribe: vi.fn(),
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
    mentorApi: { handleMentorTrigger: vi.fn(), state: mentorState },
    orchestratorApi: { execute: vi.fn().mockResolvedValue({ ok: true }) },
    telemetryApi: { log: vi.fn() },
    deckApi: { getManifest: vi.fn().mockResolvedValue({ subjects: [] }) },
    progressionApi: crystalGardenStoreMock,
    studySessionApi: studySessionStoreMock,
  };
});

vi.mock('@/features/mentor', () => ({
  handleMentorTrigger: mentorApi.handleMentorTrigger,
  MENTOR_VOICE_ID: 'witty-sarcastic',
  useMentorStore: { getState: () => mentorApi.state },
}));

vi.mock('@/infrastructure/di', () => ({
  deckRepository: { getManifest: deckApi.getManifest },
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

vi.mock('@/features/contentGeneration/pipelines/runTopicGenerationPipeline', () => ({
  runTopicGenerationPipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/features/subjectGeneration', () => ({
  createSubjectGenerationOrchestrator: vi.fn(() => ({ execute: orchestratorApi.execute })),
  resolveSubjectGenerationStageBindings: vi.fn(() => ({})),
}));

vi.mock('@/features/crystalTrial/generateTrialQuestions', () => ({
  generateTrialQuestions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/features/crystalTrial', () => ({
  resolveCrystalTrialPregenerateLevels: vi.fn(() => null),
  busMayStartTrialPregeneration: vi.fn(() => false),
  isCrystalTrialAvailableForPlayer: (status: string | undefined, xp: number) =>
    status === 'awaiting_player' && xp >= BAND_CAP_XP,
}));

vi.mock('@/features/progression/stores/crystalGardenStore', () => ({
  useCrystalGardenStore: progressionApi,
}));

vi.mock('@/features/progression/stores/studySessionStore', () => ({
  useStudySessionStore: studySessionApi,
}));

vi.mock('@/features/progression/progressionUtils', () => ({
  calculateLevelFromXP: vi.fn(() => 1),
}));

vi.mock('@/features/progression/crystalCeremonyStore', () => ({
  crystalCeremonyStore: { getState: () => ({ presentCeremony: vi.fn() }) },
}));

vi.mock('@/store/crystalContentCelebrationStore', () => ({
  useCrystalContentCelebrationStore: { getState: () => ({ dismissPending: vi.fn() }) },
}));

vi.mock('@/features/telemetry', () => ({ telemetry: telemetryApi }));

vi.mock('../pubsub', () => ({ pubSubClient: { on: vi.fn(), emit: vi.fn() } }));

vi.mock('../eventBus', () => ({
  appEventBus: { on: busApi.on, emit: busApi.emit, off: vi.fn() },
}));

import { handleMentorTrigger } from '@/features/mentor';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';
import type { CrystalTrial } from '@/types/crystalTrial';

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
    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP }]);
    handleMentorTriggerSpy.mockReset();

    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({ status: 'awaiting_player', subjectId: 'subj-1', topicId: 'topic-1' }),
      },
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal-trial:available-for-player', { topic: 'topic-1' });
  });

  it('does NOT fire when status flips to awaiting_player but XP is below the band cap', () => {
    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP - 50 }]);
    handleMentorTriggerSpy.mockReset();

    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1' }) },
    });

    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
  });

  it('fires when XP catches up after the trial was already prepared', () => {
    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP - 1 }]);
    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1' }) },
    });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
    handleMentorTriggerSpy.mockReset();

    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP }]);
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal-trial:available-for-player', { topic: 'topic-1' });
  });

  it('does NOT re-fire once a key is already in the available set', () => {
    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP + 30 }]);
    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1' }) },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    handleMentorTriggerSpy.mockReset();

    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP + 40 }]);
    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1', score: 0.5 }) },
    });

    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
  });

  it('drops the key (no fire) when status falls out of available, then re-fires on next true transition', () => {
    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP }]);
    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1' }) },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    handleMentorTriggerSpy.mockReset();

    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'in_progress', topicId: 'topic-1' }) },
    });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();

    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1' }) },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal-trial:available-for-player', { topic: 'topic-1' });
  });

  it('drops disappeared keys without re-firing on recreate', () => {
    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP }]);
    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1' }) },
    });
    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    handleMentorTriggerSpy.mockReset();

    useCrystalTrialStore.setState({ trials: {} });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();

    useCrystalTrialStore.setState({
      trials: {
        'subj-1::topic-1': trialFixture({ status: 'awaiting_player', topicId: 'topic-1', trialId: 'trial-recreated' }),
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
        'subj-1::topic-1': trialFixture({ status: 'awaiting_player', subjectId: 'subj-1', topicId: 'topic-1' }),
        'subj-1::topic-2': trialFixture({ status: 'awaiting_player', subjectId: 'subj-1', topicId: 'topic-2' }),
        'subj-1::topic-3': trialFixture({ status: 'awaiting_player', subjectId: 'subj-1', topicId: 'topic-3' }),
      },
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(2);
    const topics = handleMentorTriggerSpy.mock.calls.map((c) => (c[1] as { topic: string }).topic).sort();
    expect(topics).toEqual(['topic-1', 'topic-2']);
    for (const call of handleMentorTriggerSpy.mock.calls) {
      expect(call[0]).toBe('crystal-trial:available-for-player');
    }
  });

  it('does NOT fire on transitions into non-awaiting_player statuses regardless of XP', () => {
    progressionApi.setActiveCrystals([{ subjectId: 'subj-1', topicId: 'topic-1', xp: BAND_CAP_XP * 5 }]);
    handleMentorTriggerSpy.mockReset();

    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'pregeneration', topicId: 'topic-1' }) },
    });
    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'in_progress', topicId: 'topic-1' }) },
    });
    useCrystalTrialStore.setState({
      trials: { 'subj-1::topic-1': trialFixture({ status: 'cooldown', topicId: 'topic-1' }) },
    });

    expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
  });

  it('passes the trial topicId (not subjectId or trialId) in the payload', () => {
    progressionApi.setActiveCrystals([{ subjectId: 'subj-9', topicId: 'derivatives', xp: BAND_CAP_XP }]);
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

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal-trial:available-for-player', { topic: 'derivatives' });
  });
});

describe('eventBusHandlers \u2014 subject generation mentor wiring', () => {
  it('fires the start mentor trigger and records the first subject generation enqueue', async () => {
    busApi.emit('subject-graph:generation-requested', { subjectId: 'calculus', checklist: { topicName: 'Calculus' } });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject:generation-started', {
      subjectName: 'Calculus',
      stage: 'topics',
    });
    expect(mentorApi.state.markFirstSubjectGenerationEnqueued).toHaveBeenCalledTimes(1);
    expect(telemetryApi.log).toHaveBeenCalledWith(
      'mentor:first-subject-generation-enqueued',
      expect.objectContaining({ triggerId: 'onboarding:pre-first-subject', voiceId: 'witty-sarcastic' }),
      { subjectId: 'calculus' },
    );
  });

  it('routes failed subject generation to a mentor failure trigger and telemetry', async () => {
    orchestratorApi.execute.mockImplementationOnce(async () => {
      busApi.emit('subject-graph:generation-failed', {
        subjectId: 'calculus',
        subjectName: 'Calculus',
        pipelineId: 'pipeline-1',
        stage: 'edges',
        error: 'edges failed',
        jobId: 'edges-job-1',
        failureKey: failureKeyForJob('edges-job-1'),
      });
      return { ok: false, error: 'edges failed', pipelineId: 'pipeline-1', stage: 'edges' };
    });

    busApi.emit('subject-graph:generation-requested', { subjectId: 'calculus', checklist: { topicName: 'Calculus' } });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject:generation-failed', {
      subjectName: 'Calculus',
      stage: 'edges',
      pipelineId: 'pipeline-1',
      jobId: 'edges-job-1',
      failureKey: failureKeyForJob('edges-job-1'),
    });
    expect(telemetryApi.log).toHaveBeenCalledWith(
      'subject-graph:generation-failed',
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

  it('subject-graph:generated fires subject:generated when the subject already has unlocked topics', async () => {
    deckApi.getManifest.mockResolvedValueOnce({
      subjects: [{ id: 'celebrate-subj-1', name: 'Celebration Subject' }],
    });
    progressionApi.setActiveCrystals([
      { subjectId: 'celebrate-subj-1', topicId: 'topic-already-unlocked', xp: 0 },
    ]);
    handleMentorTriggerSpy.mockReset();

    busApi.emit('subject-graph:generated', {
      subjectId: 'celebrate-subj-1',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject:generated', { subjectName: 'Celebration Subject' });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalledWith(
      'onboarding:subject-unlock-first-crystal',
      expect.anything(),
    );
  });

  it('subject-graph:generated fires the onboarding trigger with subjectId+subjectName when no topic in the subject is unlocked yet', async () => {
    deckApi.getManifest.mockResolvedValueOnce({
      subjects: [{ id: 'first-crystal-subj-1', name: 'Topology' }],
    });
    progressionApi.setActiveCrystals([{ subjectId: 'unrelated-subj', topicId: 'unrelated-topic', xp: 0 }]);
    handleMentorTriggerSpy.mockReset();

    busApi.emit('subject-graph:generated', {
      subjectId: 'first-crystal-subj-1',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('onboarding:subject-unlock-first-crystal', {
      subjectName: 'Topology',
      subjectId: 'first-crystal-subj-1',
    });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalledWith('subject:generated', expect.anything());
  });

  it('subject-graph:generated dedupes the onboarding trigger per subjectId across regenerates in the same session', async () => {
    deckApi.getManifest.mockResolvedValue({
      subjects: [{ id: 'first-crystal-subj-2', name: 'Linear Algebra' }],
    });
    progressionApi.setActiveCrystals([]);
    handleMentorTriggerSpy.mockReset();

    busApi.emit('subject-graph:generated', {
      subjectId: 'first-crystal-subj-2',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('onboarding:subject-unlock-first-crystal', {
      subjectName: 'Linear Algebra',
      subjectId: 'first-crystal-subj-2',
    });
    handleMentorTriggerSpy.mockReset();

    busApi.emit('subject-graph:generated', {
      subjectId: 'first-crystal-subj-2',
      boundModel: 'edges-model',
      stageADurationMs: 100,
      stageBDurationMs: 200,
      retryCount: 0,
      lattice: { topics: [] },
    });
    await flushMicrotasks();

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject:generated', { subjectName: 'Linear Algebra' });
    expect(handleMentorTriggerSpy).not.toHaveBeenCalledWith(
      'onboarding:subject-unlock-first-crystal',
      expect.anything(),
    );
  });
});

describe('eventBusHandlers \u2014 content generation mentor wiring (Phase C)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('topic-content:generation-completed with stage="full" fires topic-content:generation-ready with the full primitive payload', () => {
    busApi.emit('topic-content:generation-completed', {
      subjectId: 'subj-c1',
      topicId: 'topic-c1',
      topicLabel: 'Limits',
      pipelineId: 'pipeline-c1',
      stage: 'full',
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('topic-content:generation-ready', {
      subjectId: 'subj-c1',
      topicId: 'topic-c1',
      topicLabel: 'Limits',
      pipelineId: 'pipeline-c1',
    });
  });

  it.each(['theory', 'study-cards', 'mini-games'])(
    'topic-content:generation-completed with partial stage=%s does NOT fire any mentor trigger (HUD-only)',
    (stage) => {
      busApi.emit('topic-content:generation-completed', {
        subjectId: 'subj-c2',
        topicId: 'topic-c2',
        topicLabel: 'Derivatives',
        pipelineId: 'pipeline-c2',
        stage,
      });
      expect(handleMentorTriggerSpy).not.toHaveBeenCalled();
    },
  );

  it('topic-content:generation-failed fires the matching mentor trigger and console.errors at the boundary', () => {
    busApi.emit('topic-content:generation-failed', {
      subjectId: 'subj-c3',
      topicId: 'topic-c3',
      topicLabel: 'Integrals',
      pipelineId: 'pipeline-c3',
      stage: 'theory',
      errorMessage: 'theory upstream failed',
      jobId: 'job-theory-1',
      failureKey: failureKeyForJob('job-theory-1'),
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('topic-content:generation-failed', {
      subjectId: 'subj-c3',
      topicId: 'topic-c3',
      topicLabel: 'Integrals',
      errorMessage: 'theory upstream failed',
      jobId: 'job-theory-1',
      failureKey: failureKeyForJob('job-theory-1'),
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('topic-content:generation-failed'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('theory upstream failed'));
  });

  it('topic-expansion:generation-failed forwards the level so the expansion copy can interpolate the band', () => {
    busApi.emit('topic-expansion:generation-failed', {
      subjectId: 'subj-c4',
      topicId: 'topic-c4',
      topicLabel: 'Series convergence',
      level: 2,
      errorMessage: 'expansion at L2 failed',
      jobId: 'exp-job-1',
      failureKey: failureKeyForJob('exp-job-1'),
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('topic-expansion:generation-failed', {
      subjectId: 'subj-c4',
      topicId: 'topic-c4',
      topicLabel: 'Series convergence',
      level: 2,
      errorMessage: 'expansion at L2 failed',
      jobId: 'exp-job-1',
      failureKey: failureKeyForJob('exp-job-1'),
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('topic-expansion:generation-failed'));
  });

  it('crystal-trial:generation-failed forwards the level so the trial copy can name the band', () => {
    busApi.emit('crystal-trial:generation-failed', {
      subjectId: 'subj-c5',
      topicId: 'topic-c5',
      topicLabel: 'Eigenvectors',
      level: 3,
      errorMessage: 'trial questions empty',
      jobId: 'trial-job-1',
      failureKey: failureKeyForJob('trial-job-1'),
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal-trial:generation-failed', {
      subjectId: 'subj-c5',
      topicId: 'topic-c5',
      topicLabel: 'Eigenvectors',
      level: 3,
      errorMessage: 'trial questions empty',
      jobId: 'trial-job-1',
      failureKey: failureKeyForJob('trial-job-1'),
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('crystal-trial:generation-failed'));
  });

  it('content-generation:retry-failed forwards jobLabel for retry-routing-collapse copy', () => {
    const failureInstanceId = '00000000-0000-4000-8000-000000000099';
    const failureKey = failureKeyForRetryRoutingInstance(failureInstanceId);
    busApi.emit('content-generation:retry-failed', {
      subjectId: 'subj-c6',
      topicId: 'topic-c6',
      topicLabel: 'Discrete probability',
      jobLabel: 'Theory generation',
      errorMessage: 'missing checklist context',
      jobId: 'orig-job-1',
      failureInstanceId,
      failureKey,
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledTimes(1);
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('content-generation:retry-failed', {
      subjectId: 'subj-c6',
      topicId: 'topic-c6',
      topicLabel: 'Discrete probability',
      jobLabel: 'Theory generation',
      errorMessage: 'missing checklist context',
      jobId: 'orig-job-1',
      failureInstanceId,
      failureKey,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('content-generation:retry-failed'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Theory generation'));
  });
});
