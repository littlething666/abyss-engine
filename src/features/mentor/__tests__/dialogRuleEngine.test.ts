import { beforeEach, describe, expect, it } from 'vitest';

import { evaluateTrigger, interpolate } from '../dialogRuleEngine';
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
});

describe('evaluateTrigger', () => {
  const rng = () => 0;

  it('returns null for one-shot triggers already seen', () => {
    useMentorStore.setState({
      seenTriggers: ['onboarding.welcome'],
      playerName: null,
    });
    expect(evaluateTrigger('onboarding.welcome', {}, { rng })).toBeNull();
  });

  it('returns null when cooldown is active', () => {
    const now = 1_000_000;
    useMentorStore.setState({ cooldowns: { 'crystal.leveled': now - 1000 } });
    expect(
      evaluateTrigger('crystal.leveled', { from: 1, to: 2 }, { nowMs: now, rng }),
    ).toBeNull();
  });

  it('returns a plan when cooldown has elapsed', () => {
    const now = 1_000_000;
    useMentorStore.setState({ cooldowns: { 'crystal.leveled': now - 120_000 } });
    const plan = evaluateTrigger(
      'crystal.leveled',
      { from: 1, to: 2 },
      { nowMs: now, rng },
    );
    expect(plan).not.toBeNull();
    expect(plan!.priority).toBe(70);
    expect(plan!.trigger).toBe('crystal.leveled');
    expect(plan!.messages[0]?.text).toContain('2');
  });

  it('skips onboarding.first_subject if generation already enqueued', () => {
    useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: 12345 });
    expect(evaluateTrigger('onboarding.first_subject', {}, { rng })).toBeNull();
  });

  it('mentor.bubble.click is always allowed', () => {
    expect(evaluateTrigger('mentor.bubble.click', {}, { rng })).not.toBeNull();
  });

  it('interpolates subject generation payloads into generated lines', () => {
    const identityRng = () => 0.99;
    const plan = evaluateTrigger(
      'subject.generated',
      { subjectName: 'Topology' },
      { rng: identityRng },
    );

    expect(plan).not.toBeNull();
    expect(plan!.messages[0]?.text).toContain('Topology');
    expect(plan!.messages[0]?.mood).toBe('celebrate');
  });

  it('adds a discovery-modal action to subject generation success messages', () => {
    const plan = evaluateTrigger('subject.generated', { subjectName: 'Topology' }, { rng: () => 0.99 });

    expect(plan).not.toBeNull();
    expect(plan!.messages[0]?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'open-discovery', effect: { kind: 'open_discovery' } }),
      ]),
    );
  });

  it('suppresses duplicate subject.generation.started chatter while one is current', () => {
    useMentorStore.setState({
      currentDialog: {
        id: 'current-start',
        trigger: 'subject.generation.started',
        priority: 72,
        enqueuedAt: 1,
        messages: [{ id: 'm1', text: 'Generating...', mood: 'hint' }],
        source: 'canned',
        voiceId: 'witty-sarcastic',
      },
    });

    expect(
      evaluateTrigger('subject.generation.started', { subjectName: 'Calculus' }, { rng }),
    ).toBeNull();
  });

  it('adds a visible generation HUD choice to failed subject-generation lines', () => {
    const identityRng = () => 0.99;
    const plan = evaluateTrigger(
      'subject.generation.failed',
      { subjectName: 'Calculus' },
      { rng: identityRng },
    );

    expect(plan).not.toBeNull();
    expect(plan!.messages[0]?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'open-generation-hud',
          effect: { kind: 'open_generation_hud' },
        }),
      ]),
    );
  });

  it('uses the player name when set', () => {
    useMentorStore.setState({ playerName: 'Sergio' });
    // Fisher-Yates with rng()->0.99 leaves the order as the identity
    // [0, 1, 2], so variant 0 — the only mentor.bubble.click line that
    // contains the {name} placeholder — is selected deterministically.
    const identityRng = () => 0.99;
    const plan = evaluateTrigger('mentor.bubble.click', {}, { rng: identityRng });
    expect(plan).not.toBeNull();
    const fullText = plan!.messages.map((m) => m.text).join(' ');
    expect(fullText).toContain('Sergio');
  });
});

describe('interpolate', () => {
  it('formats correctRate as a percentage', () => {
    expect(interpolate('{correctRate}', { correctRate: 0.83 })).toBe('83%');
  });
  it('passes through plain numbers', () => {
    expect(interpolate('Level {to}', { to: 4 })).toBe('Level 4');
  });
  it('leaves unknown placeholders intact', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
  });
  it('replaces null/undefined placeholders with the literal source', () => {
    expect(interpolate('Hello {name}', { name: null })).toBe('Hello {name}');
  });
});
