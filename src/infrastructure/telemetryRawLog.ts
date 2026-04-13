export const TELEMETRY_RAW_STORAGE_KEY = 'abyss-telemetry-v1-raw';

export interface RawTelemetryEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export function readRawTelemetryEventsFromStorage(): RawTelemetryEvent[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(TELEMETRY_RAW_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error(
        '[abyss] abyss-telemetry-v1-raw: expected JSON array, got',
        typeof parsed,
      );
      return [];
    }
    return parsed.filter(
      (e): e is RawTelemetryEvent =>
        e !== null
        && typeof e === 'object'
        && typeof (e as RawTelemetryEvent).type === 'string'
        && typeof (e as RawTelemetryEvent).timestamp === 'number',
    );
  } catch (err) {
    console.error('[abyss] Failed to parse abyss-telemetry-v1-raw from localStorage', err);
    return [];
  }
}
