import type { IDeckRepository } from '../types/repository';
import { readOrMintDeviceId } from './deviceIdentity';
import { createApiClient } from './http/apiClient';
import { BackendDeckRepository } from './repositories/BackendDeckRepository';
import { IndexedDbDeckRepository } from './repositories/IndexedDbDeckRepository';

export interface DeckRepositoryEnvironment {
  NEXT_PUBLIC_DURABLE_RUNS?: string;
  NEXT_PUBLIC_DURABLE_GENERATION_URL?: string;
}

function readPublicEnv(): DeckRepositoryEnvironment {
  if (typeof process === 'undefined') return {};
  return {
    NEXT_PUBLIC_DURABLE_RUNS: process.env.NEXT_PUBLIC_DURABLE_RUNS,
    NEXT_PUBLIC_DURABLE_GENERATION_URL: process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL,
  };
}

function workerBaseUrl(env: DeckRepositoryEnvironment): string {
  return typeof env.NEXT_PUBLIC_DURABLE_GENERATION_URL === 'string'
    ? env.NEXT_PUBLIC_DURABLE_GENERATION_URL.trim()
    : '';
}

export function shouldUseBackendDeckRepository(env: DeckRepositoryEnvironment): boolean {
  return env.NEXT_PUBLIC_DURABLE_RUNS === 'true' && workerBaseUrl(env).length > 0;
}

/**
 * Composition root for deck read authority.
 *
 * Durable backend generation reads from the backend Learning Content Store.
 * Legacy local generation keeps IndexedDB reads until the local runners are
 * deleted later in Phase 4.
 */
export function createDeckRepository(env: DeckRepositoryEnvironment = readPublicEnv()): IDeckRepository {
  if (shouldUseBackendDeckRepository(env)) {
    const deviceId = readOrMintDeviceId();
    return new BackendDeckRepository({
      http: createApiClient({ baseUrl: workerBaseUrl(env), deviceId }),
    });
  }

  return new IndexedDbDeckRepository();
}
