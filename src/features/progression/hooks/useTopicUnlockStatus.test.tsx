/**
 * Phase 5 step 21: useTopicUnlockStatus hook test.
 *
 * Adapter rule: reads from exactly one store (crystalGardenStore via
 * useShallow) and calls exactly one policy (getTopicUnlockStatus).
 */
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SubjectGraph } from '@/types/core';

import { useCrystalGardenStore } from '../stores/crystalGardenStore';

import { useTopicUnlockStatus } from './useTopicUnlockStatus';

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

let captured: ReturnType<typeof useTopicUnlockStatus> | null = null;

function CaptureStatus({ topicId }: { topicId: string }) {
	const status = useTopicUnlockStatus({ subjectId: 's', topicId }, graphs);
	useLayoutEffect(() => {
		captured = status;
	});
	return null;
}

beforeEach(() => {
	useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 0, resonancePoints: 0 });
	captured = null;
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('useTopicUnlockStatus', () => {
	it('returns canUnlock=false when unlock points are zero', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureStatus, { topicId: 'a' })));
		expect(captured).toMatchObject({
			canUnlock: false,
			hasPrerequisites: true,
			hasEnoughPoints: false,
			unlockPoints: 0,
		});
		root.unmount();
	});

	it('flips canUnlock=true when unlockPoints crosses 1 (re-renders via store subscription)', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureStatus, { topicId: 'a' })));
		expect(captured?.canUnlock).toBe(false);

		act(() => {
			useCrystalGardenStore.setState({ unlockPoints: 1 });
		});
		expect(captured?.canUnlock).toBe(true);
		expect(captured?.unlockPoints).toBe(1);
		root.unmount();
	});

	it('honors graph prerequisites (topic-b requires topic-a present in activeCrystals)', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		useCrystalGardenStore.setState({ unlockPoints: 5 });
		flushSync(() => root.render(createElement(CaptureStatus, { topicId: 'b' })));
		expect(captured?.canUnlock).toBe(false);
		expect(captured?.hasPrerequisites).toBe(false);

		act(() => {
			useCrystalGardenStore.setState({
				// xp=100 puts topic-a at crystal level 1, which satisfies the
				// legacy string-prereq default (`minLevel: 1`) applied by
				// normalizeGraphPrerequisites to `prerequisites: ['a']`.
				activeCrystals: [{ subjectId: 's', topicId: 'a', gridPosition: [0, 0], xp: 100, spawnedAt: 1 }],
			});
		});
		expect(captured?.canUnlock).toBe(true);
		expect(captured?.hasPrerequisites).toBe(true);
		root.unmount();
	});

	it('preserves referential identity when an unrelated store field changes (useShallow)', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureStatus, { topicId: 'a' })));
		const first = captured;
		expect(first).not.toBeNull();

		act(() => {
			useCrystalGardenStore.setState({ resonancePoints: 3 });
		});
		expect(captured).toBe(first);
		root.unmount();
	});
});
