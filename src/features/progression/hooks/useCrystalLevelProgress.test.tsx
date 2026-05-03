/**
 * Phase 5 step 21: useCrystalLevelProgress hook test.
 *
 * Adapter rule: reads exactly one store (crystalGardenStore - subscribing
 * only to the topic's XP via a primitive selector) and calls exactly one
 * policy (getCrystalLevelProgressToNext).
 */
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import { useCrystalLevelProgress } from './useCrystalLevelProgress';

const REF = { subjectId: 's', topicId: 't' };

let captured: ReturnType<typeof useCrystalLevelProgress> | null = null;
let referenceHistory: Array<ReturnType<typeof useCrystalLevelProgress>> = [];

function CaptureProgress() {
	const progress = useCrystalLevelProgress(REF);
	useLayoutEffect(() => {
		captured = progress;
		referenceHistory.push(progress);
	});
	return null;
}

beforeEach(() => {
	useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 0, resonancePoints: 0 });
	captured = null;
	referenceHistory = [];
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('useCrystalLevelProgress', () => {
	it('returns level=0, progress=0 for a missing crystal (xp defaults to 0)', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureProgress)));
		expect(captured).toEqual({ level: 0, progressPercent: 0, isMax: false, totalXp: 0 });
		root.unmount();
	});

	it('matches the policy across the band (xp=150 -> level=1, 50%)', () => {
		useCrystalGardenStore.setState({
			activeCrystals: [{ ...REF, gridPosition: [0, 0], xp: 150, spawnedAt: 1 }],
		});
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureProgress)));
		expect(captured).toEqual({ level: 1, progressPercent: 50, isMax: false, totalXp: 150 });
		root.unmount();
	});

	it('isMax true when xp >= MAX_LEVEL * XP_PER_LEVEL (500)', () => {
		useCrystalGardenStore.setState({
			activeCrystals: [{ ...REF, gridPosition: [0, 0], xp: 600, spawnedAt: 1 }],
		});
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureProgress)));
		expect(captured).toMatchObject({ level: 5, progressPercent: 100, isMax: true });
		root.unmount();
	});

	it('preserves the result reference across unrelated store mutations (useMemo deps gate)', () => {
		useCrystalGardenStore.setState({
			activeCrystals: [{ ...REF, gridPosition: [0, 0], xp: 50, spawnedAt: 1 }],
		});
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureProgress)));
		const first = captured;

		// resonancePoints / unlockPoints don't affect the topic's XP; the
		// primitive selector returns the same number, so useMemo returns the
		// previous object reference.
		act(() => {
			useCrystalGardenStore.setState({ resonancePoints: 7 });
		});
		expect(captured).toBe(first);

		act(() => {
			useCrystalGardenStore.setState({ unlockPoints: 2 });
		});
		expect(captured).toBe(first);
		root.unmount();
	});
});
