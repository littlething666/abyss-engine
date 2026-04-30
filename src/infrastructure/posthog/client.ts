'use client';

import posthog from 'posthog-js';

import type { PosthogResolvedConfig } from './config';

/**
 * Narrow analytics interface used by the bootstrap and (Phase 2+)
 * telemetry forwarders. Feature code must depend on this interface,
 * never on `posthog-js` directly.
 */
export interface AnalyticsSink {
  capture(eventName: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, personProperties?: Record<string, unknown>): void;
  setPersonProperties(
    set?: Record<string, unknown>,
    setOnce?: Record<string, unknown>,
  ): void;
}

/**
 * Initializes posthog-js once with the resolved config and returns the
 * narrow `AnalyticsSink`. The `bootstrap.distinctID` option is set so
 * the SDK never emits an anonymous person record before our local
 * UUID is identified.
 *
 * The `posthog-js` import is intentionally confined to this file so
 * feature code never reaches into the SDK directly.
 */
export function createPosthogSink(
  config: PosthogResolvedConfig,
  distinctId: string,
): AnalyticsSink {
  posthog.init(config.token, {
    api_host: config.host,
    ui_host: config.uiHost,
    defaults: config.defaults,
    person_profiles: config.personProfiles,
    autocapture: {
      dom_event_allowlist: [...config.autocapture.dom_event_allowlist],
      element_allowlist: [...config.autocapture.element_allowlist],
    },
    session_recording: {
      captureCanvas: {
        recordCanvas: config.recordCanvas,
        canvasFps: config.captureCanvasFps,
        canvasQuality: config.captureCanvasQuality,
      },
    },
    logs: config.logs,
    capture_pageview: 'history_change',
    persistence: 'localStorage+cookie',
    bootstrap: {
      distinctID: distinctId,
    },
  });

  return {
    capture: (eventName, properties) => {
      posthog.capture(eventName, properties);
    },
    identify: (id, personProperties) => {
      if (personProperties) {
        posthog.identify(id, personProperties);
      } else {
        posthog.identify(id);
      }
    },
    setPersonProperties: (set, setOnce) => {
      posthog.setPersonProperties(set, setOnce);
    },
  };
}
