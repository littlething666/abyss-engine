const LOG_PREFIX = '[abyss:indexedDB:deck]';

/** When non-null, matches app `isDebugMode` from `useSearchParams`. */
let syncedFromApp: boolean | null = null;

/**
 * Call from the app shell (e.g. `HomeContent`) so logging tracks `isDebugMode`.
 * Pass `null` on unmount to fall back to reading `?debug=1` from `window.location`.
 */
export function syncDeckIndexedDbDebugFromApp(isDebugMode: boolean | null): void {
  syncedFromApp = isDebugMode;
}

export function resetDeckIndexedDbDebugSyncForTests(): void {
  syncedFromApp = null;
}

function readUrlDebugFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

export function isDeckIndexedDbDebugEnabled(): boolean {
  if (syncedFromApp !== null) {
    return syncedFromApp;
  }
  return readUrlDebugFlag();
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
