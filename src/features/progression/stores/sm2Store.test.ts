import { beforeEach, describe, expect, it } from 'vitest';

import { defaultSM2 } from '../policies/sm2';

import { useSM2Store } from './sm2Store';

const STORAGE_KEY = 'abyss-sm2-v0';

describe('sm2Store', () => {
	beforeEach(() => {
		localStorage.clear();
		useSM2Store.setState({ sm2Data: {} });
	});

	it('hydrates with an empty sm2Data record', () => {
		expect(useSM2Store.getState().sm2Data).toEqual({});
	});

	it('setSM2Data replaces the snapshot wholesale (primitive setter, not a merge)', () => {
		const snap = { 's::t::a': { ...defaultSM2, interval: 7 } };
		useSM2Store.getState().setSM2Data(snap);
		expect(useSM2Store.getState().sm2Data).toEqual(snap);

		const replacement = { 's::t::b': { ...defaultSM2, interval: 3 } };
		useSM2Store.getState().setSM2Data(replacement);
		expect(useSM2Store.getState().sm2Data).toEqual(replacement);
		expect(useSM2Store.getState().sm2Data['s::t::a']).toBeUndefined();
	});

	it('getSM2Data is a read-only getter that returns undefined for unknown keys', () => {
		expect(useSM2Store.getState().getSM2Data('missing')).toBeUndefined();

		const entry = { ...defaultSM2, interval: 9 };
		useSM2Store.setState({ sm2Data: { 's::t::a': entry } });
		expect(useSM2Store.getState().getSM2Data('s::t::a')).toEqual(entry);
	});

	it('persists only sm2Data under abyss-sm2-v0', () => {
		useSM2Store.setState({ sm2Data: { 's::t::a': { ...defaultSM2, interval: 5 } } });
		const persisted = window.localStorage.getItem(STORAGE_KEY);
		expect(persisted).not.toBeNull();
		const parsed = persisted ? JSON.parse(persisted) : null;
		expect(Object.keys(parsed.state)).toEqual(['sm2Data']);
	});
});
