import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appEventBus } from '@/infrastructure/eventBus';

import {
  __resetPosthogBootstrapForTests,
  bootstrapPosthog,
  type BootstrapBuildContext,
} from '../bootstrapPosthog';
import {
  POSTHOG_LOGS_FLUSH_INTERVAL_MS,
  POSTHOG_LOGS_MAX_BUFFER_SIZE,
  POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL,
} from '../config';
import type { AnalyticsSink } from '../client';
import type { PosthogResolvedConfig } from '../config';

const TOKEN = 'phc_test_token';
const HOST = 'https://render.globesoul.com';
const UI_HOST = 'https://us.posthog.com';

const TEST_CONFIG: PosthogResolvedConfig = {
  token: TOKEN,
  host: HOST,
  uiHost: UI_HOST,
  defaults: '2026-01-30',
  personProfiles: 'identified_only',
  recordCanvas: true,
  enableSessionRecording: true,
  captureCanvasFps: 2,
  captureCanvasQuality: '0.2',
  autocapture: {
    dom_event_allowlist: ['click', 'submit', 'change'],
    element_allowlist: ['button', 'a', 'input'],
  },
  logs: {
    captureConsoleLogs: false,
    flushIntervalMs: POSTHOG_LOGS_FLUSH_INTERVAL_MS,
    maxBufferSize: POSTHOG_LOGS_MAX_BUFFER_SIZE,
    maxLogsPerInterval: POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL,
  },
};

const TEST_BUILD: BootstrapBuildContext = {
  appVersion: '4.5.6',
  buildMode: 'production',
};

function makeSink(): AnalyticsSink {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    setPersonProperties: vi.fn(),
  };
}

describe('bootstrapPosthog', () => {
  let sink: AnalyticsSink;

  beforeEach(() => {
    __resetPosthogBootstrapForTests();
    window.localStorage.clear();
    sink = makeSink();
  });

  afterEach(() => {
    __resetPosthogBootstrapForTests();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does nothing when config resolves to null (no token, kill switch, or SSR)', () => {
    const createSink = vi.fn(() => sink);
    bootstrapPosthog({
      resolveConfig: () => null,
      resolveDistinctId: () => 'pid',
      createSink,
      buildContext: () => TEST_BUILD,
    });
    expect(createSink).not.toHaveBeenCalled();
    expect(sink.identify).not.toHaveBeenCalled();
    expect(sink.setPersonProperties).not.toHaveBeenCalled();
  });

  it('passes deterministic logs batching config to the analytics sink', () => {
    let capturedConfig: PosthogResolvedConfig | null = null;
    const createSink = vi.fn((cfg: PosthogResolvedConfig, _distinctId: string): AnalyticsSink => {
      capturedConfig = cfg;
      return sink;
    });
    bootstrapPosthog({
      resolveConfig: () => TEST_CONFIG,
      resolveDistinctId: () => 'pid',
      createSink,
      buildContext: () => TEST_BUILD,
    });

    expect(createSink).toHaveBeenCalledTimes(1);
    expect(capturedConfig).not.toBeNull();

    expect(capturedConfig!.logs).toEqual(
      expect.objectContaining({
        captureConsoleLogs: false,
        flushIntervalMs: POSTHOG_LOGS_FLUSH_INTERVAL_MS,
        maxBufferSize: POSTHOG_LOGS_MAX_BUFFER_SIZE,
        maxLogsPerInterval: POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL,
      }),
    );
  });

  it('initializes the sink and identifies the visitor with infrastructure-owned context (init -> identify ordering)', () => {
    const order: string[] = [];
    const createSink = vi.fn((cfg: PosthogResolvedConfig, id: string) => {
      order.push(`createSink:${cfg.token}:${id}`);
      return sink;
    });
    (sink.identify as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('identify');
    });
    bootstrapPosthog({
      resolveConfig: () => TEST_CONFIG,
      resolveDistinctId: () => 'pid-123',
      createSink,
      buildContext: () => TEST_BUILD,
    });
    expect(order[0]).toBe(`createSink:${TOKEN}:pid-123`);
    expect(order[1]).toBe('identify');
    expect(sink.identify).toHaveBeenCalledTimes(1);
    expect(sink.identify).toHaveBeenCalledWith(
      'pid-123',
      expect.objectContaining({
        appVersion: TEST_BUILD.appVersion,
        buildMode: TEST_BUILD.buildMode,
      }),
    );
  });

  it('is idempotent — multiple calls only initialize once', () => {
    const createSink = vi.fn(() => sink);
    bootstrapPosthog({
      resolveConfig: () => TEST_CONFIG,
      resolveDistinctId: () => 'pid',
      createSink,
      buildContext: () => TEST_BUILD,
    });
    bootstrapPosthog({
      resolveConfig: () => TEST_CONFIG,
      resolveDistinctId: () => 'pid',
      createSink,
      buildContext: () => TEST_BUILD,
    });
    expect(createSink).toHaveBeenCalledTimes(1);
    expect(sink.identify).toHaveBeenCalledTimes(1);
  });

  it('bridges player-profile:updated to setPersonProperties with infrastructure-owned context', () => {
    bootstrapPosthog({
      resolveConfig: () => TEST_CONFIG,
      resolveDistinctId: () => 'pid',
      createSink: () => sink,
      buildContext: () => TEST_BUILD,
      now: () => 1700000000000,
    });
    appEventBus.emit('player-profile:updated', { playerName: 'Sergio' });
    expect(sink.setPersonProperties).toHaveBeenCalledTimes(1);
    const call = (sink.setPersonProperties as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    const set = call[0] as Record<string, unknown>;
    const setOnce = call[1] as Record<string, unknown> | undefined;
    expect(set).toMatchObject({
      playerName: 'Sergio',
      appVersion: TEST_BUILD.appVersion,
      buildMode: TEST_BUILD.buildMode,
    });
    expect(typeof set.lastSeenAt).toBe('string');
    expect(setOnce).toBeDefined();
    expect(typeof setOnce!.firstSeenAt).toBe('string');
  });

  it('forwards null when the player name is cleared', () => {
    bootstrapPosthog({
      resolveConfig: () => TEST_CONFIG,
      resolveDistinctId: () => 'pid',
      createSink: () => sink,
      buildContext: () => TEST_BUILD,
    });
    appEventBus.emit('player-profile:updated', { playerName: null });
    expect(sink.setPersonProperties).toHaveBeenCalledTimes(1);
    expect(sink.setPersonProperties).toHaveBeenCalledWith(
      expect.objectContaining({ playerName: null }),
      expect.any(Object),
    );
  });
});
