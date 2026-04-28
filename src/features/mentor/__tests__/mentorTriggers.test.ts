import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../dialogRuleEngine', async () => {
  const actual = await vi.importActual<typeof import('../dialogRuleEngine')>(
    '../dialogRuleEngine',
  );
  return {
    ...actual,
    evaluateTrigger: vi.fn(actual.evaluateTrigger),
  };
});

import { evaluateTrigger } from '../dialogRuleEngine';
import { handleMentorTrigger } from '../mentorTriggers';
import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '../mentorStore';

beforeEach(() => {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
  vi.mocked(evaluateTrigger).mockClear();
});

describe('handleMentorTrigger', () => {
  it('enqueues the plan returned by evaluateTrigger and records its cooldown when present', () => {
    handleMentorTrigger('crystal.leveled', { from: 1, to: 2 });

    expect(evaluateTrigger).toHaveBeenCalledWith('crystal.leveled', { from: 1, to: 2 });
    const after = useMentorStore.getState();
    expect(after.dialogQueue).toHaveLength(1);
    expect(after.dialogQueue[0]?.trigger).toBe('crystal.leveled');
    expect(after.cooldowns['crystal.leveled']).toBeGreaterThan(0);
  });

  it('is a silent no-op when evaluateTrigger returns null (suppressed by rules)', () => {
    vi.mocked(evaluateTrigger).mockReturnValueOnce(null);

    handleMentorTrigger('onboarding.pre_first_subject');

    expect(useMentorStore.getState().dialogQueue).toHaveLength(0);
    expect(useMentorStore.getState().currentDialog).toBeNull();
  });
});
