/**
 * Device-ID middleware — extracts `X-Abyss-Device` header, upserts the
 * device row, and stores `deviceId` on the Hono context for downstream
 * handlers.
 */

import type { Context, Next } from 'hono';
import { makeRepos } from '../repositories';

export async function deviceIdMiddleware(c: Context, next: Next) {
  const deviceId = c.req.header('x-abyss-device');

  if (!deviceId || deviceId.trim().length === 0) {
    return c.json(
      { error: 'missing_header', message: 'X-Abyss-Device header is required' },
      400,
    );
  }

  // Validate UUID format loosely (the DB enforces the actual constraint).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId.trim())) {
    return c.json(
      { error: 'invalid_device_id', message: 'X-Abyss-Device must be a UUID' },
      400,
    );
  }

  const normalizedId = deviceId.trim().toLowerCase();
  const repos = makeRepos(c.env);

  try {
    await repos.devices.upsert(normalizedId);
  } catch (err) {
    console.error('[deviceIdMiddleware] upsert failed:', err);
    return c.json({ error: 'internal_error', message: 'Failed to upsert device' }, 500);
  }

  // Store on context for downstream handlers.
  c.set('deviceId', normalizedId);
  await next();
}
