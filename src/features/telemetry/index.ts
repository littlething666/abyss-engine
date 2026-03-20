import { dispatchTelemetryEvent } from './eventBus';
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

export const telemetry = {
  log: <TPayload extends Record<string, unknown>>(
    type: TelemetryEventType,
    payload: TPayload,
    context?: { topicId?: string | null; sessionId?: string | null },
  ) => {
    const parsedPayload = TelemetryEventMap[type].safeParse(payload);
    if (!parsedPayload.success) {
      return;
    }
    const event: TelemetryEvent = {
      id: createEventId(),
      version: telemetryVersionSchema.parse('v1'),
      timestamp: Date.now(),
      sessionId: context?.sessionId ?? null,
      topicId: context?.topicId ?? null,
      type,
      payload: parsedPayload.data as Record<string, unknown>,
    };

    useTelemetryStore.getState().log(event);
    dispatchTelemetryEvent(type, parsedPayload.data as Record<string, unknown>, context);
  },
  exportJson: () => useTelemetryStore.getState().exportLog(),
  clearOldLogs: (days: number) => useTelemetryStore.getState().prune(days),
  clear: () => useTelemetryStore.getState().clear(),
  getStore: useTelemetryStore,
};
