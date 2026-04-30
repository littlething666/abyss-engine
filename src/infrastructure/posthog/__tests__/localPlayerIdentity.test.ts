import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POSTHOG_DISTINCT_ID_KEY } from '../config';
import {
  getOrCreateLocalPlayerId,
  readLocalPlayerId,
  writeLocalPlayerId,
} from '../localPlayerIdentity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('localPlayerIdentity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('generates a UUID and persists it on first call', () => {
    const id = getOrCreateLocalPlayerId();
    expect(id).toMatch(UUID_RE);
    expect(window.localStorage.getItem(POSTHOG_DISTINCT_ID_KEY)).toBe(id);
  });

  it('returns the same id on subsequent calls within the same storage', () => {
    const a = getOrCreateLocalPlayerId();
    const b = getOrCreateLocalPlayerId();
    expect(a).toBe(b);
  });

  it('readLocalPlayerId returns null when nothing is stored', () => {
    expect(readLocalPlayerId()).toBeNull();
  });

  it('readLocalPlayerId returns null when the stored value is malformed', () => {
    window.localStorage.setItem(POSTHOG_DISTINCT_ID_KEY, 'not-a-uuid');
    expect(readLocalPlayerId()).toBeNull();
  });

  it('replaces a malformed stored value with a fresh UUID on getOrCreate', () => {
    window.localStorage.setItem(POSTHOG_DISTINCT_ID_KEY, 'not-a-uuid');
    const id = getOrCreateLocalPlayerId();
    expect(id).not.toBe('not-a-uuid');
    expect(id).toMatch(UUID_RE);
    expect(window.localStorage.getItem(POSTHOG_DISTINCT_ID_KEY)).toBe(id);
  });

  it('writeLocalPlayerId persists the supplied id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    writeLocalPlayerId(id);
    expect(window.localStorage.getItem(POSTHOG_DISTINCT_ID_KEY)).toBe(id);
    expect(readLocalPlayerId()).toBe(id);
  });
});
