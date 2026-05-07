/**
 * Repository factory — bundles all Cloudflare D1/R2-backed repos into a single
 * object for injection into route handlers and workflow steps.
 */

import type { Env } from '../env';
import { requireD1 } from './d1';
import { createDevicesRepo, type IDevicesRepo } from './devicesRepo';
import { createRunsRepo, type IRunsRepo } from './runsRepo';
import { createArtifactsRepo, type IArtifactsRepo } from './artifactsRepo';
import { createUsageCountersRepo, type IUsageCountersRepo } from './usageCountersRepo';
import {
  createStageCheckpointsRepo,
  type IStageCheckpointsRepo,
} from './stageCheckpointsRepo';
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
  /** Backend-authoritative generated learning-content read model. */
  learningContent: ILearningContentRepo;
  /** D1 database binding used by routes that need atomic adapter operations. */
  db: D1Database;
}

export function makeRepos(env: Env): Repos {
  const db = requireD1(env);
  return {
    devices: createDevicesRepo(db),
    runs: createRunsRepo(db),
    artifacts: createArtifactsRepo(db, env.GENERATION_ARTIFACTS_BUCKET),
    usage: createUsageCountersRepo(db),
    stageCheckpoints: createStageCheckpointsRepo(db),
    learningContent: createLearningContentRepo(db),
    db,
  };
}
