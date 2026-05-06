/**
 * Settings routes — PUT /v1/settings, GET /v1/settings.
 *
 * Phase 3: persists model bindings, OpenRouter response-healing preference,
 * and per-device generation flags server-side. Replaces the Phase 1 stub.
 *
 * PUT body: { [key: string]: unknown }
 *   Common keys:
 *   - 'model-bindings': { [surfaceId]: { modelId, config } }
 *   - 'response-healing': { enabled: boolean }
 *   - 'durable-kinds': PipelineKind[]
 *
 * GET returns the full settings object merged from all rows.
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import type { Env } from '../env';

const settings = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();

/** Well-known settings keys the client is expected to send. */
const WELL_KNOWN_KEYS = ['model-bindings', 'response-healing', 'durable-kinds'] as const;

settings.get('/', async (c) => {
  const deviceId = c.get('deviceId');
  const repos = makeRepos(c.env);
  const all = await repos.deviceSettings.getAll(deviceId);
  return c.json({ settings: all });
});

settings.put('/', async (c) => {
  const deviceId = c.get('deviceId');
  const repos = makeRepos(c.env);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json_body' }, 400);
  }

  if (typeof body !== 'object' || Array.isArray(body) || body === null) {
    return c.json({ error: 'body must be a JSON object' }, 400);
  }

  // Only persist well-known keys; the rest are silently ignored for v1.
  const entries: Array<{ key: string; value: Record<string, unknown> }> = [];
  for (const key of WELL_KNOWN_KEYS) {
    const val = body[key];
    if (val !== undefined) {
      entries.push({ key, value: val as Record<string, unknown> });
    }
  }

  if (entries.length === 0) {
    return c.json({ error: 'no well-known settings keys supplied' }, 400);
  }

  await repos.deviceSettings.upsertMany(deviceId, entries);

  return c.json({ ok: true, persisted: entries.length });
});

export { settings };
