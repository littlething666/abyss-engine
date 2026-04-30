'use client';

import { v4 as uuidv4 } from 'uuid';

import { POSTHOG_DISTINCT_ID_KEY } from './config';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_PATTERN.test(value);
}

function generateUuid(): string {
  // Prefer browser-native crypto.randomUUID; fall back to the `uuid`
  // package for environments where it is unavailable (older targets,
  // some test environments).
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return uuidv4();
}

export function readLocalPlayerId(): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(POSTHOG_DISTINCT_ID_KEY);
    return isUuid(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeLocalPlayerId(id: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(POSTHOG_DISTINCT_ID_KEY, id);
  } catch {
    // Storage unavailable (private mode, quota). The distinct id will be
    // regenerated on next call — acceptable for analytics deployment.
  }
}

/**
 * Returns the persisted player distinct id, generating and persisting
 * a fresh UUID on first call. Malformed stored values are replaced.
 */
export function getOrCreateLocalPlayerId(): string {
  const existing = readLocalPlayerId();
  if (existing) return existing;
  const fresh = generateUuid();
  writeLocalPlayerId(fresh);
  return fresh;
}
