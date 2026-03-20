import type { TelemetryEvent } from '../types';

export function consoleTelemetrySink(event: TelemetryEvent) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  // eslint-disable-next-line no-console
  console.debug('[telemetry]', event.type, event.payload);
}
