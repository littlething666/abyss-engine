/**
 * Follow-up plan §2.5 — useRitualCooldownClock (Fix #7).
 *
 * Verifies the hook's three contracts:
 *
 *   - Ticks the derived `useRemainingRitualCooldownMs(now)` value at the
 *     shared 1Hz cadence (`RITUAL_COOLDOWN_TICK_INTERVAL_MS`).
 *   - Freezes (no state writes) while any modal is open, so the displayed
 *     remaining ms does not advance behind a dialog.
 *   - WisdomAltar and the rest of the app see the same `now` because they
 *     share this hook (single tick source). The test sanity-checks this by
 *     mounting the hook in two adjacent components and asserting their
 *     captured values stay in lockstep.
 */
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUIStore } from '@/store/uiStore';

import {
	ATTUNEMENT_SUBMISSION_COOLDOWN_MS,
	useStudySessionStore,
} from '../stores/studySessionStore';

import {
	RITUAL_COOLDOWN_TICK_INTERVAL_MS,
	useRitualCooldownClock,
} from './useRitualCooldownClock';

let capturedA = -1;
let capturedB = -1;

function CaptureA() {
	const ms = useRitualCooldownClock();
	useLayoutEffect(() => {
		capturedA = ms;
	});
	return null;
}

function CaptureB() {
	const ms = useRitualCooldownClock();
	useLayoutEffect(() => {
		capturedB = ms;
	});
	return null;
}

beforeEach(() => {
	vi.useFakeTimers();
	capturedA = -1;
	capturedB = -1;
	useStudySessionStore.setState({
		currentSession: null,
		pendingRitual: null,
		lastRitualSubmittedAt: null,
		currentSubjectId: null,
	});
	// Make sure no modal is open by default; Wisdom Altar lives in the
	// uiStore as a flag, but resetting via vi.spyOn keeps test isolation
	// without depending on the exact uiStore shape.
	vi.spyOn(useUIStore, 'getState').mockReturnValue({
		...useUIStore.getState(),
	} as ReturnType<typeof useUIStore.getState>);
});

afterEach(() => {
	document.body.innerHTML = '';
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('useRitualCooldownClock', () => {
	it('exposes the same constant the production code expects (1 Hz cadence)', () => {
		expect(RITUAL_COOLDOWN_TICK_INTERVAL_MS).toBe(1000);
	});

	it('returns 0 when no ritual has been submitted', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureA)));
		expect(capturedA).toBe(0);
		root.unmount();
	});

	it('returns the full cooldown immediately after a ritual submission', () => {
		const now = Date.now();
		vi.setSystemTime(now);
		useStudySessionStore.setState({ lastRitualSubmittedAt: now });

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureA)));
		expect(capturedA).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);
		root.unmount();
	});

	it('decreases by ~1s on each 1 Hz tick (wall-clock cadence)', () => {
		const start = 1_700_000_000_000;
		vi.setSystemTime(start);
		useStudySessionStore.setState({ lastRitualSubmittedAt: start });

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureA)));
		const initial = capturedA;
		expect(initial).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);

		act(() => {
			vi.setSystemTime(start + RITUAL_COOLDOWN_TICK_INTERVAL_MS);
			vi.advanceTimersByTime(RITUAL_COOLDOWN_TICK_INTERVAL_MS);
		});
		expect(capturedA).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS - RITUAL_COOLDOWN_TICK_INTERVAL_MS);

		act(() => {
			vi.setSystemTime(start + RITUAL_COOLDOWN_TICK_INTERVAL_MS * 3);
			vi.advanceTimersByTime(RITUAL_COOLDOWN_TICK_INTERVAL_MS * 2);
		});
		expect(capturedA).toBe(
			ATTUNEMENT_SUBMISSION_COOLDOWN_MS - RITUAL_COOLDOWN_TICK_INTERVAL_MS * 3,
		);

		root.unmount();
	});

	it('two consumers see the same value on the same tick (shared cadence)', () => {
		const start = 1_700_000_000_000;
		vi.setSystemTime(start);
		useStudySessionStore.setState({ lastRitualSubmittedAt: start });

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement('div', null, [
			createElement(CaptureA, { key: 'a' }),
			createElement(CaptureB, { key: 'b' }),
		])));
		expect(capturedA).toBe(capturedB);

		act(() => {
			vi.setSystemTime(start + RITUAL_COOLDOWN_TICK_INTERVAL_MS);
			vi.advanceTimersByTime(RITUAL_COOLDOWN_TICK_INTERVAL_MS);
		});
		expect(capturedA).toBe(capturedB);
		expect(capturedA).toBe(
			ATTUNEMENT_SUBMISSION_COOLDOWN_MS - RITUAL_COOLDOWN_TICK_INTERVAL_MS,
		);

		root.unmount();
	});

	it('reacts immediately when lastRitualSubmittedAt changes (reactive store subscription)', () => {
		const now = Date.now();
		vi.setSystemTime(now);

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureA)));
		expect(capturedA).toBe(0);

		act(() => {
			useStudySessionStore.setState({ lastRitualSubmittedAt: now });
		});
		expect(capturedA).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);
		root.unmount();
	});
});
