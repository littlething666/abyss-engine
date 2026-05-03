/**
 * Phase 5 step 20 / step 23: 1:1 parity with the deleted
 * `progressionStore.test.ts` (commit 92a77eaa) walked through the
 * studySessionOrchestrator entry points instead of the legacy
 * `useProgressionStore` facade.
 *
 * One assertion from the deleted file is intentionally not ported:
 * 'does not persist undo stacks on the study session snapshot'. It
 * asserted on the legacy `abyss-progression-v3` localStorage key,
 * which no longer exists. The new four-store layout persists each
 * slice under its own key (abyss-crystal-garden-v0, abyss-study-
 * session-v0, abyss-sm2-v0, abyss-buff-v0); undoManager state is
 * intentionally in-memory only, so the invariant is enforced
 * structurally rather than at runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { topicRefKey } from '@/lib/topicRef';
import { appEventBus } from '@/infrastructure/eventBus';
import type { CrystalTrialStatus } from '@/types/crystalTrial';
import { useCrystalTrialStore } from '@/features/crystalTrial';

import { useBuffStore } from '../stores/buffStore';
import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import { useSM2Store } from '../stores/sm2Store';
import {
	ATTUNEMENT_SUBMISSION_COOLDOWN_MS,
	useStudySessionStore,
} from '../stores/studySessionStore';
import { MAX_UNDO_DEPTH, undoManager } from '../undoManager';

import * as studySessionOrchestrator from './studySessionOrchestrator';
import {
	cr,
	createCard,
	createCards,
	crystal,
	DS,
	makeTrialWithStatus,
	resetAllStores,
	ritualPayload,
	topicRef,
} from './__testHelpers';

const CAP_STATUSES_FOR_MATRIX: CrystalTrialStatus[] = [
	'idle',
	'pregeneration',
	'awaiting_player',
	'in_progress',
	'failed',
	'cooldown',
];

function seedLastRitualTimestamp(timestamp: number) {
	useStudySessionStore.setState({ lastRitualSubmittedAt: timestamp });
}

describe('studySessionOrchestrator card-only canonical API (parity port)', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('starts a study session using card input and applies outcome without queue auto-advancing', () => {
		const cards = [createCard('a-1'), createCard('a-2')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);

		const sessionAfterStart = useStudySessionStore.getState().currentSession;
		expect(sessionAfterStart?.topicId).toBe('topic-a');
		expect(sessionAfterStart?.currentCardId).toBe(cr('topic-a', 'a-1'));
		expect(sessionAfterStart?.totalCards).toBe(2);

		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);
		const sessionAfterSubmit = useStudySessionStore.getState().currentSession;
		expect(sessionAfterSubmit?.currentCardId).toBe(cr('topic-a', 'a-1'));
		expect(sessionAfterSubmit?.attempts).toHaveLength(1);

		studySessionOrchestrator.advanceStudyAfterReveal();
		expect(useStudySessionStore.getState().currentSession?.currentCardId).toBe(cr('topic-a', 'a-2'));

		const updated = useSM2Store.getState().sm2Data[cr('topic-a', 'a-1')];
		expect(updated).toBeDefined();
		expect(updated.interval).toBeGreaterThan(0);
	});

	it('records hint usage for the active card and applies slow bucket on coarse recall', () => {
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		const emitSpy = vi.spyOn(appEventBus, 'emit');
		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		const cardRef = cr('topic-a', 'a-1');

		studySessionOrchestrator.markHintUsed(cardRef);
		expect(useStudySessionStore.getState().currentSession?.hintUsedByCardId).toMatchObject({ 'a-1': true });

		const resolved = studySessionOrchestrator.submitCoarseStudyResult(cardRef, 'recalled');
		expect(resolved).toEqual({ rating: 2, appliedBucket: 'slow' });

		const afterSubmit = useStudySessionStore.getState().currentSession;
		const attempt = afterSubmit?.attempts?.[afterSubmit.attempts.length - 1];
		expect(attempt).toMatchObject({
			cardId: cardRef,
			coarseChoice: 'recalled',
			hintUsed: true,
			appliedBucket: 'slow',
			rating: 2,
		});

		const cardReviewedEvent = emitSpy.mock.calls.find(
			([eventName]) => eventName === 'card:reviewed',
		)?.[1] as { coarseChoice?: string; hintUsed?: boolean; appliedBucket?: string } | undefined;
		expect(cardReviewedEvent).toMatchObject({
			coarseChoice: 'recalled',
			hintUsed: true,
			appliedBucket: 'slow',
			rating: 2,
		});
		emitSpy.mockRestore();
	});

	it('marks hint usage as idempotent for a single card', () => {
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		const cardRef = cr('topic-a', 'a-1');

		studySessionOrchestrator.markHintUsed(cardRef);
		studySessionOrchestrator.markHintUsed(cardRef);
		expect(useStudySessionStore.getState().currentSession?.hintUsedByCardId).toEqual({ 'a-1': true });
	});

	it('ignores duplicate review submissions for the same card', () => {
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		const emitSpy = vi.spyOn(appEventBus, 'emit');
		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		const cardRef = cr('topic-a', 'a-1');

		const coarseResult = studySessionOrchestrator.submitCoarseStudyResult(cardRef, 'forgot');
		expect(coarseResult).not.toBeNull();
		expect(useStudySessionStore.getState().currentSession?.attempts).toHaveLength(1);

		if (coarseResult) {
			studySessionOrchestrator.submitStudyResult(cardRef, coarseResult.rating);
		}

		expect(useStudySessionStore.getState().currentSession?.attempts).toHaveLength(1);
		const cardReviewedCalls = emitSpy.mock.calls.filter(([eventName]) => eventName === 'card:reviewed');
		expect(cardReviewedCalls).toHaveLength(1);
		emitSpy.mockRestore();
	});

	it('ignores markHintUsed when the active card already has an attempt', () => {
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		const cardRef = cr('topic-a', 'a-1');
		studySessionOrchestrator.submitStudyResult(cardRef, 4);

		studySessionOrchestrator.markHintUsed(cardRef);
		expect(useStudySessionStore.getState().currentSession?.hintUsedByCardId).toEqual({});
		expect(useStudySessionStore.getState().currentSession?.attempts).toHaveLength(1);
	});

	it('ignores coarse submissions for non-current cards', () => {
		const cards = [createCard('a-1'), createCard('a-2')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });
		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);

		const current = useStudySessionStore.getState().currentSession?.currentCardId;
		expect(current).toBeTruthy();
		const nonCurrentCard = current === cr('topic-a', 'a-1') ? cr('topic-a', 'a-2') : cr('topic-a', 'a-1');

		const resolved = studySessionOrchestrator.submitCoarseStudyResult(nonCurrentCard, 'recalled');
		expect(resolved).toBeNull();
		expect(useStudySessionStore.getState().currentSession?.attempts).toHaveLength(0);
	});

	it('submitStudyResult does not emit coarse metadata', () => {
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		const emitSpy = vi.spyOn(appEventBus, 'emit');
		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		emitSpy.mockClear();

		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 3);
		const cardReviewedEvent = emitSpy.mock.calls.find(
			([eventName]) => eventName === 'card:reviewed',
		)?.[1] as
			| { coarseChoice?: string; hintUsed?: boolean; appliedBucket?: string }
			| undefined;

		expect(cardReviewedEvent?.coarseChoice).toBeUndefined();
		expect(cardReviewedEvent?.hintUsed).toBeUndefined();
		expect(cardReviewedEvent?.appliedBucket).toBeUndefined();
		emitSpy.mockRestore();
	});

	it('focusStudyCard selects a different queued card without reordering the queue', () => {
		const cards = [createCard('a-1'), createCard('a-2')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		expect(useStudySessionStore.getState().currentSession?.currentCardId).toBe(cr('topic-a', 'a-1'));

		studySessionOrchestrator.focusStudyCard(topicRef('topic-a'), cards, 'a-2');
		const session = useStudySessionStore.getState().currentSession;
		expect(session?.currentCardId).toBe(cr('topic-a', 'a-2'));
		expect(session?.queueCardIds).toEqual([cr('topic-a', 'a-1'), cr('topic-a', 'a-2')]);

		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-2'), 4);
		expect(useStudySessionStore.getState().currentSession?.currentCardId).toBe(cr('topic-a', 'a-2'));

		studySessionOrchestrator.advanceStudyAfterReveal();
		expect(useStudySessionStore.getState().currentSession?.currentCardId).toBe(cr('topic-a', 'a-1'));
	});
});

describe('studySessionOrchestrator XP / unlock point / trial gating (parity port)', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('adds an unlock point when a study result levels up a crystal', () => {
		const ref = topicRef('topic-a');
		const key = topicRefKey(ref);
		useCrystalTrialStore.setState({
			trials: { [key]: makeTrialWithStatus('topic-a', 'passed') },
		});

		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a', 95)], unlockPoints: 0 });

		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

		const cg = useCrystalGardenStore.getState();
		expect(cg.activeCrystals[0]).toMatchObject({ xp: 110 });
		expect(cg.unlockPoints).toBe(1);
	});

	it('caps XP at level boundary during awaiting_player and still grants Resonance on correct', () => {
		const ref = topicRef('topic-a');
		const key = topicRefKey(ref);
		useCrystalTrialStore.setState({
			trials: { [key]: makeTrialWithStatus('topic-a', 'awaiting_player') },
		});

		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 95)],
			unlockPoints: 0,
			resonancePoints: 0,
		});

		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

		const cg = useCrystalGardenStore.getState();
		expect(cg.activeCrystals[0]).toMatchObject({ xp: 99 });
		expect(cg.resonancePoints).toBe(1);
	});

	it.each(CAP_STATUSES_FOR_MATRIX)(
		'caps XP at level boundary when trial status is %s',
		(status) => {
			resetAllStores();
			const ref = topicRef('topic-a');
			const key = topicRefKey(ref);
			if (status === 'idle') {
				useCrystalTrialStore.setState({ trials: {} });
			} else {
				useCrystalTrialStore.setState({
					trials: { [key]: makeTrialWithStatus('topic-a', status) },
				});
			}

			const cards = [createCard('a-1')];
			useCrystalGardenStore.setState({
				activeCrystals: [crystal('topic-a', 95)],
				unlockPoints: 0,
				resonancePoints: 0,
			});

			studySessionOrchestrator.startTopicStudySession(ref, cards);
			studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

			expect(useCrystalGardenStore.getState().activeCrystals[0]).toMatchObject({ xp: 99 });
		},
	);

	it('does not emit crystal-trial:pregeneration-requested when XP is capped at boundary while trial is failed', () => {
		const ref = topicRef('topic-a');
		const key = topicRefKey(ref);
		useCrystalTrialStore.setState({
			trials: { [key]: makeTrialWithStatus('topic-a', 'failed') },
		});

		const emitSpy = vi.spyOn(appEventBus, 'emit');

		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a', 95)], unlockPoints: 0 });

		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

		const pregenCalls = emitSpy.mock.calls.filter((c) => c[0] === 'crystal-trial:pregeneration-requested');
		expect(pregenCalls).toHaveLength(0);
		emitSpy.mockRestore();
	});

	it('Q7 regression: boundary-idle on study path emits pregeneration once and caps XP at 99', () => {
		const ref = topicRef('topic-a');
		useCrystalTrialStore.setState({ trials: {} });

		const emitSpy = vi.spyOn(appEventBus, 'emit');

		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a', 95)], unlockPoints: 0 });

		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

		expect(useCrystalGardenStore.getState().activeCrystals[0]).toMatchObject({ xp: 99 });

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

	it('emits crystal-trial:pregeneration-requested on positive XP gain during submitStudyResult', () => {
		const ref = topicRef('topic-a');
		const emitSpy = vi.spyOn(appEventBus, 'emit');
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a', 10)], unlockPoints: 0 });

		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

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

	it('restores resonancePoints on undo after a correct review', () => {
		const ref = topicRef('topic-a');
		const key = topicRefKey(ref);
		useCrystalTrialStore.setState({
			trials: { [key]: makeTrialWithStatus('topic-a', 'awaiting_player') },
		});
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a', 50)],
			unlockPoints: 0,
			resonancePoints: 2,
		});
		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);
		expect(useCrystalGardenStore.getState().resonancePoints).toBe(3);
		studySessionOrchestrator.undoLastStudyResult();
		expect(useCrystalGardenStore.getState().resonancePoints).toBe(2);
	});
});

describe('studySessionOrchestrator ritual + cooldown (parity port)', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('stores attunement submission and starts session with derived buffs', () => {
		const cards = [createCard('a-1'), createCard('a-2')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		const result = studySessionOrchestrator.submitAttunementRitual(ritualPayload('topic-a'));
		expect(result).not.toBeNull();
		expect(result?.buffs.length).toBeGreaterThan(0);

		const pendingAfterSubmit = useStudySessionStore.getState().pendingRitual;
		const expectedSessionId = pendingAfterSubmit?.sessionId;
		expect(expectedSessionId).toBeDefined();
		expect(pendingAfterSubmit?.topicId).toBe('topic-a');
		expect(useBuffStore.getState().activeBuffs).toHaveLength(result?.buffs.length || 0);
		expect(useBuffStore.getState().activeBuffs[0]?.condition).toBeDefined();

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		const startedSession = useStudySessionStore.getState().currentSession;
		expect(useStudySessionStore.getState().pendingRitual).toBeNull();
		expect(startedSession?.sessionId).toBe(expectedSessionId);
		expect(startedSession?.activeBuffIds).toEqual(
			expect.arrayContaining(result?.buffs.map((buff) => buff.buffId) ?? []),
		);

		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);
		studySessionOrchestrator.advanceStudyAfterReveal();
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-2'), 4);

		expect(useBuffStore.getState().activeBuffs).toHaveLength(0);
	});

	it('blocks attunement submission while cooldown is active', () => {
		const now = Date.now();
		seedLastRitualTimestamp(now);
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		const result = studySessionOrchestrator.submitAttunementRitual(ritualPayload('topic-a'));
		expect(result).toBeNull();
		expect(
			studySessionOrchestrator.getRemainingRitualCooldownMs(now + 60 * 60 * 1000),
		).toBeGreaterThan(0);
	});

	it('allows attunement submission once cooldown window has passed', () => {
		const now = Date.now();
		seedLastRitualTimestamp(now - (ATTUNEMENT_SUBMISSION_COOLDOWN_MS + 60 * 60 * 1000));
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		const result = studySessionOrchestrator.submitAttunementRitual(ritualPayload('topic-a'));
		expect(result).not.toBeNull();
		expect(result?.buffs.length).toBeGreaterThan(0);
	});
});

describe('studySessionOrchestrator undo / redo (parity port)', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('supports multiple undo/redo steps in a single study session', () => {
		const cards = [createCard('a-1'), createCard('a-2'), createCard('a-3')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);
		studySessionOrchestrator.advanceStudyAfterReveal();
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-2'), 3);
		studySessionOrchestrator.advanceStudyAfterReveal();

		let session = useStudySessionStore.getState().currentSession;
		expect(session?.currentCardId).toBe(cr('topic-a', 'a-3'));
		expect(undoManager.undoStackSize).toBe(2);
		expect(undoManager.redoStackSize).toBe(0);

		studySessionOrchestrator.undoLastStudyResult();
		session = useStudySessionStore.getState().currentSession;
		expect(session?.currentCardId).toBe(cr('topic-a', 'a-2'));
		expect(undoManager.undoStackSize).toBe(1);
		expect(undoManager.redoStackSize).toBe(1);

		studySessionOrchestrator.undoLastStudyResult();
		session = useStudySessionStore.getState().currentSession;
		expect(session?.currentCardId).toBe(cr('topic-a', 'a-1'));
		expect(undoManager.undoStackSize).toBe(0);
		expect(undoManager.redoStackSize).toBe(2);

		studySessionOrchestrator.redoLastStudyResult();
		session = useStudySessionStore.getState().currentSession;
		expect(session?.currentCardId).toBe(cr('topic-a', 'a-2'));
		expect(undoManager.undoStackSize).toBe(1);
		expect(undoManager.redoStackSize).toBe(1);

		studySessionOrchestrator.redoLastStudyResult();
		session = useStudySessionStore.getState().currentSession;
		expect(session?.currentCardId).toBe(cr('topic-a', 'a-3'));
		expect(undoManager.undoStackSize).toBe(2);
		expect(undoManager.redoStackSize).toBe(0);
	});

	it('supports deep undo history bounded by MAX_UNDO_DEPTH in memory', () => {
		const cards = createCards(MAX_UNDO_DEPTH + 5);
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);

		cards.forEach((card, index) => {
			studySessionOrchestrator.submitStudyResult(cr('topic-a', card.id), 4);
			if (index < cards.length - 1) {
				studySessionOrchestrator.advanceStudyAfterReveal();
			}
		});

		expect(undoManager.undoStackSize).toBe(MAX_UNDO_DEPTH);
		expect(undoManager.redoStackSize).toBe(0);

		studySessionOrchestrator.undoLastStudyResult();
		expect(undoManager.undoStackSize).toBe(MAX_UNDO_DEPTH - 1);
		expect(undoManager.redoStackSize).toBe(1);
		expect(useStudySessionStore.getState().currentSession?.currentCardId).toBe(
			cr('topic-a', cards[cards.length - 1]!.id),
		);
	});
});

describe('studySessionOrchestrator event emissions (parity port)', () => {
	beforeEach(() => {
		resetAllStores();
	});

	it('emits card:reviewed and session:completed events from submission', () => {
		const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

		const eventCalls = dispatchSpy.mock.calls;
		const cardReviewed = eventCalls.find(
			([event]) => event instanceof CustomEvent && event.type === 'abyss-card:reviewed',
		);
		const sessionCompleteEvent = eventCalls.find(
			([event]) => event instanceof CustomEvent && event.type === 'abyss-session:completed',
		);

		expect(cardReviewed).toBeDefined();
		expect(sessionCompleteEvent).toBeDefined();

		const reviewPayload = (cardReviewed?.[0] as CustomEvent).detail as {
			cardId: string;
			subjectId: string;
			topicId: string;
			buffedReward: number;
			rating: number;
		};
		expect(reviewPayload).toMatchObject({
			cardId: cr('topic-a', 'a-1'),
			subjectId: DS,
			topicId: 'topic-a',
			rating: 4,
		});
		expect(reviewPayload.buffedReward).toBeGreaterThan(0);

		const sessionPayload = (sessionCompleteEvent?.[0] as CustomEvent).detail as {
			subjectId: string;
			topicId: string;
			totalAttempts: number;
			correctRate: number;
		};
		expect(sessionPayload).toMatchObject({
			subjectId: DS,
			topicId: 'topic-a',
			totalAttempts: 1,
		});

		dispatchSpy.mockRestore();
	});

	it('emits crystal:leveled when XP crosses a level boundary', () => {
		const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
		const ref = topicRef('topic-a');
		const key = topicRefKey(ref);
		useCrystalTrialStore.setState({
			trials: { [key]: makeTrialWithStatus('topic-a', 'passed') },
		});

		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a', 99)], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

		const levelUpEvent = dispatchSpy.mock.calls.find(
			([event]) => event instanceof CustomEvent && event.type === 'abyss-crystal:leveled',
		);
		expect(levelUpEvent).toBeDefined();
		const detail = (levelUpEvent?.[0] as CustomEvent).detail as {
			subjectId: string;
			topicId: string;
			from: number;
			to: number;
			levelsGained: number;
		};
		expect(detail).toMatchObject({
			subjectId: DS,
			topicId: 'topic-a',
			from: 0,
			to: 1,
			levelsGained: 1,
		});

		dispatchSpy.mockRestore();
	});

	it('emits history events for undo and redo', () => {
		const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
		const cards = [createCard('a-1'), createCard('a-2')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);
		dispatchSpy.mockClear();

		studySessionOrchestrator.undoLastStudyResult();
		const undoEvents = dispatchSpy.mock.calls.filter(
			([event]) => event instanceof CustomEvent && event.type === 'abyss-study-panel:history-applied',
		);
		expect(undoEvents).toHaveLength(1);
		expect((undoEvents[0]?.[0] as CustomEvent).detail).toMatchObject({
			action: 'undo',
			subjectId: DS,
			topicId: 'topic-a',
			undoCount: 0,
			redoCount: 1,
		});

		studySessionOrchestrator.redoLastStudyResult();
		const redoEvents = dispatchSpy.mock.calls.filter(
			([event]) => event instanceof CustomEvent && event.type === 'abyss-study-panel:history-applied',
		);
		expect(redoEvents).toHaveLength(2);
		expect((redoEvents[1]?.[0] as CustomEvent).detail).toMatchObject({
			action: 'redo',
			subjectId: DS,
			topicId: 'topic-a',
			undoCount: 1,
			redoCount: 0,
		});

		dispatchSpy.mockRestore();
	});

	it('does not emit history events when undo or redo are unavailable', () => {
		const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
		const cards = [createCard('a-1')];
		useCrystalGardenStore.setState({ activeCrystals: [crystal('topic-a')], unlockPoints: 3 });

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), cards);
		dispatchSpy.mockClear();

		studySessionOrchestrator.undoLastStudyResult();
		studySessionOrchestrator.redoLastStudyResult();
		const historyEvents = dispatchSpy.mock.calls.filter(
			([event]) => event instanceof CustomEvent && event.type === 'abyss-study-panel:history-applied',
		);
		expect(historyEvents).toHaveLength(0);

		dispatchSpy.mockRestore();
	});
});
