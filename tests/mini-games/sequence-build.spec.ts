import { test, expect } from '../fixtures/app';
import { waitForStudyPanelReady } from '../utils/test-helpers';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';
import { placeMiniGameItem, sequenceSlot } from '../utils/mini-game-actions';

test('Mini-Game Sequence Build — place in order, submit emits review event', async ({
  seededApp: page,
}) => {
  const prepared = await page.evaluate(async () => {
    const dev = (window as unknown as {
      abyssDev?: {
        setCurrentCardByType?: (
          t: 'MINI_GAME_SEQUENCE_BUILD',
        ) => Promise<{ topicId: string; cardId: string } | null>;
        openStudyPanel?: () => void;
        getMiniGameContent?: () => null | {
          type: string;
          items: Array<{ id: string; correctIndex: number }>;
        };
      };
    }).abyssDev;
    if (!dev?.setCurrentCardByType) return null;
    const selection = await dev.setCurrentCardByType('MINI_GAME_SEQUENCE_BUILD');
    if (!selection) return null;
    dev.openStudyPanel?.();
    return dev.getMiniGameContent?.() ?? null;
  });

  test.skip(!prepared, 'no sequence-build card available in this deck');

  await waitForStudyPanelReady(page);
  await expect(page.getByTestId('sequence-build-game')).toBeVisible({ timeout: 5000 });

  const byIndex = [...prepared!.items].sort((a, b) => a.correctIndex - b.correctIndex);
  for (const item of byIndex) {
    await placeMiniGameItem(page, item.id, sequenceSlot(page, item.correctIndex));
  }

  const before = await getProgressionEventCount(page);
  await page.getByTestId('study-card-submit-answer').click();
  await waitForProgressionEvent(page, 'abyss-card:reviewed', before, 5000);
});
