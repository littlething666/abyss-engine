/**
 * Phase 5 step 21: useRemainingRitualCooldownMs hook test.
 *
 * Adapter rule: reads exactly one store (studySessionStore) and applies
 * the ATTUNEMENT_SUBMISSION_COOLDOWN_MS constant from that store's module
 * (the gate is part of the session lifecycle, not of any policy).
 */
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	ATTUNEMENT_SUBMISSION_COOLDOWN_MS,
	useStudySessionStore,
} from '../stores/studySessionStore';

import { useRemainingRitualCooldownMs } from './useRemainingRitualCooldownMs';

let captured = -1;

function CaptureMs({ atMs }: { atMs: number }) {
	const ms = useRemainingRitualCooldownMs(atMs);
	useLayoutEffect(() => {
		captured = ms;
	});
	return null;
}

beforeEach(() => {
	useStudySessionStore.setState({
		currentSession: null,
		pendingRitual: null,
		lastRitualSubmittedAt: null,
		currentSubjectId: null,
	});
	captured = -1;
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('useRemainingRitualCooldownMs', () => {
	it('returns 0 when no ritual has ever been submitted', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureMs, { atMs: Date.now() })));
		expect(captured).toBe(0);
		root.unmount();
	});

	it('returns the full cooldown immediately after submission (atMs == lastRitualSubmittedAt)', () => {
		const now = Date.now();
		useStudySessionStore.setState({ lastRitualSubmittedAt: now });
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureMs, { atMs: now })));
		expect(captured).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);
		root.unmount();
	});

	it('decreases linearly with atMs and clamps to 0 once the cooldown elapses', () => {
		const now = Date.now();
		useStudySessionStore.setState({ lastRitualSubmittedAt: now });

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureMs, { atMs: now + 60 * 60 * 1000 })));
		expect(captured).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS - 60 * 60 * 1000);
		root.unmount();

		const el2 = document.createElement('div');
		document.body.appendChild(el2);
		const root2 = createRoot(el2);
		flushSync(() => root2.render(createElement(CaptureMs, { atMs: now + ATTUNEMENT_SUBMISSION_COOLDOWN_MS + 1000 })));
		expect(captured).toBe(0);
		root2.unmount();
	});

	it('re-renders when lastRitualSubmittedAt changes', () => {
		const now = Date.now();
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureMs, { atMs: now })));
		expect(captured).toBe(0);

		act(() => {
			useStudySessionStore.setState({ lastRitualSubmittedAt: now });
		});
		expect(captured).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);
		root.unmount();
	});
});
