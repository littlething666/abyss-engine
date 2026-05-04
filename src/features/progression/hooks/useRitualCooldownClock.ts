import { useEffect, useState } from 'react';

import { selectIsAnyModalOpen, useUIStore } from '@/store/uiStore';

import { useRemainingRitualCooldownMs } from './useRemainingRitualCooldownMs';

/**
 * Cadence of the wall-clock tick that re-derives the ritual cooldown
 * remaining ms. 1Hz is enough to drive a seconds-resolution countdown
 * without churning React state every animation frame.
 */
export const RITUAL_COOLDOWN_TICK_INTERVAL_MS = 1000;

/**
 * Shared cooldown clock for the attunement ritual.
 *
 * Owns one state-backed wall-clock interval at
 * `RITUAL_COOLDOWN_TICK_INTERVAL_MS` and exposes the derived remaining
 * cooldown in milliseconds. Whenever any modal is open the tick is
 * frozen -- consumers continue to see the last sampled `atMs`, so the
 * countdown does not advance behind a modal and does not race the
 * exit animation when a modal closes.
 *
 * Subscribes to:
 *   - `useUIStore.getState()` via `selectIsAnyModalOpen` (read-only,
 *     inside the interval callback so we don't re-render on modal
 *     toggles -- the next tick after a modal closes resumes naturally).
 *   - `useStudySessionStore.lastRitualSubmittedAt` via the composed
 *     `useRemainingRitualCooldownMs` hook (reactive -- when a ritual
 *     lands the remaining ms updates immediately on the same tick).
 *
 * Returns the post-derived remaining ms.
 */
export function useRitualCooldownClock(): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const tick = () => {
			if (selectIsAnyModalOpen(useUIStore.getState())) {
				return;
			}
			setNow(Date.now());
		};

		// Sample synchronously on mount so the first paint isn't off by
		// up to one tick interval, then run on the wall-clock cadence.
		tick();
		const timer = window.setInterval(
			tick,
			RITUAL_COOLDOWN_TICK_INTERVAL_MS,
		);

		return () => {
			window.clearInterval(timer);
		};
	}, []);

	return useRemainingRitualCooldownMs(now);
}
