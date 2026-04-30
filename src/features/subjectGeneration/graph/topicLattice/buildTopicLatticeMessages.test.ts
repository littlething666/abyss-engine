import { describe, expect, it } from 'vitest';

import type { GraphStrategy } from '@/types/generationStrategy';

import { TOPIC_ICON_NAMES } from '../topicIcons/topicIconAllowlist';

import { buildTopicLatticeMessages } from './buildTopicLatticeMessages';

const baseStrategy: GraphStrategy = {
  totalTiers: 3,
  topicsPerTier: 5,
  audienceBrief: 'Audience paragraph.',
  domainBrief: 'Machine learning',
  focusConstraints: '',
};

function systemContentOf(messages: ReturnType<typeof buildTopicLatticeMessages>): string {
  const first = messages[0];
  return typeof first?.content === 'string' ? first.content : '';
}

describe('buildTopicLatticeMessages', () => {
  it('includes domain, audience, subject id, and tier counts in system message', () => {
    const msgs = buildTopicLatticeMessages('my-subject', baseStrategy);
    expect(msgs[0].role).toBe('system');
    const sys = systemContentOf(msgs);
    expect(sys).toContain('my-subject');
    expect(sys).toContain('Machine learning');
    expect(sys).toContain('Audience paragraph.');
    expect(sys).toContain('15');
    expect(sys).toContain('Edges are generated in a later step');
  });

  it('enumerates every curated icon allowlist value in the system message', () => {
    const msgs = buildTopicLatticeMessages('my-subject', baseStrategy);
    const sys = systemContentOf(msgs);
    for (const name of TOPIC_ICON_NAMES) {
      expect(sys).toContain(name);
    }
  });

  it('puts focus constraints in user message when non-empty', () => {
    const msgs = buildTopicLatticeMessages('s', { ...baseStrategy, focusConstraints: 'Only transformers' });
    expect(msgs[1].role).toBe('user');
    const user = typeof msgs[1].content === 'string' ? msgs[1].content : '';
    expect(user).toContain('Only transformers');
  });
});
