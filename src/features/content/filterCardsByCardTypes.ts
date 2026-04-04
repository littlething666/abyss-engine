import type { Card, CardType, MiniGameContent, MiniGameType } from '../../types/core';

/**
 * Returns cards whose `type` is in `enabledTypes`. If `enabledTypes` is empty, returns [].
 */
export function filterCardsByCardTypes(
  cards: Card[],
  enabledTypes: ReadonlySet<CardType>,
): Card[] {
  if (enabledTypes.size === 0) {
    return [];
  }
  return cards.filter((card) => enabledTypes.has(card.type));
}

export type BaseStudyCardType = 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE';

export interface StudyCardFilterSelection {
  enabledBaseTypes: BaseStudyCardType[];
  enabledMiniGameTypes: MiniGameType[];
}

/**
 * Study-session filter: base card types plus per–mini-game inclusion.
 * A mini-game card is included iff its `content.gameType` is in `enabledMiniGameTypes`.
 */
export function filterCardsForStudy(
  cards: Card[],
  enabledBaseTypes: ReadonlySet<BaseStudyCardType>,
  enabledMiniGameTypes: ReadonlySet<MiniGameType>,
): Card[] {
  if (enabledBaseTypes.size === 0 && enabledMiniGameTypes.size === 0) {
    return [];
  }
  return cards.filter((card) => {
    if (card.type === 'MINI_GAME') {
      if (enabledMiniGameTypes.size === 0) {
        return false;
      }
      const gameType = (card.content as MiniGameContent).gameType;
      return enabledMiniGameTypes.has(gameType);
    }
    return enabledBaseTypes.has(card.type);
  });
}
