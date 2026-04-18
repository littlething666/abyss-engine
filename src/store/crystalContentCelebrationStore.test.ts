import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCrystalContentCelebrationStore } from './crystalContentCelebrationStore';

describe('useCrystalContentCelebrationStore', () => {
  const storage: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k: string) => (k in storage ? storage[k] : null),
        setItem: (k: string, v: string) => {
          storage[k] = v;
        },
        removeItem: (k: string) => {
          delete storage[k];
        },
        clear: () => {
          for (const k of Object.keys(storage)) {
            delete storage[k];
          }
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
    useCrystalContentCelebrationStore.persist.clearStorage();
    useCrystalContentCelebrationStore.setState({ pendingByTopicKey: {} });
  });

  afterEach(() => {
    useCrystalContentCelebrationStore.persist.clearStorage();
    vi.unstubAllGlobals();
  });

  it('markPendingFromFullTopicUnlock adds a topic key', () => {
    useCrystalContentCelebrationStore.getState().markPendingFromFullTopicUnlock('sub::topic');
    expect(useCrystalContentCelebrationStore.getState().pendingByTopicKey).toEqual({
      'sub::topic': true,
    });
  });

  it('dismissPending removes a topic key', () => {
    useCrystalContentCelebrationStore.setState({
      pendingByTopicKey: { 'sub::a': true, 'sub::b': true },
    });
    useCrystalContentCelebrationStore.getState().dismissPending('sub::a');
    expect(useCrystalContentCelebrationStore.getState().pendingByTopicKey).toEqual({
      'sub::b': true,
    });
  });

  it('dismissPending is a no-op when the key is absent', () => {
    useCrystalContentCelebrationStore.setState({
      pendingByTopicKey: { 'sub::b': true },
    });
    useCrystalContentCelebrationStore.getState().dismissPending('sub::missing');
    expect(useCrystalContentCelebrationStore.getState().pendingByTopicKey).toEqual({
      'sub::b': true,
    });
  });
});
