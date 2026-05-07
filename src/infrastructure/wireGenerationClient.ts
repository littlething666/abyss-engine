import {
  createGenerationClient,
  getGenerationClient,
  registerGenerationClient,
  type GenerationClient,
} from '@/features/contentGeneration/generationClient';
import {
  createTopicContentApplier,
} from '@/features/contentGeneration/appliers/topicContentApplier';
import {
  createTopicExpansionApplier,
} from '@/features/contentGeneration/appliers/topicExpansionApplier';
import {
  createSubjectGraphApplier,
} from '@/features/subjectGeneration/appliers/subjectGraphApplier';
import {
  createCrystalTrialApplier,
} from '@/features/crystalTrial/appliers/crystalTrialApplier';
import {
  createLegacyLocalRunnerDispatchers,
  LocalGenerationRunRepository,
} from '@/infrastructure/repositories/LocalGenerationRunRepository';
import { appliedArtifactsStore, runEventCursorStore } from '@/infrastructure/repositories/appliedArtifactsStore';
import {
  createGenerationRunEventHandlers,
  type GenerationRunEventHandlers,
} from '@/infrastructure/generationRunEventHandlers';
import { appEventBus } from '@/infrastructure/eventBus';
import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import { DurableGenerationRunRepository } from '@/infrastructure/repositories/DurableGenerationRunRepository';
import { createApiClient } from '@/infrastructure/http/apiClient';
import { readOrMintDeviceId } from '@/infrastructure/deviceIdentity';
import type { IGenerationRunRepository, PipelineKind, RunInput } from '@/types/repository';

/**
 * Stub that returns synthetic failures when the Worker is unreachable.
 * Kept for builds where `NEXT_PUBLIC_DURABLE_RUNS` is off and no
 * `NEXT_PUBLIC_DURABLE_GENERATION_URL` is configured.
 */
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

/**
 * Resolve the durable repo for this build.
 *
 * When `NEXT_PUBLIC_DURABLE_RUNS` is on AND `NEXT_PUBLIC_DURABLE_GENERATION_URL`
 * is set, returns a real `DurableGenerationRunRepository` wired to the Worker.
 * Otherwise returns the unreachable stub.
 */
function resolveDurableRepo(deviceId: string): IGenerationRunRepository {
  const workerUrl =
    typeof process !== 'undefined' &&
    typeof process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL === 'string'
      ? process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL.trim()
      : '';

  if (durableRunsEnabled && workerUrl) {
    const http = createApiClient({ baseUrl: workerUrl, deviceId });
    return new DurableGenerationRunRepository({ http, deviceId });
  }

  return unreachableDurableRepo;
}

let wired = false;
let handlersInstance: GenerationRunEventHandlers | null = null;
let durableRunsEnabled = false;

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
  durableRunsEnabled =
    typeof process !== 'undefined' &&
    typeof process.env.NEXT_PUBLIC_DURABLE_RUNS === 'string' &&
    process.env.NEXT_PUBLIC_DURABLE_RUNS === 'true';

  // Phase 2: per-kind routing via NEXT_PUBLIC_DURABLE_RUNS_KINDS.
  // Default when durableRuns is true: only crystal-trial (Phase 1 default).
  // Operators add more kinds as they migrate: crystal-trial,topic-expansion,subject-graph,topic-content.
  const durableKindsString =
    typeof process !== 'undefined' &&
    typeof process.env.NEXT_PUBLIC_DURABLE_RUNS_KINDS === 'string'
      ? process.env.NEXT_PUBLIC_DURABLE_RUNS_KINDS.trim()
      : '';

  const ALL_KINDS: PipelineKind[] = [
    'crystal-trial',
    'topic-content',
    'topic-expansion',
    'subject-graph',
  ];

  const durableKinds: Set<PipelineKind> = durableKindsString
    ? new Set<PipelineKind>(
        durableKindsString
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is PipelineKind => ALL_KINDS.includes(s as PipelineKind)),
      )
    : new Set<PipelineKind>(['crystal-trial']);

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

  const durableRepo = resolveDurableRepo(deviceId);

  const client = createGenerationClient({
    deviceId,
    now,
    flags: { durableRuns: durableRunsEnabled },
    durableKinds,
    localRepo,
    durableRepo,
  });
  registerGenerationClient(client);

  // Phase 0.5 step 7: wire the generationRunEventHandlers composition root.
  // When NEXT_PUBLIC_DURABLE_RUNS is false (default), handlers exist but are
  // NOT wired into local run observation — today's in-tab runners still own
  // store writes and event emission. When the flag is true (Phase 1+),
  // observeRun activates and handlers become the sole path for artifact
  // application and legacy AppEventBus events.
  handlersInstance = createGenerationRunEventHandlers({
    client,
    appliers: {
      topicContent: createTopicContentApplier({ deckWriter, deckRepository }),
      topicExpansion: createTopicExpansionApplier({ deckWriter }),
      subjectGraph: createSubjectGraphApplier({ deckWriter, deckRepository }),
      crystalTrial: createCrystalTrialApplier(),
    },
    eventBus: appEventBus,
    dedupeStore: appliedArtifactsStore,
    cursorStore: runEventCursorStore,
    deckRepository,
  });

  wired = true;
  return client;
}

/**
 * Observe a newly submitted run through the generationRunEventHandlers.
 *
 * When `NEXT_PUBLIC_DURABLE_RUNS` is OFF: this is a no-op — legacy
 * in-tab runners own store writes and AppEventBus event emission.
 *
 * When `NEXT_PUBLIC_DURABLE_RUNS` is ON: the handlers become the sole
 * path for artifact application and legacy AppEventBus events. The
 * durable repo produces RunEvents from the Worker; this function
 * opens the event stream and applies artifacts + fires events.
 */
export function observeGenerationRun(runId: string, runInput: RunInput): void {
  if (!durableRunsEnabled) return;
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

/**
 * Returns `true` when `NEXT_PUBLIC_DURABLE_RUNS` is set to `'true'`.
 *
 * Used by hooks and components that need to branch between local and
 * durable generation paths without importing `process.env` directly.
 */
export function isDurableRunsEnabled(): boolean {
  return durableRunsEnabled;
}
