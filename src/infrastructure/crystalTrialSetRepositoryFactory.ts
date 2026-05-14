import type { ICrystalTrialSetRepository } from '../types/repository';
import { readOrMintDeviceId } from './deviceIdentity';
import { createApiClient } from './http/apiClient';
import { BackendCrystalTrialSetRepository } from './repositories/BackendCrystalTrialSetRepository';

export interface CrystalTrialSetRepositoryEnvironment {
  NEXT_PUBLIC_DURABLE_GENERATION_URL?: string;
}

function readPublicEnv(): CrystalTrialSetRepositoryEnvironment {
  if (typeof process === 'undefined') return {};
  return {
    NEXT_PUBLIC_DURABLE_GENERATION_URL: process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL,
  };
}

function workerBaseUrl(env: CrystalTrialSetRepositoryEnvironment): string {
  return typeof env.NEXT_PUBLIC_DURABLE_GENERATION_URL === 'string'
    ? env.NEXT_PUBLIC_DURABLE_GENERATION_URL.trim()
    : '';
}

class MissingBackendCrystalTrialSetRepository implements ICrystalTrialSetRepository {
  async getCurrentTrialSet(): Promise<never> {
    throw new Error('Crystal Trial generated question reads require NEXT_PUBLIC_DURABLE_GENERATION_URL');
  }
}

/** Composition root for backend-owned Crystal Trial question-set reads. */
export function createCrystalTrialSetRepository(
  env: CrystalTrialSetRepositoryEnvironment = readPublicEnv(),
): ICrystalTrialSetRepository {
  const baseUrl = workerBaseUrl(env);
  if (!baseUrl) return new MissingBackendCrystalTrialSetRepository();
  const deviceId = readOrMintDeviceId();
  return new BackendCrystalTrialSetRepository({
    http: createApiClient({ baseUrl, deviceId }),
  });
}
