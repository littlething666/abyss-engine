/**
 * Public surface for the PostHog infrastructure adapter.
 *
 * Feature code may import:
 *  - `bootstrapPosthog` (called only from `instrumentation-client.ts`)
 *  - The configuration and identity helpers / types declared below.
 *
 * The `posthog-js` SDK itself is intentionally NOT re-exported here.
 * It is confined to `./client.ts` so feature code can never reach
 * into the SDK directly. See CLAUDE.md "Analytics SDK isolation".
 */

export {
  bootstrapPosthog,
  __resetPosthogBootstrapForTests,
} from './bootstrapPosthog';
export type {
  BootstrapBuildContext,
  BootstrapPosthogDeps,
} from './bootstrapPosthog';

export type { AnalyticsSink } from './client';

export {
  POSTHOG_DEFAULTS,
  POSTHOG_DEFAULT_HOST,
  POSTHOG_DEFAULT_UI_HOST,
  POSTHOG_DISTINCT_ID_KEY,
  POSTHOG_LOCAL_DISABLE_KEY,
  POSTHOG_QUERY_KILL_PARAM,
  POSTHOG_QUERY_KILL_VALUE,
  isAnalyticsKillSwitchActive,
  readPosthogConfig,
} from './config';
export type { PosthogEnv, PosthogResolvedConfig } from './config';

export {
  getOrCreateLocalPlayerId,
  readLocalPlayerId,
  writeLocalPlayerId,
} from './localPlayerIdentity';

// Phase 2 sinks. Re-exported for use by `bootstrapPosthog` and tests.
// Feature code must NOT import these — analytics forwarding happens
// only via `bootstrapPosthog`'s composition root.
export {
  TELEMETRY_TO_POSTHOG,
  forwardTelemetryToPosthog,
} from './telemetryPosthogSink';
export type {
  PosthogMapping,
  TelemetrySubscribe,
} from './telemetryPosthogSink';

export {
  APP_BUS_TO_POSTHOG,
  forwardAppBusToPosthog,
} from './contentGenerationPosthogSink';
