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
import * as studySessionOrchestrator from './studySessionOrchestrator';
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
		// L1 + L2 boundaries so topic-b's prereq (topic-a) is satisfied.
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
