/**
 * Local-space constants for the mentor bubble. Centralized so the visible
 * geometry and the transparent hit-target plane stay coupled to a single
 * source of truth.
 *
 * The mentor bubble ring is intentionally a thin outline, not a disk-like
 * backing plate, so the mood / phase glyph remains visually uncluttered.
 */
export const RING_OUTER_LOCAL = 0.30;
export const RING_INNER_LOCAL = RING_OUTER_LOCAL - 0.015;

/**
 * Visible glyph plane radius in local space. Derived from the ring outer
 * radius so the glyph reads as the ring's centerpiece. The hit target is
 * intentionally NOT derived from this value (see below).
 */
export const GLYPH_RADIUS_LOCAL = RING_OUTER_LOCAL * 0.85;

/**
 * Transparent hit-target radius in local space. Decoupled from glyph size
 * by design: derived from the ring outer radius (`RING_OUTER_LOCAL * 1.5`)
 * so future glyph tweaks never regress mobile tap reliability.
 *
 * Diameter at the current ring outer radius = 0.90.
 *
 * @invariant `HIT_TARGET_RADIUS_LOCAL > RING_OUTER_LOCAL`
 */
export const HIT_TARGET_RADIUS_LOCAL = RING_OUTER_LOCAL * 1.5;

/** Vertical offset above the nexus center where the bubble floats. */
export const BUBBLE_VERTICAL_OFFSET_LOCAL = 1.25;

/** Pulse frequency (Hz) for the active (non-alert) ring opacity pulse. */
export const PULSE_FREQUENCY_HZ = 1.4;
export const PULSE_SCALE_AMPLITUDE = 0.07;
export const ALERT_PULSE_SCALE_AMPLITUDE = 0.05;
/** Active (non-alert) ring opacity oscillates between these bounds. */
export const ACTIVE_RING_OPACITY_LOW = 0.8;
export const ACTIVE_RING_OPACITY_HIGH = 0.95;
/** Color cross-fade duration in seconds (200–250 ms target). */
export const COLOR_CROSSFADE_SECONDS = 0.225;
