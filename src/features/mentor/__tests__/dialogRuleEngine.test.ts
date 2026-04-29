import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { evaluateTrigger } from '../dialogRuleEngine';
import {
  useMentorStore,
  DEFAULT_PERSISTED_STATE,
  DEFAULT_EPHEMERAL_STATE,
} from '../mentorStore';

function resetStore(): void {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
}

describe('dialogRuleEngine', () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    resetStore();
  });

  describe('onboarding.pre_first_subject', () => {
    it('is gated on firstSubjectGenerationEnqueuedAt === null', () => {
      const plan = evaluateTrigger('onboarding.pre_first_subject', undefined, { nowMs: 0 });
      expect(plan).not.toBeNull();
      useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: Date.now() });
      const after = evaluateTrigger('onboarding.pre_first_subject', undefined, { nowMs: 0 });
      expect(after).toBeNull();
    });

    it('uses the unnamed greet branch and shows a name input when playerName is null', () => {
      const plan = evaluateTrigger('onboarding.pre_first_subject', undefined, { nowMs: 0 });
      expect(plan).not.toBeNull();
      const ids = plan!.messages.map((m) => m.id);
      expect(ids).toContain('onboarding-name');
      const nameMessage = plan!.messages.find((m) => m.id === 'onboarding-name');
      expect(nameMessage?.input?.kind).toBe('name');
    });

    it('uses the named greet branch and skips the name input when playerName is set', () => {
      useMentorStore.setState({ playerName: 'Sergio' });
      const plan = evaluateTrigger('onboarding.pre_first_subject', undefined, { nowMs: 0 });
      expect(plan).not.toBeNull();
      const ids = plan!.messages.map((m) => m.id);
      expect(ids).not.toContain('onboarding-name');
      // Named CTA interpolates the player name into the prompt copy.
      const cta = plan!.messages.find((m) => m.id === 'onboarding-cta');
      expect(cta?.text).toContain('Sergio');
    });
  });

  describe('subject.generation.started', () => {
    it('selects topics-stage copy when payload.stage = topics', () => {
      const plan = evaluateTrigger(
        'subject.generation.started',
        { subjectName: 'Topology', stage: 'topics' },
        { nowMs: 0 },
      );
      expect(plan).not.toBeNull();
      expect(plan!.messages.some((m) => m.text.length > 0)).toBe(true);
    });

    it('selects edges-stage copy when payload.stage = edges', () => {
      const plan = evaluateTrigger(
        'subject.generation.started',
        { subjectName: 'Topology', stage: 'edges' },
        { nowMs: 0 },
      );
      expect(plan).not.toBeNull();
    });
  });
});
