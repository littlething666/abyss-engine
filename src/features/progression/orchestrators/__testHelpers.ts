import { cardRefKey } from '@/lib/topicRef';
import type { ActiveCrystal, Card, SubjectGraph } from '@/types/core';
import type { AttunementRitualPayload } from '@/types/progression';
import type { CrystalTrial } from '@/types/crystalTrial';

import { crystalCeremonyStore } from '../crystalCeremonyStore';
import { useBuffStore } from '../stores/buffStore';
import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import { useSM2Store } from '../stores/sm2Store';
import { useStudySessionStore } from '../stores/studySessionStore';
import { undoManager } from '../undoManager';
import { PASS_THRESHOLD, useCrystalTrialStore } from '@/features/crystalTrial';

export const DS = 'data-science' as const;

export function topicRef(topicId: string) {
	return { subjectId: DS, topicId };
}

export function cr(topicId: string, cardId: string) {
	return cardRefKey({ subjectId: DS, topicId, cardId });
}

export function createCard(id: string): Card {
	return {
		id,
		type: 'FLASHCARD',
		difficulty: 1,
		content: {
			front: `front-${id}`,
			back: `back-${id}`,
		},
	};
}

export function crystal(topicId: string, xp = 0): ActiveCrystal {
	return {
		subjectId: DS,
		topicId,
		gridPosition: [0, 0],
		xp,
		spawnedAt: Date.now(),
	};
}

export const topicGraphs: SubjectGraph[] = [
	{
		subjectId: 'data-science',
		title: 'Data Science',
		themeId: 'default',
		maxTier: 2,
		nodes: [
			{
				topicId: 'topic-a',
				title: 'Topic A',
				tier: 1,
				prerequisites: [],
				learningObjective: 'Base',
				iconName: 'lightbulb',
			},
			{
				topicId: 'topic-b',
				title: 'Topic B',
				tier: 2,
				prerequisites: ['topic-a'],
				learningObjective: 'Depends on A',
				iconName: 'lightbulb',
			},
		],
	},
];

/**
 * Resets every store the orchestrators read or write to its documented
 * initial state. Mirrors the Phase 5 contract: the four progression
 * stores plus the crystal-trial store and the ceremony store are the
 * complete write surface; the legacy progressionStore singleton is no
 * longer reachable.
 */
export function resetAllStores() {
	undoManager.reset();
	useCrystalGardenStore.setState({
		activeCrystals: [],
		unlockPoints: 0,
		resonancePoints: 0,
	});
	useStudySessionStore.setState({
		currentSession: null,
		pendingRitual: null,
		lastRitualSubmittedAt: null,
		currentSubjectId: null,
	});
	useSM2Store.setState({ sm2Data: {} });
	useBuffStore.setState({ activeBuffs: [] });
	useCrystalTrialStore.setState({
		trials: {},
		cooldownCardsReviewed: {},
		cooldownStartedAt: {},
	});
	crystalCeremonyStore.setState({
		pendingTopicKey: null,
		ceremonyTopicKey: null,
		ceremonyStartedAt: null,
	});
}

export function makeTrialWithStatus(
	topicId: string,
	status: CrystalTrial['status'],
): CrystalTrial {
	return {
		trialId: `trial-${DS}-${topicId}-L1-test`,
		subjectId: DS,
		topicId,
		targetLevel: 1,
		questions: [],
		status,
		answers: {},
		score: status === 'passed' ? PASS_THRESHOLD : null,
		passThreshold: PASS_THRESHOLD,
		createdAt: Date.now(),
		completedAt: status === 'passed' ? Date.now() : null,
		cardPoolHash: null,
	};
}

export function ritualPayload(topicId: string): AttunementRitualPayload {
	return {
		subjectId: DS,
		topicId,
		checklist: {
			sleepHours: 8,
			fuelQuality: 'steady-fuel',
			hydration: 'moderate',
			movementMinutes: 20,
			digitalSilence: true,
			visualClarity: true,
			lightingAndAir: true,
			targetCrystal: 'Core',
			microGoal: 'Improve recall',
			confidenceRating: 5,
		},
	};
}

export function createCards(count: number): Card[] {
	return Array.from({ length: count }, (_, index) => createCard(`a-${index + 1}`));
}
