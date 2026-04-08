import { describe, expect, it } from 'vitest';

import { RECENT_TOPIC_GENERATION_LOG_LIMIT, selectRecentTopicGenerationLogs } from './recentTopicGenerationLogs';

describe('selectRecentTopicGenerationLogs', () => {
  it('sorts by startedAt descending and caps at RECENT_TOPIC_GENERATION_LOG_LIMIT', () => {
    const logs = selectRecentTopicGenerationLogs({
      a: { startedAt: 100, topicId: 'a' },
      b: { startedAt: 300, topicId: 'b' },
      c: { startedAt: 200, topicId: 'c' },
    });
    expect(logs.map((l) => l.topicId)).toEqual(['b', 'c', 'a']);
  });

  it('returns fewer than limit when map is small', () => {
    const logs = selectRecentTopicGenerationLogs({
      x: { startedAt: 1, topicId: 'x' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.topicId).toBe('x');
  });

  it('keeps only the first limit entries when many topics exist', () => {
    const byTopicId: Record<string, { startedAt: number; topicId: string }> = {};
    for (let i = 0; i < RECENT_TOPIC_GENERATION_LOG_LIMIT + 5; i += 1) {
      byTopicId[`t${i}`] = { startedAt: i, topicId: `t${i}` };
    }
    const logs = selectRecentTopicGenerationLogs(byTopicId);
    expect(logs).toHaveLength(RECENT_TOPIC_GENERATION_LOG_LIMIT);
    expect(logs[0]!.startedAt).toBe(RECENT_TOPIC_GENERATION_LOG_LIMIT + 4);
  });
});
