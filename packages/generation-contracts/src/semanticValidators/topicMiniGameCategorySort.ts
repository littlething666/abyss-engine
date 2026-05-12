import type { TopicMiniGameCategorySortArtifactPayload } from '../schemas';
import type { SemanticValidator } from './types';

/**
 * Semantic validator for `topic-mini-game-category-sort`.
 *
 * The strict Zod schema already enforces the structural envelope
 * (`gameType: 'CATEGORY_SORT'`, >=2 categories, >=1 items, every item
 * carries a non-empty `categoryId`). This validator adds the
 * playability rules the envelope cannot encode:
 * 1. Category `id` values are unique within a card.
 * 2. Item `id` values are unique within a card.
 * 3. Every item's `categoryId` references a declared category.
 * 4. Every category is referenced by at least one item — a category
 *    with no items is dead weight in the UI.
 */
export const validateTopicMiniGameCategorySortArtifact: SemanticValidator<
  TopicMiniGameCategorySortArtifactPayload
> = (payload) => {
  for (let i = 0; i < payload.cards.length; i += 1) {
    const card = payload.cards[i];
    const c = card.content;
    const categoryIds = new Set<string>();
    for (let j = 0; j < c.categories.length; j += 1) {
      const cat = c.categories[j];
      if (categoryIds.has(cat.id)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Duplicate category id at cards[${i}].content.categories[${j}]: ${cat.id}`,
          path: `cards[${i}].content.categories[${j}].id`,
        };
      }
      categoryIds.add(cat.id);
    }
    const itemIds = new Set<string>();
    const usedCategories = new Set<string>();
    for (let j = 0; j < c.items.length; j += 1) {
      const it = c.items[j];
      if (itemIds.has(it.id)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Duplicate item id at cards[${i}].content.items[${j}]: ${it.id}`,
          path: `cards[${i}].content.items[${j}].id`,
        };
      }
      itemIds.add(it.id);
      if (!categoryIds.has(it.categoryId)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Unknown categoryId "${it.categoryId}" at cards[${i}].content.items[${j}]`,
          path: `cards[${i}].content.items[${j}].categoryId`,
        };
      }
      usedCategories.add(it.categoryId);
    }
    for (const cat of c.categories) {
      if (!usedCategories.has(cat.id)) {
        return {
          ok: false,
          failureCode: 'validation:semantic-mini-game-playability',
          message: `Category "${cat.id}" has no items at cards[${i}]`,
          path: `cards[${i}].content.categories`,
        };
      }
    }
  }
  return { ok: true };
};
