import {
  createGenerationClient,
  getGenerationClient,
  registerGenerationClient,
  type GenerationClient,
} from '@/features/contentGeneration/generationClient';
import { runEventCursorStore } from '@/infrastructure/repositories/runEventCursorStore';
import {
  createGenerationRunEventHandlers,
  type GenerationRunEventHandlers,
} from '@/infrastructure/generationRunEventHandlers';
import { appEventBus } from '@/infrastructure/eventBus';
import { pubSubClient } from '@/infrastructure/pubsub';
import { deckRepository } from '@/infrastructure/di';
import { DurableGenerationRunRepository } from '@/infrastructure/repositories/DurableGenerationRunRepository';
import { createApiClient } from '@/infrastructure/http/apiClient';
import { readOrMintDeviceId } from '@/infrastructure/deviceIdentity';
import type { SubmitGenerationRunInput } from '@/types/repository';

function readDurableGenerationWorkerUrl(): string {
  const workerUrl =
    typeof process !== 'undefined' &&
    typeof process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL === 'string'
      ? process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL.trim()
      : '';

  if (!workerUrl) {
    throw new Error(
      'Durable generation requires NEXT_PUBLIC_DURABLE_GENERATION_URL to be configured before app bootstrap.',
    );
  }

  return workerUrl;
}

let wired = false;
let handlersInstance: GenerationRunEventHandlers | null = null;

/**
 * Idempotent browser bootstrap: registers the module-level `GenerationClient`
 * backed by the durable Worker repository. Local in-tab generation routing is
 * intentionally unavailable; missing Worker configuration fails at bootstrap.
 */
export function ensureGenerationClientRegistered(): GenerationClient {
  if (wired) {
    return getGenerationClient();
  }

  const deviceId = readOrMintDeviceId();
  const workerUrl = readDurableGenerationWorkerUrl();
  const http = createApiClient({ baseUrl: workerUrl, deviceId });
  const repo = new DurableGenerationRunRepository({ http, deviceId });

  const client = createGenerationClient({
    deviceId,
    now: () => Date.now(),
    repo,
  });
  registerGenerationClient(client);

  handlersInstance = createGenerationRunEventHandlers({
    client,
    eventBus: appEventBus,
    cursorStore: runEventCursorStore,
    deckRepository,
    contentPublication: pubSubClient,
  });

  wired = true;
  return client;
}

/**
 * Observe a newly submitted durable run through the generationRunEventHandlers.
 * The handlers refresh backend content reads and emit legacy AppEventBus events.
 */
export function observeGenerationRun(runId: string, runInput: SubmitGenerationRunInput): void {
  const h = handlersInstance;
  if (!h) {
    console.error(
      '[wireGenerationClient] observeGenerationRun called before bootstrap; ignoring',
    );
    return;
  }
  void h.observeRun(runId, runInput).catch((err) => {
    console.error(
      `[wireGenerationClient] observeRun failed for ${runId}:`,
      err,
    );
  });
}

/**
 * Get the registered `GenerationRunEventHandlers` instance.
 *
 * Used by `useContentGenerationHydration` to rehydrate durable runs.
 * Returns `null` when the module hasn't been bootstrapped yet.
 */
export function getGenerationRunEventHandlers(): GenerationRunEventHandlers | null {
  return handlersInstance;
}
