/**
 * Idempotency middleware — checks `(device_id, idempotency_key)` uniqueness.
 *
 * Phase 3.5 Step 7: Enforces the 24-hour dedupe window declared in the main
 * plan. On re-submit within 24h, returns the existing `runId` immediately
 * without creating a new run. After 24h, a stale key can create a new run.
 */

import type { Context, Next } from 'hono';
import { makeRepos } from '../repositories';

/** Dedupe window in milliseconds (24 hours). */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function idempotencyMiddleware(c: Context, next: Next) {
  const key = c.req.header('idempotency-key');

  if (!key || key.trim().length === 0) {
    return c.json(
      { error: 'missing_header', message: 'Idempotency-Key header is required' },
      400,
    );
  }

  const deviceId = c.get('deviceId') as string;
  const repos = makeRepos(c.env);

  const existingRunId = await repos.runs.findByIdempotencyKey(deviceId, key.trim());

  if (existingRunId) {
    // Check TTL: only dedupe if the existing run was created within 24h.
    const run = await repos.runs.load(existingRunId);
    const createdMs = new Date(run.created_at).getTime();
    const ageMs = Date.now() - createdMs;
    if (ageMs < IDEMPOTENCY_TTL_MS) {
      return c.json({ runId: existingRunId }, 200);
    }
    // Outside TTL — allow a fresh run with the same key.
  }

  // Store the key on context so the handler can persist it.
  c.set('idempotencyKey', key.trim());
  await next();
}
