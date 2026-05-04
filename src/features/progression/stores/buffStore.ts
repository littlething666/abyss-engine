import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Buff } from '@/types/progression';

import { BuffEngine } from '../buffs/buffEngine';
import { normalizeActiveBuffs } from '../buffs/buffMerge';

/**
 * Buff state slice: currently active buffs hydrated by `BuffEngine` at
 * runtime.
 *
 * Layered-architecture note: pure Zustand data container, primitive setters
 * only. Granting / consuming / pruning buffs is owned by the buff engine
 * (policy layer) and orchestrators that compose it; this store just stores
 * the resulting array.
 *
 * Buff actions like `grantBuffFromCatalog` / `toggleBuffFromCatalog` are
 * single-store mutations and live as thin module-level helpers colocated
 * with this file rather than in `crystalGardenOrchestrator` -- the
 * orchestrator layer is reserved for cross-store writes.
 */
export interface BuffState {
	activeBuffs: Buff[];
}

export interface BuffActions {
	setActiveBuffs: (buffs: Buff[]) => void;
}

export type BuffStore = BuffState & BuffActions;

type BuffPersistedState = {
	activeBuffs: Buff[];
};

const BUFF_STORAGE_KEY = 'abyss-buff-v0';

export const useBuffStore = create<BuffStore>()(
	persist(
		(set) => ({
			activeBuffs: [],

			setActiveBuffs: (buffs) => set({ activeBuffs: buffs }),
		}),
		{
			name: BUFF_STORAGE_KEY,
			version: 0,
			partialize: (state) => ({
				activeBuffs: state.activeBuffs,
			}),
			// Reserved schema-upgrade slot. Identity at v0 so a future v1 bump
			// has a defined entry point instead of having to retro-fit a
			// migration path. Replace with the real shape transform when
			// `version` is bumped past 0.
			migrate: (persistedState) =>
				persistedState as unknown as BuffPersistedState,
		},
	),
);

// ---------------------------------------------------------------------------
// Single-store mutation helpers (Phase 2 step 10 -- writer migration round).
//
// `grantBuffFromCatalog` and `toggleBuffFromCatalog` are pure mutations on
// the buff store: they hydrate active buffs, drop expired `session_end`
// entries that have not yet been consumed, dedupe by
// `(buffId | source | condition)`, and merge in the catalog buff (if any).
// They do NOT cross store boundaries, so they live here next to
// `useBuffStore` rather than in `crystalGardenOrchestrator` -- whose seat
// is reserved for cross-store writes.
//
// The dedupe / hydrate / session-end-prune behavior used to live here as a
// private duplicate. As of fix #4 of the progression monolith verification
// plan, those helpers are imported from `../buffs/buffMerge` so this file,
// the ritual flow, and boot-time pruning all share one interface.
// ---------------------------------------------------------------------------

export function grantBuffFromCatalog(
	defId: string,
	source: string,
	magnitudeOverride?: number,
): void {
	const buff = BuffEngine.get().grantBuff(defId, source, magnitudeOverride);
	useBuffStore.setState((state) => ({
		activeBuffs: normalizeActiveBuffs(state.activeBuffs, [buff]),
	}));
}

export function toggleBuffFromCatalog(
	defId: string,
	source: string,
	magnitudeOverride?: number,
): void {
	useBuffStore.setState((state) => {
		const matches = (b: Buff) =>
			b.buffId === defId && (b.source ?? 'legacy') === source;
		if (state.activeBuffs.some(matches)) {
			return {
				activeBuffs: state.activeBuffs.filter((b) => !matches(b)),
			};
		}
		const buff = BuffEngine.get().grantBuff(defId, source, magnitudeOverride);
		return {
			activeBuffs: normalizeActiveBuffs(state.activeBuffs, [buff]),
		};
	});
}
