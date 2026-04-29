import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { evaluateTrigger } from '../dialogRuleEngine';
import {
  useMentorStore,
  DEFAULT_PERSISTED_STATE,
  DEFAULT_EPHEMERAL_STATE,
} from '../mentorStore';
import type { DialogPlan } from '../mentorTypes';

function resetStore(): void {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
}

function makeDummyPlan(overrides: Partial<DialogPlan> = {}): DialogPlan {
  return {
    id: 'plan-fixture',
    trigger: 'onboarding.subject_unlock_first_crystal',
    priority: 78,
    enqueuedAt: 0,
    messages: [],
    source: 'canned',
    voiceId: 'witty-sarcastic',
    cooldownMs: undefined,
    oneShot: undefined,
    ...overrides,
  };
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

  describe('onboarding.subject_unlock_first_crystal', () => {
    it('emits a single hint message carrying open-discovery and maybe-later choices', () => {
      const plan = evaluateTrigger(
        'onboarding.subject_unlock_first_crystal',
        { subjectName: 'Topology', subjectId: 'subj-topology' },
        { nowMs: 0 },
      );
      expect(plan).not.toBeNull();
      expect(plan!.messages).toHaveLength(1);

      const message = plan!.messages[0];
      expect(message.id).toBe('subject-unlock-first-crystal');
      expect(message.mood).toBe('hint');

      const choiceIds = message.choices?.map((c) => c.id) ?? [];
      expect(choiceIds).toEqual(['open-discovery', 'maybe-later']);

      const openDiscovery = message.choices?.find((c) => c.id === 'open-discovery');
      // The choice must carry the payload's subjectId into open_discovery so
      // DiscoveryModal can pre-filter without round-tripping through the bus.
      expect(openDiscovery?.effect).toEqual({
        kind: 'open_discovery',
        subjectId: 'subj-topology',
      });
      expect(openDiscovery?.next).toBe('end');
      const maybeLater = message.choices?.find((c) => c.id === 'maybe-later');
      expect(maybeLater?.next).toBe('end');
    });

    it('interpolates the payload subjectName into the variant text', () => {
      const plan = evaluateTrigger(
        'onboarding.subject_unlock_first_crystal',
        { subjectName: 'Quantum Computing', subjectId: 'subj-qc' },
        { nowMs: 0 },
      );
      expect(plan).not.toBeNull();
      expect(plan!.messages[0].text).toContain('Quantum Computing');
    });

    it('forwards undefined subjectId untouched (legacy fallback path)', () => {
      // When no subjectId is in payload, the effect leaves the field undefined
      // so DiscoveryModal falls back to its sessionStorage default (Workstream B6).
      const plan = evaluateTrigger(
        'onboarding.subject_unlock_first_crystal',
        { subjectName: 'No-Scope Subject' },
        { nowMs: 0 },
      );
      expect(plan).not.toBeNull();
      const openDiscovery = plan!.messages[0].choices?.find((c) => c.id === 'open-discovery');
      expect(openDiscovery?.effect).toEqual({ kind: 'open_discovery', subjectId: undefined });
    });

    it('returns null when a dialog of the same trigger is already current', () => {
      useMentorStore.setState({
        currentDialog: makeDummyPlan({ id: 'active', trigger: 'onboarding.subject_unlock_first_crystal' }),
      });
      const plan = evaluateTrigger(
        'onboarding.subject_unlock_first_crystal',
        { subjectName: 'Topology', subjectId: 'subj-topology' },
        { nowMs: 0 },
      );
      expect(plan).toBeNull();
    });

    it('returns null when a dialog of the same trigger is already queued', () => {
      useMentorStore.setState({
        dialogQueue: [
          makeDummyPlan({ id: 'queued', trigger: 'onboarding.subject_unlock_first_crystal' }),
        ],
      });
      const plan = evaluateTrigger(
        'onboarding.subject_unlock_first_crystal',
        { subjectName: 'Topology', subjectId: 'subj-topology' },
        { nowMs: 0 },
      );
      expect(plan).toBeNull();
    });

    it('fires alongside an unrelated current dialog of a different trigger', () => {
      // Sanity: dedupe is per-trigger, not global. A pending crystal.leveled
      // celebration must not block the onboarding prod for a freshly
      // generated subject.
      useMentorStore.setState({
        currentDialog: makeDummyPlan({
          id: 'active-leveled',
          trigger: 'crystal.leveled',
        }),
      });
      const plan = evaluateTrigger(
        'onboarding.subject_unlock_first_crystal',
        { subjectName: 'Topology', subjectId: 'subj-topology' },
        { nowMs: 0 },
      );
      expect(plan).not.toBeNull();
    });
  });
});
