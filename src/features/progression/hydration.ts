/**
 * Progression hydration barrier.
 *
 * The four progression slices (`crystalGardenStore`, `studySessionStore`,
 * `sm2Store`, `buffStore`) each persist independently via Zustand's
 * `persist` middleware. On web with the default synchronous
 * `localStorage` adapter, hydration completes during store creation,
 * but:
 *
 *   - Async storage adapters (test environments, future native shells,
 *     IndexedDB) defer hydration to a microtask.
 *   - `crystalGardenOrchestrator.initialize()` reads/writes
 *     `useBuffStore` immediately at boot. If hydration has not yet
 *     resolved, the read sees an empty `activeBuffs` array and the
 *     subsequent write clobbers the persisted snapshot.
 *
 * This module is the single contract for "all progression state is on
 * disk and loaded into memory". Side-effecting boot work routes through
 * `whenProgressionHydrated(...)` instead of calling `initialize()`
 * directly. The barrier never uses frame delays or polling -- it
 * composes the per-store `persist.hasHydrated()` and
 * `persist.onFinishHydration()` primitives.
 */

import { useBuffStore } from './stores/buffStore';
import { useCrystalGardenStore } from './stores/crystalGardenStore';
import { useSM2Store } from './stores/sm2Store';
import { useStudySessionStore } from './stores/studySessionStore';

const persistedStores = [
	useCrystalGardenStore,
	useStudySessionStore,
	useSM2Store,
	useBuffStore,
] as const;

/**
 * `true` once every persisted progression store reports
 * `persist.hasHydrated()`. Pure read; no subscriptions.
 */
export function progressionStoresHydrated(): boolean {
	return persistedStores.every((store) => store.persist.hasHydrated());
}

/**
 * Invoke `callback` exactly once, after every progression store has
 * finished hydrating from persisted storage. Synchronous fast-path when
 * all four stores are already hydrated at call time. Otherwise wires
 * one `onFinishHydration` listener per still-pending store and
 * disposes them once the last one resolves.
 *
 * Returns an unsubscribe that detaches still-pending listeners; React
 * effects can call it from cleanup. The unsubscribe is a no-op once
 * `callback` has fired.
 */
export function whenProgressionHydrated(callback: () => void): () => void {
	if (progressionStoresHydrated()) {
		callback();
		return () => {};
	}

	const disposers: Array<() => void> = [];
	let fired = false;

	const detachAll = (): void => {
		for (const dispose of disposers) dispose();
		disposers.length = 0;
	};

	const maybeFire = (): void => {
		if (fired) return;
		if (!progressionStoresHydrated()) return;
		fired = true;
		detachAll();
		callback();
	};

	for (const store of persistedStores) {
		if (store.persist.hasHydrated()) continue;
		const unsub = store.persist.onFinishHydration(() => {
			maybeFire();
		});
		disposers.push(unsub);
	}

	// Race guard: any of the stores may have hydrated synchronously
	// between the initial check and listener attachment.
	maybeFire();

	return () => {
		if (fired) return;
		detachAll();
	};
}
