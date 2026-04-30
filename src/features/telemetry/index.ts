import { useTelemetryStore } from './telemetryStore';
export { useStudyMetrics } from './hooks/useStudyMetrics';
export { useStudyTimeline } from './hooks/useStudyTimeline';
export { useStudyTimelineLayers } from './hooks/useStudyTimelineLayers';
export * from './types';
import {
  TelemetryEventMap,
  telemetryVersionSchema,
  type TelemetryEvent,
  type TelemetryEventType,
} from './types';
export * from './timeline';
export { useTelemetryStore } from './telemetryStore';

function createEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const fallback = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${Date.now()}-${fallback}`;
}

/**
 * Telemetry fan-out listener type. Used by the PostHog infrastructure
 * adapter (see `src/infrastructure/posthog/telemetryPosthogSink.ts`).
 * Feature code must not subscribe directly — analytics forwarding is
 * routed through the sanctioned composition root in `bootstrapPosthog`.
 */
export type TelemetryListener = (event: TelemetryEvent) => void;

/**
 * Module-private subscriber set. Notified synchronously on every
 * successful `telemetry.log(...)` call (i.e. after the payload has
 * passed Zod validation). Listener exceptions are isolated via
 * try/catch + console.error so a misbehaving subscriber cannot break
 * unrelated subscribers or the calling feature path.
 *
 * The store remains the canonical persistence sink — `subscribe` is
 * for analytics / forwarding only.
 */
const telemetrySubscribers = new Set<TelemetryListener>();

function notifySubscribers(event: TelemetryEvent): void {
  for (const listener of telemetrySubscribers) {
    try {
      listener(event);
    } catch (err) {
      // Isolate listener failures so they cannot break the calling
      // feature path or other listeners.
      // eslint-disable-next-line no-console
      console.error('[telemetry.subscribe] listener threw:', err);
    }
  }
}

export const telemetry = {
  log: <TPayload extends Record<string, unknown>>(
    type: TelemetryEventType,
    payload: TPayload,
    context?: { topicId?: string | null; sessionId?: string | null; subjectId?: string | null },
  ) => {
    const parsedPayload = TelemetryEventMap[type].safeParse(payload);
    if (!parsedPayload.success) {
      // Phase 2 contract: invalid payloads are a programmer error.
      // Surface them loudly in non-production builds so they cannot rot
      // silently in tests; preserve the legacy silent-drop in
      // production so a payload bug in the field cannot crash the
      // calling feature path.
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `[telemetry.log] invalid payload for ${type}: ${parsedPayload.error.message}`,
        );
      }
      return;
    }
    const event: TelemetryEvent = {
      id: createEventId(),
      version: telemetryVersionSchema.parse('v1'),
      timestamp: Date.now(),
      sessionId: context?.sessionId ?? null,
      topicId: context?.topicId ?? null,
      subjectId: context?.subjectId ?? null,
      type,
      payload: parsedPayload.data as Record<string, unknown>,
    };

    useTelemetryStore.getState().log(event);
    notifySubscribers(event);
  },
  /**
   * Subscribe to every successfully-logged telemetry event. Listeners
   * are invoked synchronously inside `telemetry.log` after Zod
   * validation. Returns an unsubscribe function.
   *
   * Phase 2 public fan-out API; consumed by
   * `bootstrapPosthog` → `forwardTelemetryToPosthog` to deliver
   * telemetry events to PostHog. Feature code must not subscribe.
   */
  subscribe: (listener: TelemetryListener): (() => void) => {
    telemetrySubscribers.add(listener);
    return () => {
      telemetrySubscribers.delete(listener);
    };
  },
  exportJson: () => useTelemetryStore.getState().exportLog(),
  clearOldLogs: (days: number) => useTelemetryStore.getState().prune(days),
  clear: () => useTelemetryStore.getState().clear(),
  getStore: useTelemetryStore,
  /** Test-only: drop all subscribers. Mirrors `__resetPosthogBootstrapForTests`. */
  __resetSubscribersForTests: () => {
    telemetrySubscribers.clear();
  },
};
