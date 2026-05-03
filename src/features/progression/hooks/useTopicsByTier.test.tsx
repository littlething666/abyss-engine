/**
 * Phase 5 step 21: useTopicsByTier hook test.
 *
 * Adapter rule: reads from exactly one store (crystalGardenStore via
 * useShallow) and calls exactly one policy (getTopicsByTier). The
 * useShallow wrapping is what gives the hook stable identity across
 * unrelated store mutations - that property is what downstream React
 * memoization relies on.
 */
import { act, createElement, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SubjectGraph } from '@/types/core';

import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import type { TieredTopic } from '../policies/topicUnlocking';

import { useTopicsByTier } from './useTopicsByTier';

const graphs: SubjectGraph[] = [
	{
		subjectId: 's',
		title: 'S',
		themeId: 's',
		maxTier: 2,
		nodes: [
			{ topicId: 'a', title: 'A', tier: 1, prerequisites: [], learningObjective: 'o', iconName: 'lightbulb' },
			{ topicId: 'b', title: 'B', tier: 2, prerequisites: ['a'], learningObjective: 'o', iconName: 'lightbulb' },
		],
	},
];
const subjects = [{ id: 's', name: 'S' }];

let captured: ReturnType<typeof useTopicsByTier> | null = null;
let renderCount = 0;
let referenceHistory: Array<ReturnType<typeof useTopicsByTier>> = [];

function CaptureTiers() {
	const tiers = useTopicsByTier(graphs, subjects, undefined, undefined);
	const rcRef = useRef(0);
	rcRef.current += 1;
	useLayoutEffect(() => {
		captured = tiers;
		renderCount = rcRef.current;
		referenceHistory.push(tiers);
	});
	return null;
}

beforeEach(() => {
	useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 0, resonancePoints: 0 });
	captured = null;
	renderCount = 0;
	referenceHistory = [];
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('useTopicsByTier', () => {
	it('groups topics by tier and reflects unlock state from crystal-garden store', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureTiers)));

		expect(captured).not.toBeNull();
		expect(captured!.map((t) => t.tier)).toEqual([1, 2]);
		const topicA = captured!.flatMap((t) => t.topics).find((t: TieredTopic) => t.id === 'a');
		expect(topicA?.isLocked).toBe(true);
		expect(topicA?.isUnlocked).toBe(false);

		act(() => {
			useCrystalGardenStore.setState({
				activeCrystals: [{ subjectId: 's', topicId: 'a', gridPosition: [0, 0], xp: 0, spawnedAt: 1 }],
			});
		});

		const topicAAfter = captured!.flatMap((t) => t.topics).find((t: TieredTopic) => t.id === 'a');
		expect(topicAAfter?.isUnlocked).toBe(true);
		expect(topicAAfter?.isLocked).toBe(false);
		root.unmount();
	});

	it('preserves referential identity across unrelated store mutations (useShallow memoization)', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureTiers)));
		const initialRef = captured;
		expect(initialRef).not.toBeNull();

		// resonancePoints is unrelated to the topicsByTier output. With
		// useShallow + a deterministic policy, the returned array shape is
		// shallow-equal to the previous one and useShallow returns the
		// previous reference.
		act(() => {
			useCrystalGardenStore.setState({ resonancePoints: 5 });
		});
		expect(captured).toBe(initialRef);

		act(() => {
			useCrystalGardenStore.setState({ resonancePoints: 9 });
		});
		expect(captured).toBe(initialRef);
		root.unmount();
	});
});
