import type { GenerationAttentionPrimaryFailure } from '@/features/contentGeneration';
import type { MentorIconName } from '@/types/core';
import type { MentorMood } from './mentorTypes';

/**
 * Refreshed mood palette (OQ4):
 * - `concern` shifts from #ff9b6b to #ffba6b so it is visually distinct from
 *   the alert color.
 * - Alert color is fixed at #ff5d5d and is never used as a mood color.
 */
export const MOOD_COLOR: Record<MentorMood, string> = {
  neutral: '#9bc1ff',
  cheer: '#ffd45a',
  tease: '#ff7ec9',
  concern: '#ffba6b',
  celebrate: '#7df0e4',
  hint: '#c89bff',
};

export const ALERT_COLOR = '#ff5d5d';

/** Mood -> mentor glyph name. Exhaustive over `MentorMood`. */
export const MOOD_TO_ICON: Record<MentorMood, MentorIconName> = {
  neutral: 'philosopher-stone',
  cheer: 'smile',
  tease: 'laugh',
  concern: 'frown',
  celebrate: 'party-popper',
  hint: 'lightbulb',
};

/** Subject-graph phase -> mentor glyph name. */
export const PHASE_TO_ICON: Record<'topics' | 'edges', MentorIconName> = {
  topics: 'compass',
  edges: 'network',
};

// Idle-state opacity targets used by the component pulse driver.
const NEUTRAL_RING_OPACITY = 0.55;
const NEUTRAL_HALO_OPACITY = 0.55;
// Active (non-alert) opacity peaks; the component pulse modulates the ring
// opacity around 0.80–0.95 and the halo around 0.55–0.85.
const ACTIVE_RING_OPACITY_PEAK = 0.95;
const ACTIVE_HALO_OPACITY_PEAK = 0.85;
// Alert opacity is fixed (anti-flicker, OQ6).
const ALERT_RING_OPACITY = 1.0;
const ALERT_HALO_OPACITY = 0.95;

// Halo / base scale multipliers. Alert bumps base scale by +10%.
const BASE_SCALE_DEFAULT = 1.0;
const BASE_SCALE_ALERT = 1.1;
const HALO_SCALE_DEFAULT = 1.45;
const HALO_SCALE_ALERT = 1.65;

/**
 * Resolved visual state for the mentor bubble. Returned by the pure selector
 * and consumed by the React component, which is responsible for animation
 * timing (pulse, color cross-fade, reduced-motion clamps). The selector
 * itself never reads timers, store state, or DOM APIs.
 */
export interface MentorBubbleVisual {
  iconName: MentorIconName;
  ringColor: string;
  glyphColor: string;
  glowColor: string;
  /** Target ring opacity. Held fixed during alert (anti-flicker). */
  ringOpacity: number;
  /** Target halo opacity. Held fixed during alert (anti-flicker). */
  haloOpacity: number;
  baseScaleMultiplier: number;
  haloScaleMultiplier: number;
  /**
   * True when the bubble should pulse (mentor activity, active subject-graph
   * job, or alert). Drives the animation envelope only — never icon
   * resolution.
   */
  isActive: boolean;
  isAlert: boolean;
  /** Active subject-graph phase, mirrored from the input. Diagnostics only. */
  phase: 'topics' | 'edges' | null;
}

export interface SelectMentorBubbleVisualInput {
  mood: MentorMood | null;
  /** Affects `isActive` only. Never participates in icon resolution. */
  hasMentorActivity: boolean;
  /**
   * Present only while a subject-graph LLM job is actively running. Drives
   * the phase glyph (`compass` for topics, `network` for edges).
   */
  subjectGraphActivePhase: 'topics' | 'edges' | null;
  primaryFailure: GenerationAttentionPrimaryFailure | null;
}

/**
 * Pure visual resolution for the mentor bubble.
 *
 * Resolution rules (locked):
 *   1. `primaryFailure !== null` -> `triangle-alert`, ring/glyph/halo color
 *      `#ff5d5d`, +10% base scale, fixed ring/halo opacities (anti-flicker).
 *   2. else `mood !== null` -> mood-glyph, color `MOOD_COLOR[mood]`.
 *   3. else `subjectGraphActivePhase !== null` -> phase glyph (compass/network),
 *      color `MOOD_COLOR.hint`.
 *   4. else -> `philosopher-stone`, color `MOOD_COLOR.neutral`.
 *
 * `hasMentorActivity` enters only via `isActive` and is intentionally
 * excluded from icon resolution.
 */
export function selectMentorBubbleVisual(
  input: SelectMentorBubbleVisualInput,
): MentorBubbleVisual {
  const { mood, hasMentorActivity, subjectGraphActivePhase, primaryFailure } = input;
  const isAlert = primaryFailure !== null;
  const isActive =
    isAlert || hasMentorActivity || subjectGraphActivePhase !== null;

  if (isAlert) {
    return {
      iconName: 'triangle-alert',
      ringColor: ALERT_COLOR,
      glyphColor: ALERT_COLOR,
      glowColor: ALERT_COLOR,
      ringOpacity: ALERT_RING_OPACITY,
      haloOpacity: ALERT_HALO_OPACITY,
      baseScaleMultiplier: BASE_SCALE_ALERT,
      haloScaleMultiplier: HALO_SCALE_ALERT,
      isActive: true,
      isAlert: true,
      phase: subjectGraphActivePhase,
    };
  }

  if (mood !== null) {
    const color = MOOD_COLOR[mood];
    return {
      iconName: MOOD_TO_ICON[mood],
      ringColor: color,
      glyphColor: color,
      glowColor: color,
      ringOpacity: isActive ? ACTIVE_RING_OPACITY_PEAK : NEUTRAL_RING_OPACITY,
      haloOpacity: isActive ? ACTIVE_HALO_OPACITY_PEAK : NEUTRAL_HALO_OPACITY,
      baseScaleMultiplier: BASE_SCALE_DEFAULT,
      haloScaleMultiplier: HALO_SCALE_DEFAULT,
      isActive,
      isAlert: false,
      phase: subjectGraphActivePhase,
    };
  }

  if (subjectGraphActivePhase !== null) {
    const color = MOOD_COLOR.hint;
    return {
      iconName: PHASE_TO_ICON[subjectGraphActivePhase],
      ringColor: color,
      glyphColor: color,
      glowColor: color,
      ringOpacity: ACTIVE_RING_OPACITY_PEAK,
      haloOpacity: ACTIVE_HALO_OPACITY_PEAK,
      baseScaleMultiplier: BASE_SCALE_DEFAULT,
      haloScaleMultiplier: HALO_SCALE_DEFAULT,
      isActive: true,
      isAlert: false,
      phase: subjectGraphActivePhase,
    };
  }

  const neutral = MOOD_COLOR.neutral;
  return {
    iconName: 'philosopher-stone',
    ringColor: neutral,
    glyphColor: neutral,
    glowColor: neutral,
    ringOpacity: hasMentorActivity ? ACTIVE_RING_OPACITY_PEAK : NEUTRAL_RING_OPACITY,
    haloOpacity: hasMentorActivity ? ACTIVE_HALO_OPACITY_PEAK : NEUTRAL_HALO_OPACITY,
    baseScaleMultiplier: BASE_SCALE_DEFAULT,
    haloScaleMultiplier: HALO_SCALE_DEFAULT,
    isActive,
    isAlert: false,
    phase: null,
  };
}
