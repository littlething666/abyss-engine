import { describe, expect, it } from 'vitest';

import type { MentorIconName as CoreMentorIconName } from '@/types/core';

import {
  MENTOR_ICON_NAMES,
  isMentorIconName,
} from '../mentorIconAllowlist';

/**
 * Compile-time guard: the runtime allowlist union must stay in sync
 * (bidirectionally assignable) with the literal union mirrored in
 * `src/types/core.ts`. If this fails to compile, update one to match the
 * other.
 */
type RuntimeMentorIconName = (typeof MENTOR_ICON_NAMES)[number];
const _typeBidirectional: RuntimeMentorIconName extends CoreMentorIconName
  ? CoreMentorIconName extends RuntimeMentorIconName
    ? true
    : never
  : never = true;
void _typeBidirectional;

describe('mentorIconAllowlist', () => {
  it('contains the 9 curated mentor-bubble glyph names', () => {
    expect(MENTOR_ICON_NAMES).toHaveLength(9);
  });

  it('has no duplicate entries', () => {
    expect(new Set(MENTOR_ICON_NAMES).size).toBe(MENTOR_ICON_NAMES.length);
  });

  it('uses lowercase kebab-case for every entry', () => {
    const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const name of MENTOR_ICON_NAMES) {
      expect(name).toMatch(kebab);
    }
  });

  it('isMentorIconName narrows allowlisted values and rejects unknowns', () => {
    expect(isMentorIconName('philosopher-stone')).toBe(true);
    expect(isMentorIconName('triangle-alert')).toBe(true);
    expect(isMentorIconName('not-a-real-icon')).toBe(false);
  });

  it('does not include `message-circle` (removed per OQ3)', () => {
    expect((MENTOR_ICON_NAMES as readonly string[]).includes('message-circle')).toBe(
      false,
    );
  });
});
