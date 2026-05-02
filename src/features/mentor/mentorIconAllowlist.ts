import type { MentorIconName } from '@/types/core';

/**
 * Curated allowlist of icon names available to the floating mentor bubble.
 *
 * Source of truth for:
 *  - The pure visual selector (`selectMentorBubbleVisual`)
 *  - Mood / phase / alert glyph mapping
 *  - 3D mentor-bubble generated icon nodes
 *
 * Manual maintenance only. Adding or removing an entry requires concurrent
 * updates to the literal union `MentorIconName` (in `src/types/core.ts`) and
 * to the build-time generator (`scripts/generate-mentor-icon-nodes.ts`). A
 * bidirectional coverage test (`mentorIconAllowlist.test.ts`) verifies the
 * runtime list and the type union stay in sync.
 *
 * The mentor and topic icon vocabularies are intentionally disjoint: each
 * surface owns its own allowlist, drawer wrapper, and generated nodes file.
 */
export const MENTOR_ICON_NAMES = [
  // Mood (5) — Lucide
  'smile',
  'laugh',
  'frown',
  'party-popper',
  'lightbulb',
  // Subject-graph phase (2) — Lucide
  'compass',
  'network',
  // Alert (1) — Lucide
  'triangle-alert',
  // Neutral / mentor identity (1) — custom hand-authored primitives
  'philosopher-stone',
] as const satisfies readonly MentorIconName[];

/**
 * Type guard. Use only at validation/parse boundaries; downstream code should
 * already operate on `MentorIconName`.
 */
export function isMentorIconName(value: string): value is MentorIconName {
  return (MENTOR_ICON_NAMES as readonly string[]).includes(value);
}
