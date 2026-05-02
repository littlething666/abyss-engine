import type {
  MiniGameContent,
  CategorySortContent,
  SequenceBuildContent,
  MatchPairsContent,
} from '../../types/core';
import type { MiniGameResult, MiniGamePlacement } from '../../types/miniGame';

const CORRECT_THRESHOLD = 0.8;

export function evaluateMiniGame(
  content: MiniGameContent,
  placements: Map<string, string>,
): MiniGameResult {
  switch (content.gameType) {
    case 'CATEGORY_SORT':
      return evaluateCategorySort(content, placements);
    case 'SEQUENCE_BUILD':
      return evaluateSequenceBuild(content, placements);
    case 'MATCH_PAIRS':
      return evaluateMatchPairs(content, placements);
  }
}

function evaluateCategorySort(
  content: CategorySortContent,
  placements: Map<string, string>,
): MiniGameResult {
  const totalItems = content.items.length;
  let correctItems = 0;
  const placementList: MiniGamePlacement[] = [];

  for (const item of content.items) {
    const placedCategoryId = placements.get(item.id);
    const isItemCorrect = placedCategoryId === item.categoryId;
    if (isItemCorrect) correctItems++;
    placementList.push({ itemId: item.id, targetId: placedCategoryId ?? '', isItemCorrect });
  }

  const score = totalItems > 0 ? correctItems / totalItems : 0;

  return {
    totalItems,
    correctItems,
    score,
    isCorrect: score >= CORRECT_THRESHOLD,
    placements: placementList,
  };
}

function evaluateSequenceBuild(
  content: SequenceBuildContent,
  placements: Map<string, string>,
): MiniGameResult {
  const totalItems = content.items.length;
  let correctItems = 0;
  const placementList: MiniGamePlacement[] = [];

  for (const item of content.items) {
    const placedPosition = placements.get(item.id);
    const isItemCorrect = placedPosition === String(item.correctPosition);
    if (isItemCorrect) correctItems++;
    placementList.push({ itemId: item.id, targetId: placedPosition ?? '', isItemCorrect });
  }

  const score = totalItems > 0 ? correctItems / totalItems : 0;

  return {
    totalItems,
    correctItems,
    score,
    isCorrect: score >= CORRECT_THRESHOLD,
    placements: placementList,
  };
}

function expectedRightNodeId(pairId: string): string {
  return `right-${pairId}`;
}

/**
 * Match Pairs scoring: every left node MUST end up paired with the
 * matching right node (`right-${pair.id}`). Match Pairs has no distractors,
 * so totalItems is just the number of declared pairs.
 */
function evaluateMatchPairs(
  content: MatchPairsContent,
  placements: Map<string, string>,
): MiniGameResult {
  const totalItems = content.pairs.length;
  let correctItems = 0;
  const placementList: MiniGamePlacement[] = [];

  for (const pair of content.pairs) {
    const leftId = pair.id;
    const expectedRightId = expectedRightNodeId(pair.id);
    const placedRightId = placements.get(leftId);
    const isItemCorrect = placedRightId === expectedRightId;
    if (isItemCorrect) correctItems++;
    placementList.push({
      itemId: leftId,
      targetId: placedRightId ?? '',
      isItemCorrect,
    });
  }

  const score = totalItems > 0 ? correctItems / totalItems : 0;

  return {
    totalItems,
    correctItems,
    score,
    isCorrect: score >= CORRECT_THRESHOLD,
    placements: placementList,
  };
}

export function miniGameResultToIsCorrect(result: MiniGameResult): boolean {
  return result.score >= CORRECT_THRESHOLD;
}
