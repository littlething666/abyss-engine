import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TRIGGER_SPECS,
  __resetTopicReadyDedupeForTests,
  evaluateTrigger,
} from '../dialogRuleEngine';
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

beforeEach(() => {
  resetStore();
  __resetTopicReadyDedupeForTests();
});
afterEach(() => {
  resetStore();
  __resetTopicReadyDedupeForTests();
});

describe('Phase A trigger priorities (locked)', () => {
  it('matches the locked priority table from the plan', () => {
    expect(TRIGGER_SPECS['content-generation:retry-failed'].priority).toBe(85);
    expect(TRIGGER_SPECS['topic-content:generation-failed'].priority).toBe(84);
    expect(TRIGGER_SPECS['topic-expansion:generation-failed'].priority).toBe(84);
    expect(TRIGGER_SPECS['crystal-trial:generation-failed'].priority).toBe(83);
    expect(TRIGGER_SPECS['topic-content:generation-ready'].priority).toBe(40);
    // Sanity: existing triggers stay where they were.
    expect(TRIGGER_SPECS['subject:generation-failed'].priority).toBe(82);
    expect(TRIGGER_SPECS['crystal-trial:available-for-player'].priority).toBe(75);
  });
});

describe('topic-content:generation-failed', () => {
  it('builds a single concern message with open-generation-hud + dismiss CTAs', () => {
    const plan = evaluateTrigger(
      'topic-content:generation-failed',
      { topicLabel: 'Topology', subjectId: 'subj-topology', topicId: 't1' },
      { nowMs: 0 },
    );
    expect(plan).not.toBeNull();
    expect(plan!.priority).toBe(84);
    expect(plan!.messages).toHaveLength(1);
    const msg = plan!.messages[0];
    expect(msg.id).toBe('topic-content-generation-failed');
    expect(msg.mood).toBe('concern');
    const choiceIds = msg.choices?.map((c) => c.id) ?? [];
    expect(choiceIds).toEqual(['open-generation-hud', 'dismiss']);
    expect(msg.choices?.[0].effect).toEqual({ kind: 'open_generation_hud' });
  });

  it('interpolates topicLabel into the variant text', () => {
    const plan = evaluateTrigger(
      'topic-content:generation-failed',
      { topicLabel: 'Quantum Computing' },
      { nowMs: 0 },
    );
    expect(plan!.messages[0].text).toContain('Quantum Computing');
  });

  it('does not dedupe — successive failures both produce plans', () => {
    const a = evaluateTrigger('topic-content:generation-failed', { topicLabel: 'X' }, { nowMs: 0 });
    const b = evaluateTrigger('topic-content:generation-failed', { topicLabel: 'X' }, { nowMs: 1 });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });
});

describe('topic-expansion:generation-failed', () => {
  it('interpolates level into the copy and exposes generation HUD CTA', () => {
    const plan = evaluateTrigger(
      'topic-expansion:generation-failed',
      { topicLabel: 'Topology', level: 2 },
      { nowMs: 0 },
    );
    expect(plan).not.toBeNull();
    expect(plan!.priority).toBe(84);
    expect(plan!.messages[0].text).toContain('level 2');
    expect(plan!.messages[0].choices?.[0].effect).toEqual({ kind: 'open_generation_hud' });
  });
});

describe('crystal-trial:generation-failed', () => {
  it('builds a concern message at priority 83 with the standard CTAs', () => {
    const plan = evaluateTrigger(
      'crystal-trial:generation-failed',
      { topicLabel: 'Topology' },
      { nowMs: 0 },
    );
    expect(plan).not.toBeNull();
    expect(plan!.priority).toBe(83);
    expect(plan!.messages[0].mood).toBe('concern');
    expect(plan!.messages[0].choices?.map((c) => c.id)).toEqual([
      'open-generation-hud',
      'dismiss',
    ]);
  });
});

describe('content-generation:retry-failed', () => {
  it('uses jobLabel in the copy and routes to the generation HUD', () => {
    const plan = evaluateTrigger(
      'content-generation:retry-failed',
      { jobLabel: 'Theory — Topology' },
      { nowMs: 0 },
    );
    expect(plan).not.toBeNull();
    expect(plan!.priority).toBe(85);
    expect(plan!.messages[0].text).toContain('Theory — Topology');
    expect(plan!.messages[0].choices?.[0].effect).toEqual({ kind: 'open_generation_hud' });
  });
});

describe('topic-content:generation-ready', () => {
  it('forwards subjectId + topicId into the open_topic_study effect', () => {
    const plan = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-1',
        topicLabel: 'Topology',
        pipelineId: 'p-1',
      },
      { nowMs: 1_000 },
    );
    expect(plan).not.toBeNull();
    expect(plan!.priority).toBe(40);
    const msg = plan!.messages[0];
    expect(msg.id).toBe('topic-content-generation-ready');
    expect(msg.mood).toBe('hint');
    const open = msg.choices?.find((c) => c.id === 'open-topic-study');
    expect(open?.effect).toEqual({
      kind: 'open_topic_study',
      subjectId: 'subj-topology',
      topicId: 't-1',
    });
    const dismiss = msg.choices?.find((c) => c.id === 'dismiss');
    expect(dismiss?.next).toBe('end');
  });

  it('returns null when subjectId or topicId is missing (CTA cannot route)', () => {
    expect(
      evaluateTrigger(
        'topic-content:generation-ready',
        { topicId: 't-1', topicLabel: 'Topology' },
        { nowMs: 0 },
      ),
    ).toBeNull();
    expect(
      evaluateTrigger(
        'topic-content:generation-ready',
        { subjectId: 'subj-topology', topicLabel: 'Topology' },
        { nowMs: 0 },
      ),
    ).toBeNull();
  });

  it('dedupes by pipelineId so the same pipeline only fires once', () => {
    const first = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-1',
        topicLabel: 'Topology',
        pipelineId: 'p-1',
      },
      { nowMs: 0 },
    );
    expect(first).not.toBeNull();
    const second = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-1',
        topicLabel: 'Topology',
        pipelineId: 'p-1',
      },
      { nowMs: 60_000 },
    );
    expect(second).toBeNull();
  });

  it('cools down (subjectId, topicId) for 4 hours regardless of pipelineId', () => {
    const first = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-1',
        topicLabel: 'Topology',
        pipelineId: 'p-1',
      },
      { nowMs: 0 },
    );
    expect(first).not.toBeNull();

    // Different pipelineId, but same (subject, topic) within the 4h window:
    // suppressed by the (subjectId,topicId) cooldown.
    const within = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-1',
        topicLabel: 'Topology',
        pipelineId: 'p-2',
      },
      { nowMs: 3 * 60 * 60 * 1000 },
    );
    expect(within).toBeNull();

    // After 4h has elapsed, the cooldown lapses and a new pipeline fires.
    const after = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-1',
        topicLabel: 'Topology',
        pipelineId: 'p-3',
      },
      { nowMs: 4 * 60 * 60 * 1000 + 1 },
    );
    expect(after).not.toBeNull();
  });

  it('lets a different (subjectId, topicId) fire within the 4h window', () => {
    const a = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-1',
        topicLabel: 'Topology',
        pipelineId: 'p-1',
      },
      { nowMs: 0 },
    );
    expect(a).not.toBeNull();

    const b = evaluateTrigger(
      'topic-content:generation-ready',
      {
        subjectId: 'subj-topology',
        topicId: 't-2',
        topicLabel: 'Other Topic',
        pipelineId: 'p-2',
      },
      { nowMs: 1_000 },
    );
    expect(b).not.toBeNull();
  });
});
