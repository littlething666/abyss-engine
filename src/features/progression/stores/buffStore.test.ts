import { beforeEach, describe, expect, it } from 'vitest';

import { BuffEngine } from '../buffs/buffEngine';

import {
	grantBuffFromCatalog,
	toggleBuffFromCatalog,
	useBuffStore,
} from './buffStore';

const STORAGE_KEY = 'abyss-buff-v0';

describe('buffStore', () => {
	beforeEach(() => {
		localStorage.clear();
		useBuffStore.setState({ activeBuffs: [] });
	});

	it('hydrates with an empty activeBuffs array', () => {
		expect(useBuffStore.getState().activeBuffs).toEqual([]);
	});

	it('setActiveBuffs replaces the array wholesale', () => {
		const clarity = BuffEngine.get().grantBuff('clarity_focus', 'biological');
		useBuffStore.getState().setActiveBuffs([clarity]);
		expect(useBuffStore.getState().activeBuffs).toHaveLength(1);
		useBuffStore.getState().setActiveBuffs([]);
		expect(useBuffStore.getState().activeBuffs).toEqual([]);
	});

	it('persists only activeBuffs under abyss-buff-v0', () => {
		const clarity = BuffEngine.get().grantBuff('clarity_focus', 'biological');
		useBuffStore.setState({ activeBuffs: [clarity] });
		const persisted = window.localStorage.getItem(STORAGE_KEY);
		expect(persisted).not.toBeNull();
		const parsed = persisted ? JSON.parse(persisted) : null;
		expect(Object.keys(parsed.state)).toEqual(['activeBuffs']);
	});
});

describe('buffStore catalog mutation helpers (parity with deleted progressionStore.test.ts)', () => {
	beforeEach(() => {
		useBuffStore.setState({ activeBuffs: [] });
	});

	it('grantBuffFromCatalog merges the dev XP buff alongside an existing buff (no clobber)', () => {
		const existing = BuffEngine.get().grantBuff('clarity_focus', 'test_source', 1.2);
		useBuffStore.setState({ activeBuffs: [existing] });

		grantBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');

		const buffs = useBuffStore.getState().activeBuffs;
		expect(buffs.some((b) => b.buffId === 'clarity_focus')).toBe(true);
		const devBuff = buffs.find((b) => b.buffId === 'dev_xp_multiplier_5x');
		expect(devBuff).toMatchObject({
			modifierType: 'xp_multiplier',
			magnitude: 5,
			condition: 'manual',
		});
	});

	it('toggleBuffFromCatalog grants then removes the same catalog buff (idempotent toggle)', () => {
		toggleBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');
		expect(
			useBuffStore.getState().activeBuffs.some((b) => b.buffId === 'dev_xp_multiplier_5x'),
		).toBe(true);

		toggleBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');
		expect(
			useBuffStore.getState().activeBuffs.some((b) => b.buffId === 'dev_xp_multiplier_5x'),
		).toBe(false);
	});

	it('toggleBuffFromCatalog matches on (buffId, source) so different sources do not interfere', () => {
		toggleBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');
		toggleBuffFromCatalog('dev_xp_multiplier_5x', 'other_source');
		const buffs = useBuffStore.getState().activeBuffs.filter((b) => b.buffId === 'dev_xp_multiplier_5x');
		expect(buffs).toHaveLength(2);

		toggleBuffFromCatalog('dev_xp_multiplier_5x', 'command_palette');
		expect(
			useBuffStore.getState().activeBuffs.filter((b) => b.buffId === 'dev_xp_multiplier_5x'),
		).toHaveLength(1);
	});
});
