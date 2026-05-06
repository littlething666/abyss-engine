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

export interface Repos {
  devices: IDevicesRepo;
  runs: IRunsRepo;
  artifacts: IArtifactsRepo;
  usage: IUsageCountersRepo;
  stageCheckpoints: IStageCheckpointsRepo;
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
  };
}
