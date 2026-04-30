'use client';

import type { AppEventBus, AppEventMap, AppEventName } from '../eventBus';

import type { AnalyticsSink } from './client';

/**
 * Per-event mapping for forwarding a single app-bus event family to
 * PostHog. `properties` builds the capture payload from the typed
 * `AppEventMap[K]` so the property builder is narrowed at definition
 * time.
 */
type AppBusMapping<K extends AppEventName> = {
  posthogEvent: string;
  properties: (payload: AppEventMap[K]) => Record<string, unknown>;
};

/**
 * Restricted to **request-phase** events that have no telemetry
 * counterpart — i.e. user-initiated requests for an LLM pipeline that
 * may or may not produce telemetry-tracked started/completed events
 * depending on whether the pipeline reaches them.
 *
 * Tracking these here closes the visibility gap: we know how many
 * generations were *requested* even when downstream telemetry is
 * never emitted (e.g. user navigates away, the pipeline aborts before
 * a started event).
 *
 * Disjointness with `TELEMETRY_TO_POSTHOG` is enforced by
 * `__tests__/sinksDisjointness.test.ts`.
 */
type AppBusMappings = {
  [K in AppEventName]?: AppBusMapping<K>;
};

export const APP_BUS_TO_POSTHOG: AppBusMappings = {
  'topic-content:generation-requested': {
    posthogEvent: 'topic-content:generation-requested',
    properties: (p) => ({
      subjectId: p.subjectId,
      topicId: p.topicId,
      stage: p.stage ?? 'full',
      forceRegenerate: p.forceRegenerate ?? false,
      enableReasoning: p.enableReasoning ?? false,
    }),
  },
  'subject-graph:generation-requested': {
    posthogEvent: 'subject-graph:generation-requested',
    properties: (p) => ({
      subjectId: p.subjectId,
      // Only the user-facing topic name is forwarded; analytics must not
      // learn the internal checklist schema.
      subjectName: p.checklist.topicName,
    }),
  },
  'crystal-trial:pregeneration-requested': {
    posthogEvent: 'crystal-trial:pregeneration-requested',
    properties: (p) => ({
      subjectId: p.subjectId,
      topicId: p.topicId,
      currentLevel: p.currentLevel,
      targetLevel: p.targetLevel,
    }),
  },
};

/**
 * Wires the app event bus into the PostHog analytics sink for the
 * documented request-phase events. Returns an unsubscribe function
 * that detaches every listener registered here.
 */
export function forwardAppBusToPosthog(
  sink: AnalyticsSink,
  bus: AppEventBus,
): () => void {
  const offs: Array<() => void> = [];
  // `Object.keys` on a partial typed record erases the literal key type.
  // Cast back to the full union so the typed `bus.on(key, …)` overload
  // resolves; the per-iteration `if (!mapping) continue` guards against
  // sparse-key access.
  for (const key of Object.keys(APP_BUS_TO_POSTHOG) as AppEventName[]) {
    const mapping = APP_BUS_TO_POSTHOG[key];
    if (!mapping) continue;
    const off = bus.on(key, (payload) => {
      const props = (mapping.properties as (p: unknown) => Record<string, unknown>)(
        payload,
      );
      sink.capture(mapping.posthogEvent, props);
    });
    offs.push(off);
  }
  return () => {
    for (const off of offs) off();
  };
}
