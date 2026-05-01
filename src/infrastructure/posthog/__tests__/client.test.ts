import { beforeEach, describe, expect, it, vi } from 'vitest';

import posthog from 'posthog-js';

import { createPosthogSink } from '../client';
import type { PosthogResolvedConfig } from '../config';
import {
  POSTHOG_LOGS_FLUSH_INTERVAL_MS,
  POSTHOG_LOGS_MAX_BUFFER_SIZE,
  POSTHOG_LOGS_MAX_LOGS_PER_INTERVAL,
} from '../config';

vi.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    setPersonProperties: vi.fn(),
  },
}));

const TEST_CONFIG: PosthogResolvedConfig = {
  token: 'phc_test',
  host: 'https://render.globesoul.com',
  uiHost: 'https://us.posthog.com',
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

describe('createPosthogSink', () => {
  beforeEach(() => {
    vi.mocked(posthog.init).mockClear();
  });

  it('passes capture_exceptions to posthog.init', () => {
    createPosthogSink(TEST_CONFIG, 'distinct-1');

    expect(posthog.init).toHaveBeenCalledTimes(1);
    const initArg = vi.mocked(posthog.init).mock.calls[0];
    expect(initArg[0]).toBe(TEST_CONFIG.token);
    expect(initArg[1]).toEqual(
      expect.objectContaining({
        capture_exceptions: {
          capture_unhandled_errors: true,
          capture_unhandled_rejections: true,
          capture_console_errors: true,
        },
      }),
    );
  });
});
