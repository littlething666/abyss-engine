import {
  createGenerationClient,
  getGenerationClient,
  registerGenerationClient,
  type GenerationClient,
} from '@/features/contentGeneration/generationClient';
import {
  createLegacyLocalRunnerDispatchers,
  LocalGenerationRunRepository,
} from '@/infrastructure/repositories/LocalGenerationRunRepository';
import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import type { IGenerationRunRepository } from '@/types/repository';

const DEVICE_STORAGE_KEY = 'abyss.deviceId';

function readOrMintDeviceId(): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'ssr-anonymous-device';
  }
  try {
    const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing && existing.trim().length > 0) {
      return existing.trim();
    }
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const unreachableDurableRepo: IGenerationRunRepository = {
  submitRun: async () => {
    throw new Error('Durable generation runs are not wired in this build (NEXT_PUBLIC_DURABLE_RUNS).');
  },
  getRun: async () => {
    throw new Error('Durable generation runs are not wired in this build (NEXT_PUBLIC_DURABLE_RUNS).');
  },
  streamRunEvents: async function* () {
    throw new Error('Durable generation runs are not wired in this build (NEXT_PUBLIC_DURABLE_RUNS).');
  },
  cancelRun: async () => {
    throw new Error('Durable generation runs are not wired in this build (NEXT_PUBLIC_DURABLE_RUNS).');
  },
  retryRun: async () => {
    throw new Error('Durable generation runs are not wired in this build (NEXT_PUBLIC_DURABLE_RUNS).');
  },
  listRuns: async () => [],
  getArtifact: async () => {
    throw new Error('Durable generation runs are not wired in this build (NEXT_PUBLIC_DURABLE_RUNS).');
  },
};

let wired = false;

/**
 * Idempotent browser bootstrap: registers the module-level `GenerationClient`
 * backed by `LocalGenerationRunRepository` before any `appEventBus` handler
 * invokes `getGenerationClient()`.
 */
export function ensureGenerationClientRegistered(): GenerationClient {
  if (wired) {
    return getGenerationClient();
  }

  const deviceId = readOrMintDeviceId();
  const now = () => Date.now();
  const durableRuns =
    typeof process !== 'undefined' &&
    typeof process.env.NEXT_PUBLIC_DURABLE_RUNS === 'string' &&
    process.env.NEXT_PUBLIC_DURABLE_RUNS === 'true';

  const localRepo = new LocalGenerationRunRepository({
    deviceId,
    now,
    dispatchers: createLegacyLocalRunnerDispatchers({
      chat: getChatCompletionsRepositoryForSurface('topicContent'),
      crystalTrialChat: getChatCompletionsRepositoryForSurface('crystalTrial'),
      deckRepository,
      writer: deckWriter,
    }),
  });

  const client = createGenerationClient({
    deviceId,
    now,
    flags: { durableRuns },
    localRepo,
    durableRepo: unreachableDurableRepo,
  });
  registerGenerationClient(client);
  wired = true;
  return client;
}
