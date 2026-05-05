/**
 * Idempotency middleware — checks `(device_id, idempotency_key)` uniqueness.
 *
 * On re-submit within 24h, returns the existing `runId` immediately without
 * creating a new run or Workflow.  The 24h window is enforced by a periodic
 * cleanup job (Phase 3) or a TTL index; for Phase 1, stale idempotency keys
 * are harmless (the `idempotency_key` column on `runs` is indexed but
 * stale keys just sit there).
 */

import type { Context, Next } from 'hono';
import { makeRepos } from '../repositories';

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
    return c.json({ runId: existingRunId }, 200);
  }

  // Store the key on context so the handler can persist it.
  c.set('idempotencyKey', key.trim());
  await next();
}
