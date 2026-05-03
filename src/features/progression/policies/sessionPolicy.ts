import { cardRefKey } from '@/lib/topicRef';
import type { Card, TopicRef } from '@/types/core';

import { defaultSM2, type SM2Data } from './sm2';

/** A study card with its SM-2 schedule attached for session-time policy decisions. */
export interface CardWithSm2 extends Card {
	sm2: SM2Data;
}

/**
 * Pairs each card with its SM-2 schedule (or a default fresh schedule when
 * the card has never been reviewed). Pure: does not touch any store.
 *
 * Formerly inlined inside `progressionStore.ts`; lifted here so the study
 * orchestrator can compose it with the SM-2 store without re-implementing
 * the lookup.
 */
export function attachSm2(
	ref: TopicRef,
	cards: Card[],
	sm2Map: Record<string, SM2Data>,
): CardWithSm2[] {
	return cards.map((card) => ({
		...card,
		sm2: sm2Map[cardRefKey({ ...ref, cardId: card.id })] || defaultSM2,
	}));
}

/**
 * Filters the queueable card list down to the player's currently unlocked
 * difficulty band. The crystal-leveling policy decides `maxDifficulty` from
 * crystal level + buffs; this function simply applies it.
 */
export function filterCardsByDifficulty<T extends { difficulty: number }>(
	cards: T[],
	maxDifficulty: number,
): T[] {
	return cards.filter((card) => card.difficulty <= maxDifficulty);
}
