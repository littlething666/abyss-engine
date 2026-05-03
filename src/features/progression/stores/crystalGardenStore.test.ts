import { beforeEach, describe, expect, it } from 'vitest';

import { INITIAL_UNLOCK_POINTS } from '@/types/progression';

import { useCrystalGardenStore } from './crystalGardenStore';

const STORAGE_KEY = 'abyss-crystal-garden-v0';

describe('crystalGardenStore', () => {
	beforeEach(() => {
		localStorage.clear();
		useCrystalGardenStore.setState({
			activeCrystals: [],
			unlockPoints: INITIAL_UNLOCK_POINTS,
			resonancePoints: 0,
		});
	});

	it('hydrates with the documented initial state shape', () => {
		const state = useCrystalGardenStore.getState();
		expect(state.activeCrystals).toEqual([]);
		expect(state.unlockPoints).toBe(INITIAL_UNLOCK_POINTS);
		expect(state.resonancePoints).toBe(0);
	});

	it('exposes only primitive setters; no business logic on the slice', () => {
		const state = useCrystalGardenStore.getState();
		const actionKeys = Object.keys(state).filter((k) => typeof (state as Record<string, unknown>)[k] === 'function');
		expect(actionKeys.sort()).toEqual(['setActiveCrystals', 'setResonancePoints', 'setUnlockPoints']);
	});

	it('primitive setters update each slice field independently', () => {
		const { setActiveCrystals, setUnlockPoints, setResonancePoints } = useCrystalGardenStore.getState();
		const crystal = {
			subjectId: 's',
			topicId: 't',
			gridPosition: [0, 0] as [number, number],
			xp: 42,
			spawnedAt: 1,
		};

		setActiveCrystals([crystal]);
		expect(useCrystalGardenStore.getState().activeCrystals).toEqual([crystal]);

		setUnlockPoints(7);
		expect(useCrystalGardenStore.getState().unlockPoints).toBe(7);

		setResonancePoints(2);
		expect(useCrystalGardenStore.getState().resonancePoints).toBe(2);
	});

	it('persists exactly the documented partialize() shape under abyss-crystal-garden-v0', () => {
		useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 7, resonancePoints: 3 });
		const persisted = window.localStorage.getItem(STORAGE_KEY);
		expect(persisted).not.toBeNull();
		const parsed = persisted ? JSON.parse(persisted) : null;
		expect(parsed.state).toMatchObject({ activeCrystals: [], unlockPoints: 7, resonancePoints: 3 });
		// Action functions must NOT be in the snapshot - only the listed slice fields.
		expect(Object.keys(parsed.state).sort()).toEqual([
			'activeCrystals',
			'resonancePoints',
			'unlockPoints',
		]);
	});
});
