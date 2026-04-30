import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  POSTHOG_DEFAULTS,
  POSTHOG_DEFAULT_HOST,
  POSTHOG_DEFAULT_UI_HOST,
  POSTHOG_CAPTURE_CANVAS_FPS,
  POSTHOG_CAPTURE_CANVAS_QUALITY,
  POSTHOG_LOGS_FLUSH_INTERVAL_MS,
  POSTHOG_LOGS_MAX_BUFFER_SIZE,
  POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL,
  POSTHOG_LOCAL_DISABLE_KEY,
  POSTHOG_QUERY_KILL_PARAM,
  POSTHOG_QUERY_KILL_VALUE,
  isAnalyticsKillSwitchActive,
  readPosthogConfig,
} from '../config';

const TOKEN = 'phc_test_token_value';
const HOST = 'https://render.globesoul.com';

/** Non-loopback hostname so `readPosthogConfig` is not suppressed by localhost guard under jsdom. */
const REMOTE_TEST_HOSTNAME = 'abyss-posthog-config.test';

const ORIGINAL_LOCATION = window.location;

function setLocation(partial: Partial<Pick<Location, 'hostname' | 'search'>>): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...ORIGINAL_LOCATION,
      hostname: REMOTE_TEST_HOSTNAME,
      ...partial,
    } as Location,
  });
}

function setLocationSearch(search: string): void {
  setLocation({ search });
}

function restoreLocation(): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: ORIGINAL_LOCATION,
  });
}

describe('readPosthogConfig', () => {
  beforeEach(() => {
    setLocation({ hostname: REMOTE_TEST_HOSTNAME, search: '' });
    window.localStorage.clear();
  });

  afterEach(() => {
    restoreLocation();
    window.localStorage.clear();
  });

  it('returns null when no token is present', () => {
    expect(readPosthogConfig({ token: null, host: HOST })).toBeNull();
    expect(readPosthogConfig({ token: '', host: HOST })).toBeNull();
    expect(readPosthogConfig({ token: '   ', host: HOST })).toBeNull();
  });

  it('returns a complete config with the documented safe posture when a token is present', () => {
    const config = readPosthogConfig({ token: TOKEN, host: HOST });
    expect(config).not.toBeNull();
    expect(config!.token).toBe(TOKEN);
    expect(config!.host).toBe(HOST);
    expect(config!.uiHost).toBe(POSTHOG_DEFAULT_UI_HOST);
    expect(config!.defaults).toBe(POSTHOG_DEFAULTS);
    expect(config!.personProfiles).toBe('always');
    expect(config!.recordCanvas).toBe(true);
    expect(config!.enableSessionRecording).toBe(true);
    expect(config!.captureCanvasFps).toBe(POSTHOG_CAPTURE_CANVAS_FPS);
    expect(config!.captureCanvasQuality).toBe(POSTHOG_CAPTURE_CANVAS_QUALITY);
    expect(config!.logs.captureConsoleLogs).toBe(false);
    expect(config!.logs.flushIntervalMs).toBe(POSTHOG_LOGS_FLUSH_INTERVAL_MS);
    expect(config!.logs.maxBufferSize).toBe(POSTHOG_LOGS_MAX_BUFFER_SIZE);
    expect(config!.logs.maxLogsPerInterval).toBe(POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL);
    expect(config!.autocapture.dom_event_allowlist).toEqual(
      expect.arrayContaining(['click', 'submit', 'change']),
    );
    expect(config!.autocapture.element_allowlist).toEqual(
      expect.arrayContaining(['button', 'a', 'input']),
    );
  });

  it('falls back to the documented default host when host is empty', () => {
    const config = readPosthogConfig({ token: TOKEN, host: null });
    expect(config?.host).toBe(POSTHOG_DEFAULT_HOST);
  });

  it('returns null when the querystring kill switch is active even with a token', () => {
    setLocationSearch(`?${POSTHOG_QUERY_KILL_PARAM}=${POSTHOG_QUERY_KILL_VALUE}`);
    expect(readPosthogConfig({ token: TOKEN, host: HOST })).toBeNull();
  });

  it('returns null when the localStorage kill switch is active', () => {
    window.localStorage.setItem(POSTHOG_LOCAL_DISABLE_KEY, '1');
    expect(readPosthogConfig({ token: TOKEN, host: HOST })).toBeNull();
  });

  it('returns null on localhost even with a token', () => {
    setLocation({ hostname: 'localhost', search: '' });
    expect(readPosthogConfig({ token: TOKEN, host: HOST })).toBeNull();
  });

  it('returns null on *.localhost subdomains', () => {
    setLocation({ hostname: 'app.localhost', search: '' });
    expect(readPosthogConfig({ token: TOKEN, host: HOST })).toBeNull();
  });

  it('returns null on IPv4 loopback hostnames', () => {
    setLocation({ hostname: '127.0.0.1', search: '' });
    expect(readPosthogConfig({ token: TOKEN, host: HOST })).toBeNull();
    setLocation({ hostname: '127.42.1.9', search: '' });
    expect(readPosthogConfig({ token: TOKEN, host: HOST })).toBeNull();
  });
});

describe('isAnalyticsKillSwitchActive', () => {
  beforeEach(() => {
    setLocationSearch('');
    window.localStorage.clear();
  });

  afterEach(() => {
    restoreLocation();
    window.localStorage.clear();
  });

  it('is false when no source flips the switch', () => {
    expect(isAnalyticsKillSwitchActive()).toBe(false);
  });

  it('is true when the querystring carries the documented kill value', () => {
    setLocationSearch(`?${POSTHOG_QUERY_KILL_PARAM}=${POSTHOG_QUERY_KILL_VALUE}`);
    expect(isAnalyticsKillSwitchActive()).toBe(true);
  });

  it('is true when localStorage carries the documented kill value', () => {
    window.localStorage.setItem(POSTHOG_LOCAL_DISABLE_KEY, '1');
    expect(isAnalyticsKillSwitchActive()).toBe(true);
  });

  it('querystring kill switch is sufficient even when localStorage is empty', () => {
    setLocationSearch(`?${POSTHOG_QUERY_KILL_PARAM}=${POSTHOG_QUERY_KILL_VALUE}`);
    expect(window.localStorage.getItem(POSTHOG_LOCAL_DISABLE_KEY)).toBeNull();
    expect(isAnalyticsKillSwitchActive()).toBe(true);
  });
});
