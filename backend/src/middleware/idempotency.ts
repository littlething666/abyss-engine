/**
 * Idempotency middleware — validates and forwards the Idempotency-Key header.
 *
 * Flow:
 * 1. If no Idempotency-Key header → 400.
 * 2. Store the trimmed key on context.
 * 3. `POST /v1/runs` passes the key to the D1 repository method that owns
 *    idempotency, budget reservation, and run creation.
 */

import type { Context, Next } from 'hono';

export async function idempotencyMiddleware(c: Context, next: Next) {
  const key = c.req.header('idempotency-key');

  if (!key || key.trim().length === 0) {
    return c.json(
      { error: 'missing_header', message: 'Idempotency-Key header is required' },
      400,
    );
  }

  const trimmed = key.trim();

  c.set('idempotencyKey', trimmed);
  await next();
}
