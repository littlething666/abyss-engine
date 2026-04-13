import { TELEMETRY_RAW_STORAGE_KEY } from '@/infrastructure/telemetryRawLog';
import type { TelemetryEvent } from '../types';

function readPersistedEvents() {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(TELEMETRY_RAW_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is TelemetryEvent => {
      return (
        entry !== null
        && typeof entry === 'object'
        && typeof (entry as TelemetryEvent).id === 'string'
      );
    }) : [];
  } catch (err) {
    console.error('[abyss] Failed to parse telemetry localStorage sink payload', err);
    return [];
  }
}

export function syncTelemetryToLocalStorage(event: TelemetryEvent) {
  if (typeof window === 'undefined') {
    return;
  }

  const events = [...readPersistedEvents(), event];
  window.localStorage.setItem(TELEMETRY_RAW_STORAGE_KEY, JSON.stringify(events));
}

export function clearTelemetryStorage() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(TELEMETRY_RAW_STORAGE_KEY);
}
