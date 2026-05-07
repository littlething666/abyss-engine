/**
 * Repository factory — bundles all Supabase-backed repos into a single
 * object for injection into route handlers and workflow steps.
 */

import type { Env } from '../env';
import { getSupabaseClient } from './supabaseClient';
import { createDevicesRepo, type IDevicesRepo } from './devicesRepo';
import { createRunsRepo, type IRunsRepo } from './runsRepo';
import { createArtifactsRepo, type IArtifactsRepo } from './artifactsRepo';
import { createUsageCountersRepo, type IUsageCountersRepo } from './usageCountersRepo';
import {
  createStageCheckpointsRepo,
  type IStageCheckpointsRepo,
} from './stageCheckpointsRepo';
import {
  createDeviceSettingsRepo,
  type IDeviceSettingsRepo,
} from './deviceSettingsRepo';
import {
  createIdempotencyRecordsRepo,
  type IIdempotencyRecordsRepo,
} from './idempotencyRecordsRepo';
import {
  createLearningContentRepo,
  type ILearningContentRepo,
} from '../learningContent';

export interface Repos {
  devices: IDevicesRepo;
  runs: IRunsRepo;
  artifacts: IArtifactsRepo;
  usage: IUsageCountersRepo;
  stageCheckpoints: IStageCheckpointsRepo;
  deviceSettings: IDeviceSettingsRepo;
  /** Phase 3.6: idempotency records with 24h TTL. */
  idempotency: IIdempotencyRecordsRepo;
  /** Backend-authoritative generated learning-content read model. */
  learningContent: ILearningContentRepo;
  /** Supabase client — consumed by `assertBelowDailyCap` for atomic RPC calls. */
  db: ReturnType<typeof getSupabaseClient>;
}

/**
 * Create all repositories from the Worker environment.
 * Called once per request / workflow step.
 */
export function makeRepos(env: Env): Repos {
  const db = getSupabaseClient(env);
  return {
    devices: createDevicesRepo(db),
    runs: createRunsRepo(db),
    artifacts: createArtifactsRepo(db),
    usage: createUsageCountersRepo(db),
    stageCheckpoints: createStageCheckpointsRepo(db),
    deviceSettings: createDeviceSettingsRepo(db),
    idempotency: createIdempotencyRecordsRepo(db),
    learningContent: createLearningContentRepo(db),
    db,
  };
}
