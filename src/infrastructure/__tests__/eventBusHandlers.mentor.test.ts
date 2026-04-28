import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appEventBus } from '@/infrastructure/appEventBus';
import {
  __resetAppEventBusHandlersForTests,
  registerAppEventBusHandlers,
} from '@/infrastructure/eventBusHandlers';
import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '@/features/mentor/mentorStore';

const handleMentorTriggerSpy = vi.fn();
vi.mock('@/features/mentor', async () => {
  const actual = await vi.importActual<typeof import('@/features/mentor')>(
    '@/features/mentor',
  );
  return {
    ...actual,
    handleMentorTrigger: (...args: unknown[]) => handleMentorTriggerSpy(...args),
  };
});

const telemetryCaptureSpy = vi.fn();
vi.mock('@/features/telemetry', () => ({
  telemetry: { capture: (...args: unknown[]) => telemetryCaptureSpy(...args) },
}));

beforeEach(() => {
  handleMentorTriggerSpy.mockReset();
  telemetryCaptureSpy.mockReset();
  __resetAppEventBusHandlersForTests();
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
});

afterEach(() => {
  __resetAppEventBusHandlersForTests();
});

describe('eventBusHandlers — mentor wiring', () => {
  it('subject:generation-pipeline enqueued: records first-subject milestone, fires onboarding.pre_first_subject telemetry, and emits started with stage:topics', () => {
    registerAppEventBusHandlers();

    appEventBus.emit('subject:generation-pipeline', {
      kind: 'enqueued',
      pipelineId: 'pipe-1',
      subjectName: 'Calculus',
      subjectId: 'calculus',
    });

    // First-subject milestone is set on the mentor store.
    expect(useMentorStore.getState().firstSubjectGenerationEnqueuedAt).not.toBeNull();

    // Telemetry follows the rename to onboarding.pre_first_subject.
    expect(telemetryCaptureSpy).toHaveBeenCalledWith(
      'mentor_trigger_fired',
      expect.objectContaining({
        triggerId: 'onboarding.pre_first_subject',
        enqueued: true,
      }),
    );

    // Started trigger now carries the stage explicitly.
    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generation.started', {
      subjectName: 'Calculus',
      stage: 'topics',
    });
  });

  it('subject:generation-pipeline failed: forwards subjectName and pipelineId', () => {
    registerAppEventBusHandlers();

    appEventBus.emit('subject:generation-pipeline', {
      kind: 'failed',
      pipelineId: 'pipe-2',
      subjectName: 'Topology',
      subjectId: 'topology',
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generation.failed', {
      subjectName: 'Topology',
      pipelineId: 'pipe-2',
    });
  });

  it('subject:generation-pipeline complete: forwards only subjectName', () => {
    registerAppEventBusHandlers();

    appEventBus.emit('subject:generation-pipeline', {
      kind: 'complete',
      pipelineId: 'pipe-3',
      subjectName: 'Linear Algebra',
      subjectId: 'linear-algebra',
    });

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('subject.generated', {
      subjectName: 'Linear Algebra',
    });
  });

  it('crystal:leveled forwards topic / from / to', () => {
    registerAppEventBusHandlers();

    appEventBus.emit('crystal:leveled', { topicId: 'limits', from: 1, to: 2 });

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('crystal.leveled', {
      topic: 'limits',
      from: 1,
      to: 2,
    });
  });

  it('session:completed forwards correctRate / totalAttempts', () => {
    registerAppEventBusHandlers();

    appEventBus.emit('session:completed', { correctRate: 0.8, totalAttempts: 10 });

    expect(handleMentorTriggerSpy).toHaveBeenCalledWith('session.completed', {
      correctRate: 0.8,
      totalAttempts: 10,
    });
  });
});
