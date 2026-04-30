import { describe, expect, it } from 'vitest';

import { APP_BUS_TO_POSTHOG } from '../contentGenerationPosthogSink';
import { TELEMETRY_TO_POSTHOG } from '../telemetryPosthogSink';

/**
 * Phase 2 invariant: the two PostHog sinks must never produce the same
 * captured event name. The two mapping tables document non-overlapping
 * lifecycle phases (telemetry-tracked vs. request-phase bus events);
 * any overlap means the same logical event would be captured twice and
 * inflate PostHog insights.
 */
describe('PostHog sinks disjointness', () => {
  it('produces no PostHog event captured by both telemetry and app-bus mappings', () => {
    const telemetryEvents = new Set(
      Object.values(TELEMETRY_TO_POSTHOG).map((m) => m.posthogEvent),
    );
    const busEvents = new Set(
      Object.values(APP_BUS_TO_POSTHOG)
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((m) => m.posthogEvent),
    );

    const intersection = [...telemetryEvents].filter((e) =>
      busEvents.has(e),
    );
    expect(
      intersection,
      'A PostHog event family is captured twice — split it into a telemetry-only or bus-only entry to keep the disjointness invariant.',
    ).toEqual([]);
  });

  it('produces no source-name collision between telemetry types and tracked app-bus events', () => {
    const telemetrySources = new Set(Object.keys(TELEMETRY_TO_POSTHOG));
    const busSources = new Set(Object.keys(APP_BUS_TO_POSTHOG));
    const intersection = [...telemetrySources].filter((e) =>
      busSources.has(e),
    );
    expect(intersection).toEqual([]);
  });
});
