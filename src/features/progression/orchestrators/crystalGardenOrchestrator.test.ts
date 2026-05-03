/**
 * Phase 5 step 20: parity port for the crystal-garden side of the
 * deleted progressionStore.test.ts. Covers unlockTopic graph-prereqs +
 * crystal:unlocked emit (Phase 1 step 6 contract) and the addXP direct
 * path including XP clamp, pregeneration emission, level-up unlock
 * grant, and trial-failed gating.
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
	topicGraphs,
	topicRef,
} from './__testHelpers';

describe('crystalGardenOrchestrator.unlockTopic', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('uses graph prerequisites and unlock points when unlocking topics', () => {
		useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 2 });

		const firstUnlock = crystalGardenOrchestrator.unlockTopic(topicRef('topic-a'), topicGraphs);
		expect(firstUnlock).not.toBeNull();

		// Direct-path XP grant carries topic-a from 0 -> 250, crossing the
		// L1 + L2 boundaries. Topic-b's graph prereq is `topic-a` with the
		// default minLevel (any level), so a level-2 topic-a satisfies it.
		crystalGardenOrchestrator.addXP(topicRef('topic-a'), 250);

		const dependentUnlock = crystalGardenOrchestrator.unlockTopic(topicRef('topic-b'), topicGraphs);
		expect(dependentUnlock).not.toBeNull();

		expect(
			useCrystalGardenStore.getState().activeCrystals.map((c) => c.topicId),
		).toContain('topic-b');
	});

	it('emits crystal:unlocked on the bus when unlocking a topic so the bus handler can present the ceremony', () => {
		// Phase 1 step 6 (e) contract: unlockTopic emits crystal:unlocked
		// instead of calling crystalCeremonyStore.presentCeremony directly.
		// The eventBusHandlers wiring (registered at app boot - not in this
		// unit-level test) reads selectIsAnyModalOpen(useUIStore.getState())
		// and routes into crystalCeremonyStore.presentCeremony.
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 1 });

		const firstUnlock = crystalGardenOrchestrator.unlockTopic(topicRef('topic-a'), topicGraphs);
		expect(firstUnlock).not.toBeNull();

		const unlockedCalls = emitSpy.mock.calls.filter(([eventName]) => eventName === 'crystal:unlocked');
		expect(unlockedCalls).toHaveLength(1);
		expect(unlockedCalls[0]?.[1]).toEqual({ subjectId: DS, topicId: 'topic-a' });

		emitSpy.mockRestore();
	});

	it('returns the existing grid position (no-op) when the topic is already unlocked', () => {
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a')],
			unlockPoints: 1,
		});
		const pos = crystalGardenOrchestrator.unlockTopic(topicRef('topic-a'), topicGraphs);
		expect(pos).toEqual([0, 0]);
		expect(useCrystalGardenStore.getState().unlockPoints).toBe(1); // No charge applied.
	});

	it('returns null when the topic cannot be unlocked (no points)', () => {
		useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 0 });
		const pos = crystalGardenOrchestrator.unlockTopic(topicRef('topic-a'), topicGraphs);
		expect(pos).toBeNull();
		expect(useCrystalGardenStore.getState().activeCrystals).toEqual([]);
	});
});

describe('crystalGardenOrchestrator.addXP', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('clamps crystal XP at zero when subtracting', () => {
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 50)],
			unlockPoints: 3,
		});

		const nextXp = crystalGardenOrchestrator.addXP(topicRef('topic-a'), -80);
		expect(nextXp).toBe(0);
		expect(useCrystalGardenStore.getState().activeCrystals[0]?.xp).toBe(0);
	});

	it('returns 0 when no crystal exists for the topic', () => {
		useCrystalGardenStore.setState({ activeCrystals: [], unlockPoints: 0 });
		expect(crystalGardenOrchestrator.addXP(topicRef('missing'), 50)).toBe(0);
	});

	it('emits crystal-trial:pregeneration-requested on positive XP gain during addXP', () => {
		const ref = topicRef('topic-a');
		const emitSpy = vi.spyOn(appEventBus, 'emit');

		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a', 10)], unlockPoints: 0 });

		crystalGardenOrchestrator.addXP(ref, 10);

		const pregenCalls = emitSpy.mock.calls.filter((c) => c[0] === 'crystal-trial:pregeneration-requested');
		expect(pregenCalls).toHaveLength(1);
		expect(pregenCalls[0]?.[1]).toMatchObject({
			subjectId: DS,
			topicId: 'topic-a',
			currentLevel: 0,
			targetLevel: 1,
		});
		emitSpy.mockRestore();
	});

	it('does not emit crystal-trial:pregeneration-requested on addXP when trial is failed', () => {
		const ref = topicRef('topic-a');
		const key = topicRefKey(ref);
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		useCrystalTrialStore.setState({
			trials: { [key]: makeTrialWithStatus('topic-a', 'failed') },
		});

		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a', 10)], unlockPoints: 0 });

		crystalGardenOrchestrator.addXP(ref, 10);

		const pregenCalls = emitSpy.mock.calls.filter((c) => c[0] === 'crystal-trial:pregeneration-requested');
		expect(pregenCalls).toHaveLength(0);
		emitSpy.mockRestore();
	});

	it('grants unlock points when crossing a level boundary', () => {
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 95)],
			unlockPoints: 0,
		});

		crystalGardenOrchestrator.addXP(topicRef('topic-a'), 15);

		const updated = useCrystalGardenStore.getState();
		expect(updated.activeCrystals[0]).toMatchObject({ xp: 110 });
		expect(updated.unlockPoints).toBe(1);
	});
});
