import { test, expect } from '../fixtures/app';
import { waitForStudyPanelReady } from '../utils/test-helpers';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';
import { categoryZone, placeMiniGameItem } from '../utils/mini-game-actions';

test('Mini-Game Category Sort — placements + submit emit one review event', async ({
  seededApp: page,
}) => {
  const prepared = await page.evaluate(async () => {
    const dev = (window as unknown as {
      abyssDev?: {
        setCurrentCardByType?: (
          t: 'MINI_GAME_CATEGORY_SORT',
        ) => Promise<{ topicId: string; cardId: string } | null>;
        openStudyPanel?: () => void;
        getMiniGameContent?: () => null | {
          type: string;
          items: Array<{ id: string; correctCategoryId: string }>;
        };
      };
    }).abyssDev;
    if (!dev?.setCurrentCardByType) return null;
    const selection = await dev.setCurrentCardByType('MINI_GAME_CATEGORY_SORT');
    if (!selection) return null;
    dev.openStudyPanel?.();
    return dev.getMiniGameContent?.() ?? null;
  });

  test.skip(!prepared, 'no category-sort card available in this deck');

  await waitForStudyPanelReady(page);
  await expect(page.getByTestId('category-sort-game')).toBeVisible({ timeout: 5000 });

  for (const item of prepared!.items) {
    await placeMiniGameItem(page, item.id, categoryZone(page, item.correctCategoryId));
  }

  const before = await getProgressionEventCount(page);
  await page.getByTestId('study-card-submit-answer').click();
  await waitForProgressionEvent(page, 'abyss-card:reviewed', before, 5000);
});
