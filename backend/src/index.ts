/**
 * abyss-durable-orchestrator — Hono Worker entry point.
 *
 * Phase 1 PR-C: full HTTP surface (runs, events, artifacts, settings).
 * Middleware chain: cors → deviceId → idempotency (POST /v1/runs only).
 * Workflow creation is stubbed; live SSE tail is stubbed.
 */

import { Hono } from 'hono';
import type { Env } from './env';
import { corsMiddleware } from './middleware/cors';
import { deviceIdMiddleware } from './middleware/deviceId';
import { idempotencyMiddleware } from './middleware/idempotency';
import { runs } from './routes/runs';
import { runEvents } from './routes/runEvents';
import { artifacts } from './routes/artifacts';
import { settings } from './routes/settings';

const app = new Hono<{ Bindings: Env; Variables: { deviceId: string; idempotencyKey?: string } }>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use('*', corsMiddleware());

// ---------------------------------------------------------------------------
// Health check — no auth required.
// ---------------------------------------------------------------------------
app.get('/health', (c) => {
  return c.json({ ok: true, service: 'abyss-durable-orchestrator', version: '0.1.0' });
});

// ---------------------------------------------------------------------------
// v1 API — all routes require X-Abyss-Device.
// ---------------------------------------------------------------------------
const v1 = new Hono<{ Bindings: Env; Variables: { deviceId: string; idempotencyKey?: string } }>();

v1.use('*', deviceIdMiddleware);

// POST /v1/runs requires Idempotency-Key.
// GET /v1/runs, GET /v1/runs/:id, POST /v1/runs/:id/cancel, etc. skip it.
v1.post('/runs', idempotencyMiddleware);

v1.route('/runs', runs);
v1.route('/runs', runEvents);
v1.route('/artifacts', artifacts);
v1.route('/settings', settings);

app.route('/v1', v1);

// ---------------------------------------------------------------------------
// Catch-all 404
// ---------------------------------------------------------------------------
app.all('*', (c) => {
  return c.json({ error: 'not_found' }, 404);
});

export default app;
