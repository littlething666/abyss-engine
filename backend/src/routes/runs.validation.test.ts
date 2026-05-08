import { describe, expect, it } from 'vitest';
import app from '../index';
import { createFakeD1, q } from '../testStubs/fakeD1';

const DEVICE_ID = '00000000-0000-0000-0000-000000000001';

function deviceRow() {
  return {
    id: DEVICE_ID,
    user_id: null,
    created_at: '2026-01-01T00:00:00Z',
    last_seen_at: '2026-05-05T00:00:00Z',
  };
}

function env(db: D1Database) {
  return {
    GENERATION_DB: db,
    OPENROUTER_API_KEY: 'sk-or-test',
    ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
  };
}

function headers(extra?: Record<string, string>): Headers {
  const h = new Headers();
  h.set('x-abyss-device', DEVICE_ID);
  h.set('content-type', 'application/json');
  for (const [key, value] of Object.entries(extra ?? {})) h.set(key, value);
  return h;
}

describe('run route validation', () => {
  it('rejects invalid run list filters before run lookup', async () => {
    const { db, calls } = createFakeD1([q(deviceRow())]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/runs?status=ready&limit=abc', { headers: headers() }),
      env(db),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'parse:invalid-query',
      message: expect.stringContaining('status'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('insert into devices');
  });

  it('rejects client-built snapshots at POST /v1/runs', async () => {
    const { db, calls } = createFakeD1([q(deviceRow())]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/runs', {
        method: 'POST',
        headers: headers({ 'idempotency-key': 'idem-1' }),
        body: JSON.stringify({ kind: 'crystal-trial', intent: {}, snapshot: {} }),
      }),
      env(db),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'parse:json-mode-violation',
      message: 'snapshot is not accepted; POST /v1/runs requires { kind, intent }',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('insert into devices');
  });

  it('rejects malformed run route ids before run lookup', async () => {
    const { db, calls } = createFakeD1([q(deviceRow())]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/runs/%20', { headers: headers() }),
      env(db),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'parse:invalid-route-input',
      message: expect.stringContaining('runId'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('insert into devices');
  });

  it('rejects malformed retry JSON instead of retrying with empty options', async () => {
    const { db, calls } = createFakeD1([q(deviceRow())]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/runs/run-1/retry', {
        method: 'POST',
        headers: headers(),
        body: '{',
      }),
      env(db),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_json_body',
      message: 'retry body must be valid JSON when provided',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('insert into devices');
  });

  it('rejects malformed SSE resume cursors before run lookup', async () => {
    const { db, calls } = createFakeD1([q(deviceRow())]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/runs/run-1/events?lastSeq=abc', { headers: headers() }),
      env(db),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'parse:invalid-route-input',
      message: expect.stringContaining('lastSeq'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('insert into devices');
  });

  it('rejects malformed artifact route ids before artifact lookup', async () => {
    const { db, calls } = createFakeD1([q(deviceRow())]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/artifacts/%20', { headers: headers() }),
      env(db),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'parse:invalid-route-input',
      message: expect.stringContaining('artifactId'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('insert into devices');
  });

  it('routes valid stats requests to the stats handler instead of the run-id handler', async () => {
    const { db, calls } = createFakeD1([q(deviceRow()), q([])]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/runs/stats?days=7', { headers: headers() }),
      env(db),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      windowDays: 7,
      pipelines: [],
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toContain('select * from runs where created_at >= ?');
  });

  it('rejects malformed stats filters before D1 window scans', async () => {
    const { db, calls } = createFakeD1([q(deviceRow())]);

    const response = await app.fetch(
      new Request('https://fakehost/v1/runs/stats?days=100&pipelineKind=unknown', { headers: headers() }),
      env(db),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'parse:invalid-query',
      message: expect.stringContaining('days'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('insert into devices');
  });
});
