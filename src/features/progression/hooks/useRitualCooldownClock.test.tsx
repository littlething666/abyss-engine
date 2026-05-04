/**
 * Follow-up plan §2.5 — useRitualCooldownClock (Fix #7).
 *
 * Verifies the hook's three contracts:
 *
 *   - Ticks the derived `useRemainingRitualCooldownMs(now)` value at the
 *     shared 1Hz cadence (`RITUAL_COOLDOWN_TICK_INTERVAL_MS`).
 *   - Two consumers see the same value on the same tick (single shared
 *     cadence under the hook).
 *   - Reactivity — the derived value updates immediately when
 *     `lastRitualSubmittedAt` changes.
 *
 * Fake-timer note: `vi.advanceTimersByTime(n)` advances both Date.now()
 * and the timer queue atomically. Calling `vi.setSystemTime(t)` BEFORE
 * `advanceTimersByTime` jumps the clock without draining pending
 * intervals and then double-fires them on advancement, so we use
 * `advanceTimersByTime` alone to step time forward inside `act()`.
 */
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
	capturedA = -1;
	capturedB = -1;
	useStudySessionStore.setState({
		currentSession: null,
		pendingRitual: null,
		lastRitualSubmittedAt: null,
		currentSubjectId: null,
	});
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
		vi.useFakeTimers();
		const start = 1_700_000_000_000;
		vi.setSystemTime(start);
		useStudySessionStore.setState({ lastRitualSubmittedAt: start });

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureA)));
		expect(capturedA).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);
		root.unmount();
	});

	it('decreases by ~1s on each 1 Hz tick (wall-clock cadence)', () => {
		vi.useFakeTimers();
		const start = 1_700_000_000_000;
		vi.setSystemTime(start);
		useStudySessionStore.setState({ lastRitualSubmittedAt: start });

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureA)));
		expect(capturedA).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);

		// `advanceTimersByTime` advances Date.now and the timer queue
		// together, so the setInterval(tick, 1000) fires exactly once per
		// 1000ms advanced.
		act(() => {
			vi.advanceTimersByTime(RITUAL_COOLDOWN_TICK_INTERVAL_MS);
		});
		expect(capturedA).toBe(
			ATTUNEMENT_SUBMISSION_COOLDOWN_MS - RITUAL_COOLDOWN_TICK_INTERVAL_MS,
		);

		act(() => {
			vi.advanceTimersByTime(RITUAL_COOLDOWN_TICK_INTERVAL_MS * 2);
		});
		expect(capturedA).toBe(
			ATTUNEMENT_SUBMISSION_COOLDOWN_MS - RITUAL_COOLDOWN_TICK_INTERVAL_MS * 3,
		);

		root.unmount();
	});

	it('two consumers see the same value on the same tick (shared cadence)', () => {
		vi.useFakeTimers();
		const start = 1_700_000_000_000;
		vi.setSystemTime(start);
		useStudySessionStore.setState({ lastRitualSubmittedAt: start });

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() =>
			root.render(
				createElement('div', null, [
					createElement(CaptureA, { key: 'a' }),
					createElement(CaptureB, { key: 'b' }),
				]),
			),
		);
		expect(capturedA).toBe(capturedB);

		act(() => {
			vi.advanceTimersByTime(RITUAL_COOLDOWN_TICK_INTERVAL_MS);
		});
		expect(capturedA).toBe(capturedB);
		expect(capturedA).toBe(
			ATTUNEMENT_SUBMISSION_COOLDOWN_MS - RITUAL_COOLDOWN_TICK_INTERVAL_MS,
		);

		root.unmount();
	});

	it('reacts immediately when lastRitualSubmittedAt changes (reactive store subscription)', () => {
		vi.useFakeTimers();
		const start = 1_700_000_000_000;
		vi.setSystemTime(start);

		const el = document.createElement('div');
		document.body.appendChild(el);
		const root = createRoot(el);
		flushSync(() => root.render(createElement(CaptureA)));
		expect(capturedA).toBe(0);

		act(() => {
			useStudySessionStore.setState({ lastRitualSubmittedAt: start });
		});
		expect(capturedA).toBe(ATTUNEMENT_SUBMISSION_COOLDOWN_MS);
		root.unmount();
	});
});
