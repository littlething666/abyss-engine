import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ActiveCrystal } from '@/types/core';
import { INITIAL_UNLOCK_POINTS } from '@/types/progression';

/**
 * Crystal-garden state slice: the player's unlocked crystals and the two
 * meta-currency balances earned through crystal interactions.
 *
 * Layered-architecture note: this is a pure Zustand data container. It owns
 * `set`/`get`/`setState` and primitive setters only -- no business logic, no
 * imports from policies or orchestrators. Cross-store mutations route through
 * `crystalGardenOrchestrator`.
 */
export interface CrystalGardenState {
	activeCrystals: ActiveCrystal[];
	unlockPoints: number;
	resonancePoints: number;
}

export interface CrystalGardenActions {
	setActiveCrystals: (crystals: ActiveCrystal[]) => void;
	setUnlockPoints: (points: number) => void;
	setResonancePoints: (points: number) => void;
}

export type CrystalGardenStore = CrystalGardenState & CrystalGardenActions;

const CRYSTAL_GARDEN_STORAGE_KEY = 'abyss-crystal-garden-v0';

export const useCrystalGardenStore = create<CrystalGardenStore>()(
	persist(
		(set) => ({
			activeCrystals: [],
			unlockPoints: INITIAL_UNLOCK_POINTS,
			resonancePoints: 0,

			setActiveCrystals: (crystals) => set({ activeCrystals: crystals }),
			setUnlockPoints: (points) => set({ unlockPoints: points }),
			setResonancePoints: (points) => set({ resonancePoints: points }),
		}),
		{
			name: CRYSTAL_GARDEN_STORAGE_KEY,
			version: 0,
			partialize: (state) => ({
				activeCrystals: state.activeCrystals,
				unlockPoints: state.unlockPoints,
				resonancePoints: state.resonancePoints,
			}),
		},
	),
);
