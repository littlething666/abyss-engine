import { describe, expect, it } from 'vitest';

import type { TopicIconName as CoreTopicIconName } from '@/types/core';

import { TOPIC_ICON_NAMES, isTopicIconName, type TopicIconName } from './topicIconAllowlist';

/**
 * Compile-time guard: the literal union mirrored in `src/types/core.ts` must stay
 * in sync (bidirectional assignability) with the runtime allowlist union.
 * If this fails to compile, update one to match the other.
 */
const _typeBidirectional: TopicIconName extends CoreTopicIconName
  ? CoreTopicIconName extends TopicIconName
    ? true
    : never
  : never = true;
void _typeBidirectional;

describe('topicIconAllowlist', () => {
  it('contains 40 curated icon names', () => {
    expect(TOPIC_ICON_NAMES).toHaveLength(40);
  });

  it('has no duplicate entries', () => {
    expect(new Set(TOPIC_ICON_NAMES).size).toBe(TOPIC_ICON_NAMES.length);
  });

  it('uses lowercase kebab-case for every entry', () => {
    const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const name of TOPIC_ICON_NAMES) {
      expect(name).toMatch(kebab);
    }
  });

  it('isTopicIconName narrows allowlisted values and rejects unknowns', () => {
    expect(isTopicIconName('atom')).toBe(true);
    expect(isTopicIconName('not-a-real-icon')).toBe(false);
  });
});
