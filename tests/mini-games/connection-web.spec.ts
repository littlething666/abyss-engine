import { test, expect } from '../fixtures/app';
import { waitForStudyPanelReady } from '../utils/test-helpers';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';

test('Mini-Game Connection Web — connect pairs, submit emits review event', async ({
  seededApp: page,
}) => {
  const prepared = await page.evaluate(async () => {
    const dev = (window as unknown as {
      abyssDev?: {
        setCurrentCardByType?: (
          t: 'MINI_GAME_CONNECTION_WEB',
        ) => Promise<{ topicId: string; cardId: string } | null>;
        openStudyPanel?: () => void;
        getMiniGameContent?: () => null | {
          type: string;
          pairs: Array<{ id: string; left: string; right: string }>;
        };
      };
    }).abyssDev;
    if (!dev?.setCurrentCardByType) return null;
    const selection = await dev.setCurrentCardByType('MINI_GAME_CONNECTION_WEB');
    if (!selection) return null;
    dev.openStudyPanel?.();
    return dev.getMiniGameContent?.() ?? null;
  });

  test.skip(!prepared, 'no connection-web card available in this deck');

  await waitForStudyPanelReady(page);
  await expect(page.getByTestId('connection-web-game')).toBeVisible({ timeout: 5000 });

  for (const pair of prepared!.pairs) {
    const leftChip = page.getByTestId(`mg-item-${pair.id}`);
    const rightChip = page.getByTestId(`mg-item-right-${pair.id}`);
    await leftChip.click();
    await rightChip.click();
  }

  const before = await getProgressionEventCount(page);
  await page.getByTestId('study-card-submit-answer').click();
  await waitForProgressionEvent(page, 'abyss-card:reviewed', before, 5000);
});
