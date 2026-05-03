import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Buff } from '@/types/progression';

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
		},
	),
);
