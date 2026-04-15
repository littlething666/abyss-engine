import { isDebugModeEnabled, resetDebugModeForTests } from '../debugMode';

const LOG_PREFIX = '[abyss:indexedDB:deck]';

/**
 * Reset hook for tests that need deterministic debug state.
 */
export function resetDeckIndexedDbDebugSyncForTests(): void {
  resetDebugModeForTests();
}

export function isDeckIndexedDbDebugEnabled(): boolean {
  return isDebugModeEnabled();
}

export function logDeckIndexedDb(message: string, detail?: Record<string, unknown>): void {
  if (!isDeckIndexedDbDebugEnabled()) {
    return;
  }
  if (detail !== undefined && Object.keys(detail).length > 0) {
    console.debug(LOG_PREFIX, message, detail);
  } else {
    console.debug(LOG_PREFIX, message);
  }
}
