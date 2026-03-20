import type { TelemetryEvent } from '../types';

const STORAGE_KEY = 'abyss-telemetry-v1-raw';

function readPersistedEvents() {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
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
  } catch {
    return [];
  }
}

export function syncTelemetryToLocalStorage(event: TelemetryEvent) {
  if (typeof window === 'undefined') {
    return;
  }

  const events = [...readPersistedEvents(), event];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function clearTelemetryStorage() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}
