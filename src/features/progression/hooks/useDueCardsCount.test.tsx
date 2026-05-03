/**
 * Phase 5 step 21: useDueCardsCount hook test.
 *
 * Adapter rule: hook reads from exactly one store (sm2Store) and calls
 * exactly one policy (sm2.getDueCards). Test verifies (1) policy-call
 * correctness against a fresh-card list (defaultSM2.nextReview === Date.now()
 * → all cards immediately due), and (2) memoization across unrelated
 * sm2Store mutations is driven by useMemo deps [cards, ref, sm2Data].
 */
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardRefKey } from '@/lib/topicRef';
import type { Card } from '@/types/core';

import { defaultSM2 } from '../policies/sm2';
import { useSM2Store } from '../stores/sm2Store';

import { useDueCardsCount } from './useDueCardsCount';

const REF = { subjectId: 'sub-1', topicId: 'topic-1' };

function createCards(count: number): Card[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `card-${i + 1}`,
		type: 'FLASHCARD' as const,
		difficulty: 1,
		content: { front: `q-${i}`, back: `a-${i}` },
	}));
}

let capturedCount = 0;

function CaptureCount({ cards }: { cards: Card[] }) {
	const count = useDueCardsCount(REF, cards);
	useLayoutEffect(() => {
		capturedCount = count;
	});
	return null;
}

beforeEach(() => {
	useSM2Store.setState({ sm2Data: {} });
	capturedCount = 0;
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('useDueCardsCount', () => {
	it('counts every card as due when no SM-2 entries exist (defaultSM2.nextReview === Date.now())', () => {
		const cards = createCards(3);
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureCount, { cards })));
		expect(capturedCount).toBe(3);
		root.unmount();
	});

	it('excludes cards whose nextReview is in the future', () => {
		const cards = createCards(3);
		const future = Date.now() + 24 * 60 * 60 * 1000;
		useSM2Store.setState({
			sm2Data: {
				[cardRefKey({ ...REF, cardId: 'card-1' })]: { ...defaultSM2, nextReview: future },
			},
		});

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureCount, { cards })));
		expect(capturedCount).toBe(2);
		root.unmount();
	});

	it('returns 0 for an empty card list', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureCount, { cards: [] })));
		expect(capturedCount).toBe(0);
		root.unmount();
	});

	it('rerenders with new value when sm2Data updates for the topic', () => {
		const cards = createCards(2);
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureCount, { cards })));
		expect(capturedCount).toBe(2);

		act(() => {
			useSM2Store.setState({
				sm2Data: {
					[cardRefKey({ ...REF, cardId: 'card-1' })]: {
						...defaultSM2,
						nextReview: Date.now() + 60_000,
					},
					[cardRefKey({ ...REF, cardId: 'card-2' })]: {
						...defaultSM2,
						nextReview: Date.now() + 60_000,
					},
				},
			});
		});
		expect(capturedCount).toBe(0);
		root.unmount();
	});
});
