const DEVICE_STORAGE_KEY = 'abyss.deviceId';
const SSR_DEVICE_ID = 'ssr-anonymous-device';

function randomDeviceId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }
  throw new Error('Device identity requires crypto.randomUUID() in browser/runtime environment');
}

/**
 * Reads or mints the per-device identifier shared by frontend infrastructure
 * adapters. The identifier is not an auth credential; it only scopes the
 * current anonymous device until the auth migration lands.
 */
export function readOrMintDeviceId(): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return SSR_DEVICE_ID;
  }

  const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing.trim();
  }

  const id = randomDeviceId();
  window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
  return id;
}
