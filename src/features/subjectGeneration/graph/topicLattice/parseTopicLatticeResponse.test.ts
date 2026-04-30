import { describe, expect, it } from 'vitest';

import { parseTopicLatticeResponse } from './parseTopicLatticeResponse';

describe('parseTopicLatticeResponse', () => {
  it('parses wrapped JSON', () => {
    const topics = Array.from({ length: 15 }, (_, i) => ({
      topicId: `id-${i + 1}`,
      title: `Title ${i}`,
      tier: Math.floor(i / 5) + 1,
      learningObjective: 'Learn something.',
      iconName: 'lightbulb',
    }));
    const raw = `Here:\n\`\`\`json\n${JSON.stringify({ topics })}\n\`\`\``;
    const r = parseTopicLatticeResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lattice.topics).toHaveLength(15);
  });

  it('rejects invalid kebab id', () => {
    const raw = JSON.stringify({
      topics: [
        {
          topicId: 'Bad_Case',
          title: 'x',
          tier: 1,
          learningObjective: 'y',
          iconName: 'lightbulb',
        },
      ],
    });
    const r = parseTopicLatticeResponse(raw);
    expect(r.ok).toBe(false);
  });
});
