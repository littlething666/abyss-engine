import { beforeEach, describe, expect, it } from 'vitest';

import {
	ATTUNEMENT_SUBMISSION_COOLDOWN_MS,
	useStudySessionStore,
} from './studySessionStore';

const STORAGE_KEY = 'abyss-study-session-v0';

describe('studySessionStore', () => {
	beforeEach(() => {
		localStorage.clear();
		useStudySessionStore.setState({
			currentSession: null,
			pendingRitual: null,
			lastRitualSubmittedAt: null,
			currentSubjectId: null,
		});
	});

	it('hydrates with all four slice fields null', () => {
		const state = useStudySessionStore.getState();
		expect(state.currentSession).toBeNull();
		expect(state.pendingRitual).toBeNull();
		expect(state.lastRitualSubmittedAt).toBeNull();
		expect(state.currentSubjectId).toBeNull();
	});

	it('exports the 8-hour ritual cooldown constant from this module (not from a policy)', () => {
		expect(ATTUNEMENT_SUBMISSION_COOLDOWN_MS).toBe(8 * 60 * 60 * 1000);
	});

	it('primitive setters update each slice independently', () => {
		const {
			setCurrentSession,
			setPendingRitual,
			setLastRitualSubmittedAt,
			setCurrentSubjectId,
		} = useStudySessionStore.getState();

		const session = {
			subjectId: 's',
			topicId: 't',
			queueCardIds: ['s::t::a-1'],
			currentCardId: 's::t::a-1',
			totalCards: 1,
		};

		setCurrentSession(session);
		expect(useStudySessionStore.getState().currentSession).toEqual(session);

		setPendingRitual({ subjectId: 's', topicId: 't', cards: [], sessionId: 'r' });
		expect(useStudySessionStore.getState().pendingRitual?.sessionId).toBe('r');

		setLastRitualSubmittedAt(123);
		expect(useStudySessionStore.getState().lastRitualSubmittedAt).toBe(123);

		setCurrentSubjectId('subj-x');
		expect(useStudySessionStore.getState().currentSubjectId).toBe('subj-x');
	});

	it('persists exactly the documented partialize() shape under abyss-study-session-v0', () => {
		useStudySessionStore.setState({
			currentSession: null,
			pendingRitual: null,
			lastRitualSubmittedAt: 9000,
			currentSubjectId: 'subj-y',
		});
		const persisted = window.localStorage.getItem(STORAGE_KEY);
		expect(persisted).not.toBeNull();
		const parsed = persisted ? JSON.parse(persisted) : null;
		expect(parsed.state).toMatchObject({
			currentSession: null,
			pendingRitual: null,
			lastRitualSubmittedAt: 9000,
			currentSubjectId: 'subj-y',
		});
		expect(Object.keys(parsed.state).sort()).toEqual([
			'currentSession',
			'currentSubjectId',
			'lastRitualSubmittedAt',
			'pendingRitual',
		]);
	});
});
