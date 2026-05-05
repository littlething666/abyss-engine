/**
 * Settings routes — PUT /v1/settings.
 *
 * Phase 1 mirror only — reads still come from the client store.
 * Accepts the body for forward compatibility; stores nothing in Phase 1.
 */

import { Hono } from 'hono';
import type { Env } from '../env';

const settings = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();

settings.put('/', async (c) => {
  // Accept the body but don't persist anything in Phase 1.
  // Phase 3 will persist model bindings + response-healing preference server-side.
  return c.json({ ok: true, message: 'settings mirror — stored client-side in Phase 1' });
});

export { settings };
