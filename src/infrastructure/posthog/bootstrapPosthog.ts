'use client';

import { telemetry } from '@/features/telemetry';

import { appEventBus, type AppEventBus } from '../eventBus';

import { createPosthogSink, type AnalyticsSink } from './client';
import { readPosthogConfig, type PosthogResolvedConfig } from './config';
import { forwardAppBusToPosthog } from './contentGenerationPosthogSink';
import { getOrCreateLocalPlayerId } from './localPlayerIdentity';
import {
  forwardTelemetryToPosthog,
  type TelemetrySubscribe,
} from './telemetryPosthogSink';

const g = globalThis as typeof globalThis & {
  __abyssPosthogBootstrapped?: boolean;
};

export interface BootstrapBuildContext {
  appVersion: string;
  buildMode: 'development' | 'production' | 'test';
}

export interface BootstrapPosthogDeps {
  resolveConfig?: () => PosthogResolvedConfig | null;
  resolveDistinctId?: () => string;
  createSink?: (
    config: PosthogResolvedConfig,
    distinctId: string,
  ) => AnalyticsSink;
  appBus?: AppEventBus;
  /** Phase 2: telemetry fan-out source. Defaults to `telemetry.subscribe`. */
  telemetrySubscribe?: TelemetrySubscribe;
  buildContext?: () => BootstrapBuildContext;
  now?: () => number;
}

function defaultBuildContext(): BootstrapBuildContext {
  const buildMode: BootstrapBuildContext['buildMode'] =
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
      ? 'test'
      : 'development';
  // NEXT_PUBLIC_ABYSS_LOADING_SEED is set in next.config.mjs at build
  // start (`String(Date.now() >>> 0)`), so it's a non-empty per-build
  // identifier we can attribute analytics deployments to without
  // requiring an additional env var.
  const appVersion = process.env.NEXT_PUBLIC_ABYSS_LOADING_SEED ?? '0';
  return { appVersion, buildMode };
}

/**
 * Idempotent PostHog bootstrap. Called once from the project-root
 * `instrumentation-client.ts`; never called from feature code.
 *
 * Flow:
 *  1. Resolve config (may return null — no token, kill switch, or SSR).
 *  2. Resolve the local UUID distinct id.
 *  3. Create the analytics sink (this is where `posthog.init` runs).
 *  4. Mark `globalThis.__abyssPosthogBootstrapped = true` BEFORE
 *     subscribing so a synchronous re-entrant emit cannot recurse.
 *  5. Identify the visitor with infrastructure-owned context.
 *  6. Subscribe to `player-profile:updated` and forward via
 *     `setPersonProperties` ($set: playerName / appVersion /
 *     buildMode / lastSeenAt; $set_once: firstSeenAt).
 *  7. Phase 2 — register both analytics sinks under the same idempotency
 *     guard:
 *       - `forwardTelemetryToPosthog` (telemetry.subscribe → PostHog)
 *       - `forwardAppBusToPosthog`    (request-phase bus events → PostHog)
 *     The two mapping tables are required to be disjoint — see
 *     `__tests__/sinksDisjointness.test.ts`.
 *
 * Architectural note (infra → features). This module imports
 * `@/features/telemetry` to obtain the public `subscribe` fan-out API.
 * That import is a sanctioned exception — `bootstrapPosthog` is the
 * analytics-fan-out composition root, mirroring the role
 * `eventBusHandlers.ts` plays for the rest of the runtime. Feature code
 * still must not import `posthog-js` directly; the SDK stays confined
 * to `client.ts`.
 */
export function bootstrapPosthog(deps: BootstrapPosthogDeps = {}): void {
  if (g.__abyssPosthogBootstrapped) return;

  const resolveConfig = deps.resolveConfig ?? (() => readPosthogConfig());
  const config = resolveConfig();
  if (!config) return;

  const resolveDistinctId = deps.resolveDistinctId ?? getOrCreateLocalPlayerId;
  const distinctId = resolveDistinctId();

  const make = deps.createSink ?? createPosthogSink;
  const sink = make(config, distinctId);

  // Mark bootstrapped before identify or subscribe so any synchronous
  // re-entrant emit triggered by listeners cannot double-init.
  g.__abyssPosthogBootstrapped = true;

  const buildContext = (deps.buildContext ?? defaultBuildContext)();
  const now = deps.now ?? (() => Date.now());

  sink.identify(distinctId, {
    appVersion: buildContext.appVersion,
    buildMode: buildContext.buildMode,
  });

  const bus = deps.appBus ?? appEventBus;
  bus.on('player-profile:updated', ({ playerName }) => {
    const ts = new Date(now()).toISOString();
    sink.setPersonProperties(
      {
        playerName,
        appVersion: buildContext.appVersion,
        buildMode: buildContext.buildMode,
        lastSeenAt: ts,
      },
      { firstSeenAt: ts },
    );
  });

  // Phase 2: register the analytics fan-out sinks. Both subscriptions
  // live for the lifetime of the page (no unsubscribe), since
  // `bootstrapPosthog` runs exactly once per page load.
  const subscribe = deps.telemetrySubscribe ?? telemetry.subscribe;
  forwardTelemetryToPosthog(sink, subscribe);
  forwardAppBusToPosthog(sink, bus);
}

/** Test-only: clear the module-level idempotency latch. */
export function __resetPosthogBootstrapForTests(): void {
  g.__abyssPosthogBootstrapped = false;
}
