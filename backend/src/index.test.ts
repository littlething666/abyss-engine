/**
 * Smoke tests for the Hono Worker (Phase 1 PR-C — full HTTP surface).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import app from './index';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeHeaders(overrides?: Record<string, string>): Headers {
  const headers = new Headers();
  headers.set('x-abyss-device', '00000000-0000-0000-0000-000000000001');
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      headers.set(k, v);
    }
  }
  return headers;
}

async function fetchWorker(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(path, 'https://fakehost');
  const request = new Request(url.toString(), init);
  return app.fetch(request, {
    OPENROUTER_API_KEY: 'sk-or-test',
    ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
  });
}

describe('health endpoint', () => {
  it('returns ok for GET /health', async () => {
    const response = await fetchWorker('/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; service: string; version: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('abyss-durable-orchestrator');
  });

  it('returns 404 for unknown routes', async () => {
    const response = await fetchWorker('/nonexistent');
    expect(response.status).toBe(404);
  });
});

describe('deviceId middleware', () => {
  it('rejects requests without X-Abyss-Device', async () => {
    const url = new URL('/v1/runs', 'https://fakehost');
    const request = new Request(url.toString());
    const response = await app.fetch(request, {
      OPENROUTER_API_KEY: 'sk-or-test',
      ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('missing_header');
  });

  it('rejects invalid UUID device ids', async () => {
    const response = await fetchWorker('/v1/runs', {
      method: 'GET',
      headers: makeHeaders({ 'x-abyss-device': 'not-a-uuid' }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('invalid_device_id');
  });
});

describe('idempotency middleware', () => {
  it.skip('rejects POST /v1/runs without Idempotency-Key', async () => {
    const response = await fetchWorker('/v1/runs', {
      method: 'POST',
      headers: makeHeaders(),
      body: JSON.stringify({ kind: 'crystal-trial', snapshot: { pipeline_kind: 'crystal-trial', schema_version: 1, subject_id: 's1', topic_id: 't1' } }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('missing_header');
  });
});
