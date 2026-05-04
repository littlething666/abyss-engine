/**
 * Follow-up plan §2.2 — progression hydration barrier (Fix #1).
 *
 * The web default for Zustand `persist` is the synchronous `localStorage`
 * adapter, so all four progression stores report `hasHydrated() === true`
 * by the time their module is imported. The barrier exposes two API
 * shapes that must hold either way:
 *
 *   - `progressionStoresHydrated()` — pure read, true once every store
 *     has finished hydrating.
 *   - `whenProgressionHydrated(cb)` — invokes `cb` exactly once when all
 *     four stores are hydrated, returns an unsubscribe.
 *
 * The asynchronous-storage path is also covered by stubbing `hasHydrated`
 * + `onFinishHydration` for one of the stores so we can verify the
 * deferred-resolution branch and the unsubscribe semantics without
 * depending on a real async adapter.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	progressionStoresHydrated,
	whenProgressionHydrated,
} from '../hydration';
import { useBuffStore } from '../stores/buffStore';
import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import { useSM2Store } from '../stores/sm2Store';
import { useStudySessionStore } from '../stores/studySessionStore';

const persistedStores = [
	useCrystalGardenStore,
	useStudySessionStore,
	useSM2Store,
	useBuffStore,
] as const;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('progressionStoresHydrated', () => {
	it('returns true when every persisted store reports hasHydrated', () => {
		// Synchronous localStorage adapter is the default in JSDOM, so all
		// stores hydrate at module-import time.
		for (const store of persistedStores) {
			expect(store.persist.hasHydrated()).toBe(true);
		}
		expect(progressionStoresHydrated()).toBe(true);
	});

	it('returns false when at least one store has not yet hydrated', () => {
		const hydratedSpy = vi
			.spyOn(useBuffStore.persist, 'hasHydrated')
			.mockReturnValue(false);
		expect(progressionStoresHydrated()).toBe(false);
		hydratedSpy.mockRestore();
		expect(progressionStoresHydrated()).toBe(true);
	});
});

describe('whenProgressionHydrated', () => {
	it('invokes the callback synchronously when all stores are already hydrated', () => {
		const cb = vi.fn();
		const unsub = whenProgressionHydrated(cb);
		expect(cb).toHaveBeenCalledTimes(1);
		// Idempotent unsubscribe (already-fired path).
		expect(() => unsub()).not.toThrow();
	});

	it('defers the callback when one store has not yet finished hydrating', () => {
		let pendingResolver: (() => void) | null = null;
		let hydrated = false;

		const hasHydratedSpy = vi
			.spyOn(useBuffStore.persist, 'hasHydrated')
			.mockImplementation(() => hydrated);
		// Don't annotate `listener` — zustand's PersistListener takes a state
		// argument we don't care about in this test. Cast to `() => void`
		// only at the call site, where we synthesize the deferred firing.
		const onFinishSpy = vi
			.spyOn(useBuffStore.persist, 'onFinishHydration')
			.mockImplementation((listener) => {
				pendingResolver = () => {
					hydrated = true;
					(listener as unknown as () => void)();
				};
				return () => {
					pendingResolver = null;
				};
			});

		const cb = vi.fn();
		const unsub = whenProgressionHydrated(cb);
		expect(cb).not.toHaveBeenCalled();
		expect(onFinishSpy).toHaveBeenCalledTimes(1);

		// Resolve hydration: callback fires exactly once.
		expect(pendingResolver).not.toBeNull();
		(pendingResolver as unknown as () => void)();
		expect(cb).toHaveBeenCalledTimes(1);

		// Idempotent unsubscribe after firing.
		expect(() => unsub()).not.toThrow();

		hasHydratedSpy.mockRestore();
		onFinishSpy.mockRestore();
	});

	it('unsubscribe detaches still-pending listeners and prevents the callback from firing', () => {
		let pendingResolver: (() => void) | null = null;
		const disposeSpy = vi.fn();

		const hasHydratedSpy = vi
			.spyOn(useBuffStore.persist, 'hasHydrated')
			.mockReturnValue(false);
		const onFinishSpy = vi
			.spyOn(useBuffStore.persist, 'onFinishHydration')
			.mockImplementation((listener) => {
				pendingResolver = () => (listener as unknown as () => void)();
				return disposeSpy;
			});

		const cb = vi.fn();
		const unsub = whenProgressionHydrated(cb);
		expect(cb).not.toHaveBeenCalled();

		unsub();
		expect(disposeSpy).toHaveBeenCalledTimes(1);

		// Even if the underlying listener fires later, the callback must not run.
		(pendingResolver as unknown as (() => void) | null)?.();
		expect(cb).not.toHaveBeenCalled();

		hasHydratedSpy.mockRestore();
		onFinishSpy.mockRestore();
	});
});
