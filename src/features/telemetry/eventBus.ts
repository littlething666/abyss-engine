import { TelemetryEventMap, TelemetryEventPayloadSchema, type TelemetryEvent, type TelemetryEventType } from './types';

const PREFIX = 'abyss-telemetry-';

function createEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${Date.now()}-${random}`;
}

export function dispatchTelemetryEvent(
  type: TelemetryEventType,
  payload: Record<string, unknown>,
  ctx?: { topicId?: string | null; sessionId?: string | null },
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const parsedPayloadResult = TelemetryEventMap[type].safeParse(payload);
  if (!parsedPayloadResult.success) {
    return;
  }
  const event: TelemetryEvent = {
    id: createEventId(),
    version: 'v1',
    timestamp: Date.now(),
    sessionId: ctx?.sessionId ?? null,
    topicId: ctx?.topicId ?? null,
    type,
    payload: parsedPayloadResult.data as Record<string, unknown>,
  };

  const parsed = TelemetryEventPayloadSchema.safeParse(event);
  if (!parsed.success) {
    return;
  }

  window.dispatchEvent(new CustomEvent(`${PREFIX}${type}`, { detail: parsed.data }));
}
