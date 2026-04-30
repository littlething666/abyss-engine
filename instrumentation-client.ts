// Single PostHog bootstrap entry point.
//
// Next.js 16 runs `instrumentation-client.ts` on the client before any
// other application code, which makes it the correct — and only —
// place to invoke `bootstrapPosthog()`. Feature code must never import
// `posthog-js` directly nor call `bootstrapPosthog()`; see CLAUDE.md
// (“Analytics SDK isolation”) and `src/infrastructure/posthog/AGENTS”.
//
// `bootstrapPosthog` is fully idempotent and returns early when the
// resolved config is null (no token, kill switch active, or SSR), so
// importing this module in those environments is a safe no-op.

import { bootstrapPosthog } from '@/infrastructure/posthog';

bootstrapPosthog();
