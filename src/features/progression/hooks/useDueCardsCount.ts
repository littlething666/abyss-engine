import { useMemo } from 'react';

import { cardRefKey } from '@/lib/topicRef';
import type { TopicRef } from '@/types/core';

import { useSM2Store } from '../stores/sm2Store';
import { defaultSM2, sm2 } from '../policies/sm2';

interface CardLike {
	id: string;
}

/**
 * Count of cards in `cards` that are currently due for `ref`. Adapter rule:
 * reads exactly one store (`sm2Store`) and calls exactly one policy
 * (`sm2.getDueCards`). Memoized on the SM-2 snapshot + card list identity
 * so unrelated store updates do not retrigger the filter.
 */
export function useDueCardsCount(ref: TopicRef, cards: CardLike[] = []): number {
	const sm2Data = useSM2Store((s) => s.sm2Data);
	return useMemo(() => {
		const withSm2 = cards.map((card) => ({
			...card,
			sm2: sm2Data[cardRefKey({ ...ref, cardId: card.id })] ?? defaultSM2,
		}));
		return sm2.getDueCards(withSm2).length;
	}, [cards, ref, sm2Data]);
}
