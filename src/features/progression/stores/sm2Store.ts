import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SM2Data } from '../policies/sm2';

/**
 * SM-2 state slice: per-card review schedule keyed by composite `cardRefKey`
 * (subject :: topic :: cardId).
 *
 * Layered-architecture note: pure Zustand data container, primitive setters
 * only. `getSM2Data` is a synchronous getter (NOT a mutation) -- it reads
 * from the current snapshot via `get().sm2Data[key]` and returns `undefined`
 * for unknown keys. Callers that want a default `SM2Data` should resolve
 * that through the SM-2 policy, not here.
 */
export interface SM2State {
	sm2Data: Record<string, SM2Data>;
}

export interface SM2Actions {
	setSM2Data: (data: Record<string, SM2Data>) => void;
	getSM2Data: (key: string) => SM2Data | undefined;
}

export type SM2Store = SM2State & SM2Actions;

type SM2PersistedState = {
	sm2Data: Record<string, SM2Data>;
};

const SM2_STORAGE_KEY = 'abyss-sm2-v0';

export const useSM2Store = create<SM2Store>()(
	persist(
		(set, get) => ({
			sm2Data: {},

			setSM2Data: (data) => set({ sm2Data: data }),
			getSM2Data: (key) => get().sm2Data[key],
		}),
		{
			name: SM2_STORAGE_KEY,
			version: 0,
			partialize: (state) => ({
				sm2Data: state.sm2Data,
			}),
			// Reserved schema-upgrade slot. Identity at v0 so a future v1 bump
			// has a defined entry point instead of having to retro-fit a
			// migration path. Replace with the real shape transform when
			// `version` is bumped past 0.
			migrate: (persistedState) =>
				persistedState as unknown as SM2PersistedState,
		},
	),
);
