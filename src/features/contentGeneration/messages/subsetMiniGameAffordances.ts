import type { MiniGameType } from '@/types/core';
import type { MiniGameAffordanceSet } from '@/types/contentQuality';

/** Supplies only the affordance branch relevant to a single mini-game generation job. */
export function subsetMiniGameAffordancesForType(
  aff: MiniGameAffordanceSet,
  gameType: MiniGameType,
): MiniGameAffordanceSet {
  switch (gameType) {
    case 'CATEGORY_SORT':
      return { categorySets: aff.categorySets, orderedSequences: [], connectionPairs: [] };
    case 'SEQUENCE_BUILD':
      return { categorySets: [], orderedSequences: aff.orderedSequences, connectionPairs: [] };
    case 'CONNECTION_WEB':
      return { categorySets: [], orderedSequences: [], connectionPairs: aff.connectionPairs };
    default: {
      const _exhaustive: never = gameType;
      return _exhaustive;
    }
  }
}
