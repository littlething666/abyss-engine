import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';
import type { DialogPlan, MentorTriggerId } from '../mentorTypes';

// Mock the rule engine so we control what plan (if any) is returned.
vi.mock('../dialogRuleEngine', () => ({
  evaluateTrigger: vi.fn(),
}));

import { evaluateTrigger } from '../dialogRuleEngine';
import { handleMentorTrigger } from '../mentorTriggers';

function makePlan(
  trigger: MentorTriggerId,
  overrides: Partial<DialogPlan> = {},
): DialogPlan {
  return {
    id: `plan-${trigger}`,
    trigger,
    priority: 70,
    enqueuedAt: 1_000,
    messages: [{ id: 'm', text: 'hi' }],
    source: 'canned',
    voiceId: 'witty-sarcastic',
    ...overrides,
  };
}

beforeEach(() => {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
  vi.mocked(evaluateTrigger).mockReset();
});

describe('handleMentorTrigger', () => {
  it('forwards trigger + payload to evaluateTrigger and enqueues the result', () => {
    const plan = makePlan('crystal.leveled', { enqueuedAt: 5_000 });
    vi.mocked(evaluateTrigger).mockReturnValueOnce(plan);

    handleMentorTrigger('crystal.leveled', { from: 1, to: 2 });

    expect(evaluateTrigger).toHaveBeenCalledTimes(1);
    expect(evaluateTrigger).toHaveBeenCalledWith('crystal.leveled', {
      from: 1,
      to: 2,
    });
    const queue = useMentorStore.getState().dialogQueue;
    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe('plan-crystal.leveled');
  });

  it('defaults payload to an empty object when omitted', () => {
    vi.mocked(evaluateTrigger).mockReturnValueOnce(null);

    handleMentorTrigger('session.completed');

    expect(evaluateTrigger).toHaveBeenCalledWith('session.completed', {});
  });

  it('records cooldown when the plan declares cooldownMs > 0', () => {
    const plan = makePlan('crystal.leveled', {
      enqueuedAt: 9_999,
      cooldownMs: 60_000,
    });
    vi.mocked(evaluateTrigger).mockReturnValueOnce(plan);

    handleMentorTrigger('crystal.leveled', { from: 1, to: 2 });

    expect(useMentorStore.getState().cooldowns['crystal.leveled']).toBe(9_999);
  });

  it('does NOT record cooldown when the plan has no cooldownMs', () => {
    const plan = makePlan('mentor.bubble.click');
    expect(plan.cooldownMs).toBeUndefined();
    vi.mocked(evaluateTrigger).mockReturnValueOnce(plan);

    handleMentorTrigger('mentor.bubble.click');

    expect(
      useMentorStore.getState().cooldowns['mentor.bubble.click'],
    ).toBeUndefined();
  });

  it('enqueues subject generation plans without adding unintended cooldowns', () => {
    const plan = makePlan('subject.generation.started');
    vi.mocked(evaluateTrigger).mockReturnValueOnce(plan);

    handleMentorTrigger('subject.generation.started', { subjectName: 'Calculus' });

    expect(useMentorStore.getState().dialogQueue[0]?.trigger).toBe(
      'subject.generation.started',
    );
    expect(
      useMentorStore.getState().cooldowns['subject.generation.started'],
    ).toBeUndefined();
  });

  it('does NOT record cooldown when the plan declares cooldownMs of 0', () => {
    const plan = makePlan('crystal.leveled', { cooldownMs: 0 });
    vi.mocked(evaluateTrigger).mockReturnValueOnce(plan);

    handleMentorTrigger('crystal.leveled');

    expect(useMentorStore.getState().cooldowns['crystal.leveled']).toBeUndefined();
  });

  it('is a silent no-op when evaluateTrigger returns null (suppressed by rules)', () => {
    vi.mocked(evaluateTrigger).mockReturnValueOnce(null);

    handleMentorTrigger('onboarding.welcome');

    const after = useMentorStore.getState();
    expect(after.dialogQueue).toHaveLength(0);
    expect(after.cooldowns).toEqual({});
  });
});
