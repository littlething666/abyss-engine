/**
 * Idempotency middleware — 24h TTL via `idempotency_records` table.
 *
 * Phase 3.6 Step 5: Replaces the unique index on runs(idempotency_key) with
 * a dedicated idempotency_records table supporting proper 24h expiry.
 *
 * Flow:
 * 1. If no Idempotency-Key header → 400.
 * 2. Call `idempotency.check(deviceId, key)`:
 *    - hit (within 24h): return existing { runId } with 200, skip handler.
 *    - expired / miss: proceed to handler, which must create the run.
 * 3. After the handler returns, call `idempotency.record(deviceId, key, runId)`.
 *
 * Race handling: two concurrent POSTs with the same expired key both get
 * 'expired'. Both create runs. One wins the `record()` INSERT (unique
 * constraint); the other silently no-ops. The caller's client already
 * dedupes by idempotency key, so two runs with the same key is harmless.
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
  const trimmed = key.trim();
  const repos = makeRepos(c.env);

  const result = await repos.idempotency.check(deviceId, trimmed);

  if (result.status === 'hit') {
    return c.json({ runId: result.runId }, 200);
  }

  // expired or miss — proceed to handler.
  // Store on context: the handler MUST call repos.idempotency.record()
  // AFTER successfully creating the run.
  c.set('idempotencyKey', trimmed);
  await next();
}
