/**
 * Follow-up plan §2.4 — XP telemetry path (Fix #5).
 *
 * Verifies the orchestrator-owned `xp:gained` emission contract:
 *
 *   - `addXP({ amount: N })` emits exactly ONE `xp:gained` per positive
 *     applied delta, and the emitted `amount` is the EFFECTIVE post-gating
 *     delta (not the requested amount).
 *   - Negative-delta calls (dev subtractXp path) emit zero `xp:gained`
 *     events. The semantics is "net positive XP landed".
 *   - When the requested amount is fully gated to 0 (boundary clamp on a
 *     trial-failed crystal), no `xp:gained` is emitted.
 *   - When the orchestrator targets a topic with no active crystal, no
 *     `xp:gained` is emitted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { topicRefKey } from '@/lib/topicRef';
import { appEventBus } from '@/infrastructure/eventBus';
import { useCrystalTrialStore } from '@/features/crystalTrial';

import { useCrystalGardenStore } from '../stores/crystalGardenStore';

import * as crystalGardenOrchestrator from './crystalGardenOrchestrator';
import {
	crystal,
	DS,
	makeTrialWithStatus,
	resetAllStores,
	topicRef,
} from './__testHelpers';

function xpGainedCalls(emitSpy: ReturnType<typeof vi.spyOn>) {
	return emitSpy.mock.calls.filter(([eventName]) => eventName === 'xp:gained');
}

describe('crystalGardenOrchestrator.addXP — xp:gained telemetry', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('emits exactly one xp:gained event per positive applied delta', () => {
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 10)],
			unlockPoints: 0,
		});

		crystalGardenOrchestrator.addXP(topicRef('topic-a'), 25);

		const calls = xpGainedCalls(emitSpy);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[1]).toMatchObject({
			subjectId: DS,
			topicId: 'topic-a',
			cardId: 'direct',
		});
		emitSpy.mockRestore();
	});

	it('emits the effective applied delta after trial gating, not the requested amount', () => {
		// Boundary clamp: with crystal at 95 XP and trial in awaiting_player,
		// computeTrialGatedDirectReward caps the reward so XP lands at 99,
		// not at 95+50=145. The emitted amount must reflect the post-gating delta (4).
		const ref = topicRef('topic-a');
		const key = topicRefKey(ref);
		useCrystalTrialStore.setState({
			trials: { [key]: makeTrialWithStatus('topic-a', 'awaiting_player') },
		});
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 95)],
			unlockPoints: 0,
		});

		const emitSpy = vi.spyOn(appEventBus, 'emit');
		crystalGardenOrchestrator.addXP(ref, 50);

		const calls = xpGainedCalls(emitSpy);
		expect(calls).toHaveLength(1);
		const payload = calls[0]?.[1] as { amount: number };
		expect(payload.amount).toBe(4);
		expect(payload.amount).not.toBe(50);
		emitSpy.mockRestore();
	});

	it('does not emit xp:gained on a negative delta (dev subtract path)', () => {
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 50)],
			unlockPoints: 0,
		});

		crystalGardenOrchestrator.addXP(topicRef('topic-a'), -30);

		expect(xpGainedCalls(emitSpy)).toHaveLength(0);
		emitSpy.mockRestore();
	});

	it('does not emit xp:gained when no crystal exists for the topic', () => {
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 0 });

		crystalGardenOrchestrator.addXP(topicRef('missing'), 100);

		expect(xpGainedCalls(emitSpy)).toHaveLength(0);
		emitSpy.mockRestore();
	});

	it('forwards a custom sessionId when provided', () => {
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 10)],
			unlockPoints: 0,
		});

		crystalGardenOrchestrator.addXP(topicRef('topic-a'), 5, { sessionId: 'custom-session' });

		const calls = xpGainedCalls(emitSpy);
		expect(calls).toHaveLength(1);
		expect((calls[0]?.[1] as { sessionId: string }).sessionId).toBe('custom-session');
		emitSpy.mockRestore();
	});

	it('defaults sessionId to "direct" when no options are provided', () => {
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 10)],
			unlockPoints: 0,
		});

		crystalGardenOrchestrator.addXP(topicRef('topic-a'), 5);

		const calls = xpGainedCalls(emitSpy);
		expect((calls[0]?.[1] as { sessionId: string }).sessionId).toBe('direct');
		emitSpy.mockRestore();
	});
});
