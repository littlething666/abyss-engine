/**
 * CORS middleware — production-ready origin allowlist (Phase 4).
 *
 * Origins are resolved from the `ALLOWED_ORIGINS` env var (comma-separated).
 * When the env var is empty or unset, the production default is applied:
 *
 *   https://abyss.globesoul.com
 *   https://www.abyss.globesoul.com
 *   http://localhost:3000   (Next.js dev server)
 *
 * The localhost origin is always included so local development works
 * out of the box without setting ALLOWED_ORIGINS.
 *
 * Threat model: see docs/security/threat-model.md
 */

import type { Context, Next } from 'hono';

/**
 * Production origins included by default when `ALLOWED_ORIGINS` is not set.
 */
const PRODUCTION_DEFAULT_ORIGINS = Object.freeze([
  'https://abyss.globesoul.com',
  'https://www.abyss.globesoul.com',
]);

const DEV_ORIGIN = 'http://localhost:3000';

function resolveAllowedOrigins(raw: string | undefined): Set<string> {
  if (raw && raw.trim().length > 0) {
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
  }

  // Default: production origins + localhost for dev
  return new Set([...PRODUCTION_DEFAULT_ORIGINS, DEV_ORIGIN]);
}

/**
 * Parse an ALLOWED_ORIGINS string into a Set of origins.
 * Exported for testing.
 */
export function parseAllowedOrigins(raw: string): Set<string> {
  return resolveAllowedOrigins(raw);
}

export function corsMiddleware() {
  const allowed = resolveAllowedOrigins(undefined);

  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');
    // Re-resolve on every request in production so ALLOWED_ORIGINS env changes
    // take effect without a Worker re-deploy (provided the env var is set).
    const origins =
      c.env.ALLOWED_ORIGINS && c.env.ALLOWED_ORIGINS.trim().length > 0
        ? resolveAllowedOrigins(c.env.ALLOWED_ORIGINS)
        : allowed;

    // Preflight
    if (c.req.method === 'OPTIONS') {
      if (origin && origins.has(origin)) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Vary', 'Origin');
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        c.header(
          'Access-Control-Allow-Headers',
          'accept, content-type, x-abyss-device, idempotency-key, supersedes-key, last-event-id, cache-control',
        );
        c.header('Access-Control-Max-Age', '86400');
        // Use Hono's responder so `c.header(...)` values are not dropped (a bare
        // `new Response(204)` bypasses the context and breaks browser preflight).
        return c.body(null, 204);
      }
      return c.json({ error: 'origin_not_allowed' }, 403);
    }

    // Actual request
    if (origin && origins.has(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
    }

    await next();
  };
}
