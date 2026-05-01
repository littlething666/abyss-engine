'use client';

import type {
  AutocaptureCompatibleElement,
  DomAutocaptureEvents,
} from 'posthog-js';

export const POSTHOG_DEFAULTS = '2026-01-30' as const;
export const POSTHOG_DEFAULT_HOST = 'https://render.globesoul.com';
export const POSTHOG_DEFAULT_UI_HOST = 'https://us.posthog.com';
export const POSTHOG_LOCAL_DISABLE_KEY = 'abyss-analytics-disabled';
export const POSTHOG_QUERY_KILL_PARAM = 'abyss-analytics';
export const POSTHOG_QUERY_KILL_VALUE = 'off';
export const POSTHOG_DISTINCT_ID_KEY = 'abyss-posthog-player-id';
export const POSTHOG_CAPTURE_CANVAS_FPS = 2 as const;
export const POSTHOG_CAPTURE_CANVAS_QUALITY = '0.2' as const;
export const POSTHOG_LOGS_FLUSH_INTERVAL_MS = 10000 as const;
export const POSTHOG_LOGS_MAX_BUFFER_SIZE = 100 as const;
export const POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL = 1000 as const;

type PosthogPersonProfileMode = 'identified_only' | 'always';

export interface PosthogLogsConfig {
  captureConsoleLogs?: boolean;
  serviceName?: string;
  environment?: string;
  serviceVersion?: string;
  resourceAttributes?: Readonly<Record<string, string>>;
  flushIntervalMs?: number;
  maxBufferSize?: number;
  maxLogsPerInterval?: number;
}

export interface PosthogResolvedConfig {
  token: string;
  host: string;
  uiHost: string;
  defaults: typeof POSTHOG_DEFAULTS;
  recordCanvas: true;
  enableSessionRecording: true;
  captureCanvasFps: typeof POSTHOG_CAPTURE_CANVAS_FPS;
  captureCanvasQuality: typeof POSTHOG_CAPTURE_CANVAS_QUALITY;
  personProfiles: PosthogPersonProfileMode;
  autocapture: {
    dom_event_allowlist: readonly DomAutocaptureEvents[];
    element_allowlist: readonly AutocaptureCompatibleElement[];
  };
  logs: PosthogLogsConfig;
}

export interface PosthogEnv {
  token?: string | null;
  host?: string | null;
  uiHost?: string | null;
}

/**
 * Reads the build-time environment. NEXT_PUBLIC_* vars are inlined by
 * Next.js at build time, so this is safe to call from the browser.
 */
function readEnv(): PosthogEnv {
  return {
    token: process.env.NEXT_PUBLIC_POSTHOG_TOKEN ?? null,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? null,
    uiHost: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? null,
  };
}

function isQueryKillSwitchActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(POSTHOG_QUERY_KILL_PARAM) === POSTHOG_QUERY_KILL_VALUE;
  } catch {
    return false;
  }
}

function isLocalKillSwitchActive(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(POSTHOG_LOCAL_DISABLE_KEY) === '1';
  } catch {
    // SecurityError in private mode etc. Treat unreadable storage as
    // "no kill switch active" so the explicit query-string switch is
    // still authoritative.
    return false;
  }
}

/**
 * True when the kill switch is active. Precedence: querystring >
 * localStorage. Either source flipping the switch fully disables PostHog.
 */
export function isAnalyticsKillSwitchActive(): boolean {
  return isQueryKillSwitchActive() || isLocalKillSwitchActive();
}

/**
 * True when the page origin is clearly local-only dev (loopback /
 * localhost). PostHog must not initialize in this case — no outbound
 * analytics traffic from local machines.
 */
function isLocalhostOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const host = window.location.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
    if (host.startsWith('127.')) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves the PostHog runtime config. Returns null when:
 *  - Running outside the browser.
 *  - The kill switch is active (querystring or localStorage).
 *  - The page is served from localhost or IPv4 loopback (no dev traffic).
 *  - No project token is provided in the environment.
 *
 * The returned shape is intentionally complete — callers must not
 * second-guess autocapture allowlists or session-recording posture.
 */
export function readPosthogConfig(
  env: PosthogEnv = readEnv(),
): PosthogResolvedConfig | null {
  if (typeof window === 'undefined') return null;
  if (isAnalyticsKillSwitchActive()) return null;
  if (isLocalhostOrigin()) return null;

  const token = env.token?.trim();
  if (!token) return null;

  const host = env.host?.trim() || POSTHOG_DEFAULT_HOST;
  const uiHost = env.uiHost?.trim() || POSTHOG_DEFAULT_UI_HOST;

  return {
    token,
    host,
    uiHost,
    defaults: POSTHOG_DEFAULTS,
    personProfiles: 'always',
    recordCanvas: true,
    enableSessionRecording: true,
    captureCanvasFps: POSTHOG_CAPTURE_CANVAS_FPS,
    captureCanvasQuality: POSTHOG_CAPTURE_CANVAS_QUALITY,
    autocapture: {
      // Day-one allowlist; broaden only after architectural review.
      dom_event_allowlist: ['click', 'submit', 'change'],
      element_allowlist: ['button', 'a', 'input'],
    },
    logs: {
      // Safe default: batching enabled with explicit limits while
      // keeping console capture opt-in to avoid accidental token leakage.
      captureConsoleLogs: false,
      flushIntervalMs: POSTHOG_LOGS_FLUSH_INTERVAL_MS,
      maxBufferSize: POSTHOG_LOGS_MAX_BUFFER_SIZE,
      maxLogsPerInterval: POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL,
    },
  };
}
