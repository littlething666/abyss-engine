'use client';

import type { TelemetryEvent, TelemetryEventType } from '@/features/telemetry/types';

import type { AnalyticsSink } from './client';

/**
 * One mapping describes how a single telemetry event family is
 * forwarded to PostHog. The `posthogEvent` is the literal event name
 * captured on the wire; `properties` builds the per-capture properties
 * from the envelope + validated payload.
 *
 * Names are intentionally preserved (colons + kebab) per the PostHog
 * integration plan ("Colon event names preserved"), so the same
 * vocabulary the app uses internally is what shows up in PostHog
 * insights — no transforms, no renames.
 */
export interface PosthogMapping {
  posthogEvent: string;
  properties: (event: TelemetryEvent) => Record<string, unknown>;
}

/**
 * Default property builder: spreads the validated payload and adds the
 * three standard envelope fields when present. Empty fields are omitted
 * to keep PostHog event property records tidy.
 */
function defaultProperties(event: TelemetryEvent): Record<string, unknown> {
  const props: Record<string, unknown> = { ...event.payload };
  if (event.subjectId) props.subjectId = event.subjectId;
  if (event.topicId) props.topicId = event.topicId;
  if (event.sessionId) props.sessionId = event.sessionId;
  return props;
}

/**
 * Telemetry → PostHog mapping table. The
 * `satisfies Record<TelemetryEventType, PosthogMapping>` constraint is
 * the exhaustiveness guarantee — if a new `TelemetryEventType` is added
 * without a matching entry here, this file fails to compile, blocking
 * the merge.
 *
 * Disjointness with `APP_BUS_TO_POSTHOG`
 * (`./contentGenerationPosthogSink.ts`) is enforced by
 * `__tests__/sinksDisjointness.test.ts` so an event family is never
 * captured twice by both sinks.
 */
export const TELEMETRY_TO_POSTHOG = {
  'study-session:started': {
    posthogEvent: 'study-session:started',
    properties: defaultProperties,
  },
  'study-card:reviewed': {
    posthogEvent: 'study-card:reviewed',
    properties: defaultProperties,
  },
  'study-panel:undo-applied': {
    posthogEvent: 'study-panel:undo-applied',
    properties: defaultProperties,
  },
  'study-panel:redo-applied': {
    posthogEvent: 'study-panel:redo-applied',
    properties: defaultProperties,
  },
  'study-session:completed': {
    posthogEvent: 'study-session:completed',
    properties: defaultProperties,
  },
  'attunement-ritual:submitted': {
    posthogEvent: 'attunement-ritual:submitted',
    properties: defaultProperties,
  },
  'attunement-cooldown:checked': {
    posthogEvent: 'attunement-cooldown:checked',
    properties: defaultProperties,
  },
  'crystal:unlocked': {
    posthogEvent: 'crystal:unlocked',
    properties: defaultProperties,
  },
  'xp:gained': {
    posthogEvent: 'xp:gained',
    properties: defaultProperties,
  },
  'crystal:leveled': {
    posthogEvent: 'crystal:leveled',
    properties: defaultProperties,
  },
  'study-panel:tab-switched': {
    posthogEvent: 'study-panel:tab-switched',
    properties: defaultProperties,
  },
  'modal:opened': {
    posthogEvent: 'modal:opened',
    properties: defaultProperties,
  },
  'performance:frame-measured': {
    posthogEvent: 'performance:frame-measured',
    properties: defaultProperties,
  },
  'crystal-trial:pregeneration-started': {
    posthogEvent: 'crystal-trial:pregeneration-started',
    properties: defaultProperties,
  },
  'crystal-trial:completed': {
    posthogEvent: 'crystal-trial:completed',
    properties: defaultProperties,
  },
  'subject-graph:generated': {
    posthogEvent: 'subject-graph:generated',
    properties: defaultProperties,
  },
  'subject-graph:generation-failed': {
    posthogEvent: 'subject-graph:generation-failed',
    properties: defaultProperties,
  },
  'subject-graph:validation-failed': {
    posthogEvent: 'subject-graph:validation-failed',
    properties: defaultProperties,
  },
  'mentor-dialog:shown': {
    posthogEvent: 'mentor-dialog:shown',
    properties: defaultProperties,
  },
  'mentor-dialog:skipped': {
    posthogEvent: 'mentor-dialog:skipped',
    properties: defaultProperties,
  },
  'mentor-dialog:completed': {
    posthogEvent: 'mentor-dialog:completed',
    properties: defaultProperties,
  },
  'mentor-choice:selected': {
    posthogEvent: 'mentor-choice:selected',
    properties: defaultProperties,
  },
  'mentor-onboarding:completed': {
    posthogEvent: 'mentor-onboarding:completed',
    properties: defaultProperties,
  },
  'mentor:first-subject-generation-enqueued': {
    posthogEvent: 'mentor:first-subject-generation-enqueued',
    properties: defaultProperties,
  },
  // ── Phase 3: topic-content pipeline lifecycle ─────────────────────
  // Disjoint from `topic-content:generation-requested` in
  // APP_BUS_TO_POSTHOG; the bus event captures user intent (request
  // phase), these telemetry events capture actual pipeline execution.
  'topic-content:generation-started': {
    posthogEvent: 'topic-content:generation-started',
    properties: defaultProperties,
  },
  'topic-content:stage-started': {
    posthogEvent: 'topic-content:stage-started',
    properties: defaultProperties,
  },
  'topic-content:stage-completed': {
    posthogEvent: 'topic-content:stage-completed',
    properties: defaultProperties,
  },
  'topic-content:stage-failed': {
    posthogEvent: 'topic-content:stage-failed',
    properties: defaultProperties,
  },
  'topic-content:generation-completed': {
    posthogEvent: 'topic-content:generation-completed',
    properties: defaultProperties,
  },
} satisfies Record<TelemetryEventType, PosthogMapping>;

/**
 * Public shape of `telemetry.subscribe` (defined in
 * `@/features/telemetry`). Re-stated here as a structural type so this
 * sink module imports zero runtime symbols from the features layer.
 */
export type TelemetrySubscribe = (
  listener: (event: TelemetryEvent) => void,
) => () => void;

/**
 * Wires a telemetry stream into the PostHog analytics sink. Returns an
 * unsubscribe function that detaches the listener.
 *
 * Called once from `bootstrapPosthog()` after PostHog init + identify.
 * Feature code never calls this directly — `posthog-js` is confined to
 * `src/infrastructure/posthog/*`.
 */
export function forwardTelemetryToPosthog(
  sink: AnalyticsSink,
  subscribe: TelemetrySubscribe,
): () => void {
  return subscribe((event) => {
    const mapping = (
      TELEMETRY_TO_POSTHOG as Record<string, PosthogMapping | undefined>
    )[event.type];
    // The `satisfies` constraint above guarantees every TelemetryEventType
    // has a mapping; this guard is purely a runtime-safety net for the
    // case where an upstream tool emits an unrecognized event-type string.
    if (!mapping) return;
    sink.capture(mapping.posthogEvent, mapping.properties(event));
  });
}
