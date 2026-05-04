/**
 * Follow-up plan §2.1 — focusStudyCard preservation + pendingRitual ownership.
 *
 * Backfills coverage for Fix #2 and Fix #3 of the progression-monolith
 * verification plan, which shipped without their plan-mandated unit tests:
 *
 *   - Fix #2: same-topic focusStudyCard preserves attempts, sessionId,
 *     startedAt, activeBuffIds, hintUsedByCardId, and emits NO new
 *     `study-panel:history-applied` `submit` event.
 *   - Fix #2: cross-topic / empty-session focusStudyCard still calls
 *     startTopicStudySession end-to-end (queue + sessionId reset).
 *   - Fix #3: starting topic-B preserves topic-A's pendingRitual; only
 *     starting topic-A consumes it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appEventBus } from '@/infrastructure/eventBus';

import { useBuffStore } from '../stores/buffStore';
import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import { useStudySessionStore } from '../stores/studySessionStore';

import * as studySessionOrchestrator from './studySessionOrchestrator';
import {
	cr,
	createCard,
	crystal,
	DS,
	resetAllStores,
	topicRef,
} from './__testHelpers';

describe('studySessionOrchestrator.focusStudyCard preservation (Fix #2)', () => {
	beforeEach(() => {
		resetAllStores();
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a'), crystal('topic-b')],
			unlockPoints: 3,
		});
	});

	it('same-topic focusStudyCard preserves attempts, sessionId, startedAt, activeBuffIds, hintUsedByCardId', () => {
		const cards = [createCard('a-1'), createCard('a-2')];
		const ref = topicRef('topic-a');

		studySessionOrchestrator.startTopicStudySession(ref, cards);

		const initial = useStudySessionStore.getState().currentSession;
		expect(initial).not.toBeNull();
		const initialSessionId = initial!.sessionId;
		const initialStartedAt = initial!.startedAt;
		const initialActiveBuffIds = initial!.activeBuffIds;

		// Land an attempt + a hint to populate state we will assert is preserved.
		studySessionOrchestrator.markHintUsed(cr('topic-a', 'a-1'));
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);
		studySessionOrchestrator.advanceStudyAfterReveal();

		const before = useStudySessionStore.getState().currentSession;
		expect(before?.attempts).toHaveLength(1);
		expect(before?.hintUsedByCardId).toEqual({ 'a-1': true });

		// Re-focus same topic + same card. Must be a no-op for bookkeeping.
		studySessionOrchestrator.focusStudyCard(ref, cards, 'a-2');

		const after = useStudySessionStore.getState().currentSession;
		expect(after?.sessionId).toBe(initialSessionId);
		expect(after?.startedAt).toBe(initialStartedAt);
		expect(after?.activeBuffIds).toEqual(initialActiveBuffIds);
		expect(after?.attempts).toEqual(before?.attempts);
		expect(after?.hintUsedByCardId).toEqual({ 'a-1': true });
	});

	it('same-topic focusStudyCard with no focus target is a no-op (no session restart)', () => {
		const cards = [createCard('a-1'), createCard('a-2')];
		const ref = topicRef('topic-a');

		studySessionOrchestrator.startTopicStudySession(ref, cards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);

		const before = useStudySessionStore.getState().currentSession;
		expect(before?.attempts).toHaveLength(1);

		const emitSpy = vi.spyOn(appEventBus, 'emit');
		studySessionOrchestrator.focusStudyCard(ref, cards, null);

		const after = useStudySessionStore.getState().currentSession;
		expect(after?.sessionId).toBe(before?.sessionId);
		expect(after?.attempts).toEqual(before?.attempts);

		const submitHistoryEvents = emitSpy.mock.calls.filter(
			([eventName, payload]) =>
				eventName === 'study-panel:history-applied' &&
				(payload as { action?: string } | undefined)?.action === 'submit',
		);
		expect(submitHistoryEvents).toHaveLength(0);
		emitSpy.mockRestore();
	});

	it('cross-topic focusStudyCard runs the fresh-session path (new sessionId, attempts cleared)', () => {
		const aCards = [createCard('a-1'), createCard('a-2')];
		const bCards = [createCard('b-1'), createCard('b-2')];

		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), aCards);
		studySessionOrchestrator.submitStudyResult(cr('topic-a', 'a-1'), 4);
		const aSessionId = useStudySessionStore.getState().currentSession?.sessionId;
		expect(aSessionId).toBeDefined();

		studySessionOrchestrator.focusStudyCard(topicRef('topic-b'), bCards, 'b-2');

		const session = useStudySessionStore.getState().currentSession;
		expect(session?.subjectId).toBe(DS);
		expect(session?.topicId).toBe('topic-b');
		expect(session?.sessionId).not.toBe(aSessionId);
		expect(session?.attempts).toEqual([]);
		expect(session?.currentCardId).toBe(cr('topic-b', 'b-2'));
	});

	it('focusStudyCard from empty session calls startTopicStudySession end-to-end', () => {
		const cards = [createCard('a-1'), createCard('a-2')];
		expect(useStudySessionStore.getState().currentSession).toBeNull();

		studySessionOrchestrator.focusStudyCard(topicRef('topic-a'), cards, 'a-2');

		const session = useStudySessionStore.getState().currentSession;
		expect(session).not.toBeNull();
		expect(session?.topicId).toBe('topic-a');
		expect(session?.currentCardId).toBe(cr('topic-a', 'a-2'));
		expect(session?.queueCardIds).toContain(cr('topic-a', 'a-2'));
	});
});

describe('studySessionOrchestrator pendingRitual ownership (Fix #3)', () => {
	beforeEach(() => {
		resetAllStores();
		useCrystalGardenStore.setState({
			activeCrystals: [crystal('topic-a'), crystal('topic-b')],
			unlockPoints: 3,
		});
		// Clear buffs so they don't leak across the cross-topic flow.
		useBuffStore.setState({ activeBuffs: [] });
	});

	it('starting topic-B preserves topic-A pendingRitual; starting topic-A consumes it', () => {
		// Arrange: a queued ritual for topic-A.
		studySessionOrchestrator.openRitualForTopic(topicRef('topic-a'), [createCard('a-1')]);
		const pending = useStudySessionStore.getState().pendingRitual;
		expect(pending?.topicId).toBe('topic-a');
		const pendingSessionId = pending!.sessionId;

		// Act 1: start a session for the OTHER topic. The pending ritual must survive.
		studySessionOrchestrator.startTopicStudySession(topicRef('topic-b'), [createCard('b-1')]);
		const stillPending = useStudySessionStore.getState().pendingRitual;
		expect(stillPending?.topicId).toBe('topic-a');
		expect(stillPending?.sessionId).toBe(pendingSessionId);
		expect(useStudySessionStore.getState().currentSession?.sessionId).not.toBe(
			pendingSessionId,
		);

		// Act 2: start the matching topic. Now the ritual is consumed and its
		// sessionId is adopted by the study session.
		studySessionOrchestrator.startTopicStudySession(topicRef('topic-a'), [createCard('a-1')]);
		expect(useStudySessionStore.getState().pendingRitual).toBeNull();
		expect(useStudySessionStore.getState().currentSession?.sessionId).toBe(pendingSessionId);
	});
});
