import type { IDeckRepository } from '../types/repository';
import { readOrMintDeviceId } from './deviceIdentity';
import { createApiClient } from './http/apiClient';
import { BackendDeckRepository } from './repositories/BackendDeckRepository';
import { IndexedDbDeckRepository } from './repositories/IndexedDbDeckRepository';

export interface DeckRepositoryEnvironment {
  NEXT_PUBLIC_DURABLE_GENERATION_URL?: string;
}

function readPublicEnv(): DeckRepositoryEnvironment {
  if (typeof process === 'undefined') return {};
  return {
    NEXT_PUBLIC_DURABLE_GENERATION_URL: process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL,
  };
}

function workerBaseUrl(env: DeckRepositoryEnvironment): string {
  return typeof env.NEXT_PUBLIC_DURABLE_GENERATION_URL === 'string'
    ? env.NEXT_PUBLIC_DURABLE_GENERATION_URL.trim()
    : '';
}

export function shouldUseBackendDeckRepository(env: DeckRepositoryEnvironment): boolean {
  return workerBaseUrl(env).length > 0;
}

/**
 * Composition root for deck read authority.
 *
 * Generated learning content is backend-authoritative whenever the durable
 * generation Worker URL is configured. Bundled/manual local content can still
 * use IndexedDB in environments that have not configured a Worker URL.
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
