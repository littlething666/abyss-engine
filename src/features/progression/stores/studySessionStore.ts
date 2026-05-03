import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { PendingRitualState, StudySession } from '@/types/progression';

/**
 * Cooldown window enforced between attunement-ritual submissions. Read by the
 * `useRemainingRitualCooldownMs` hook (via the orchestrator/policy layer);
 * exposed here because the cooldown gate is a property of the session
 * lifecycle, not of any policy.
 */
export const ATTUNEMENT_SUBMISSION_COOLDOWN_MS = 8 * 60 * 60 * 1000;

/**
 * Study-session state slice: the active in-progress study session, the most
 * recent ritual submission used to gate cooldowns, and the
 * `currentSubjectId` viewport signal that scopes which subject the player is
 * engaged with.
 *
 * `currentSubjectId` lives here (not in a separate `navigationStore` or
 * `uiStore`) because sessions are always subject-scoped and the field needs
 * to persist across reloads.
 *
 * Layered-architecture note: pure Zustand data container, primitive setters
 * only.
 */
export interface StudySessionState {
	currentSession: StudySession | null;
	pendingRitual: PendingRitualState | null;
	lastRitualSubmittedAt: number | null;
	currentSubjectId: string | null;
}

export interface StudySessionActions {
	setCurrentSession: (session: StudySession | null) => void;
	setPendingRitual: (ritual: PendingRitualState | null) => void;
	setLastRitualSubmittedAt: (atMs: number | null) => void;
	setCurrentSubjectId: (subjectId: string | null) => void;
}

export type StudySessionStore = StudySessionState & StudySessionActions;

const STUDY_SESSION_STORAGE_KEY = 'abyss-study-session-v0';

export const useStudySessionStore = create<StudySessionStore>()(
	persist(
		(set) => ({
			currentSession: null,
			pendingRitual: null,
			lastRitualSubmittedAt: null,
			currentSubjectId: null,

			setCurrentSession: (session) => set({ currentSession: session }),
			setPendingRitual: (ritual) => set({ pendingRitual: ritual }),
			setLastRitualSubmittedAt: (atMs) => set({ lastRitualSubmittedAt: atMs }),
			setCurrentSubjectId: (subjectId) => set({ currentSubjectId: subjectId }),
		}),
		{
			name: STUDY_SESSION_STORAGE_KEY,
			version: 0,
			partialize: (state) => ({
				currentSession: state.currentSession,
				pendingRitual: state.pendingRitual,
				lastRitualSubmittedAt: state.lastRitualSubmittedAt,
				currentSubjectId: state.currentSubjectId,
			}),
		},
	),
);
