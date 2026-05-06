/**
 * CORS middleware — narrow allowlist from `ALLOWED_ORIGINS` env var.
 *
 * Production origin(s) plus `http://localhost:3000` for Next.js dev.
 * Tightened further in Phase 4.
 */

import type { Context, Next } from 'hono';

export function parseAllowedOrigins(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export function corsMiddleware() {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');
    const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS ?? '');

    // Preflight
    if (c.req.method === 'OPTIONS') {
      if (origin && allowed.has(origin)) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Vary', 'Origin');
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        c.header(
          'Access-Control-Allow-Headers',
          'accept, content-type, x-abyss-device, idempotency-key',
        );
        c.header('Access-Control-Max-Age', '86400');
        // Use Hono's responder so `c.header(...)` values are not dropped (a bare
        // `new Response(204)` bypasses the context and breaks browser preflight).
        return c.body(null, 204);
      }
      return c.json({ error: 'origin_not_allowed' }, 403);
    }

    // Actual request
    if (origin && allowed.has(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
    }

    await next();
  };
}
