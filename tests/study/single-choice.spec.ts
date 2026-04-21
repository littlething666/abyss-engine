import { test, expect } from '../fixtures/app';
import { waitForStudyPanelReady } from '../utils/test-helpers';
import {
  assertNoNewProgressionEvents,
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';

test('Single Choice — select, submit, continue emits exactly one review event', async ({
  seededApp: page,
}) => {
  await page.evaluate(async () => {
    const dev = (window as unknown as {
      abyssDev?: {
        getCardByType?: (
          t: 'SINGLE_CHOICE',
        ) => Promise<{ topicId: string; cardId: string } | null>;
        spawnCrystal?: (topicId: string) => Promise<void>;
        setCurrentCardByType?: (
          t: 'SINGLE_CHOICE',
        ) => Promise<{ topicId: string; cardId: string } | null>;
        openStudyPanel?: () => void;
      };
    }).abyssDev;
    if (!dev) throw new Error('abyssDev missing');
    const pick = await dev.getCardByType?.('SINGLE_CHOICE');
    if (!pick) throw new Error('no single-choice card');
    await dev.spawnCrystal?.(pick.topicId);
    await dev.setCurrentCardByType?.('SINGLE_CHOICE');
    dev.openStudyPanel?.();
  });

  await waitForStudyPanelReady(page);
  await expect(page.getByTestId('study-card-format-single-choice')).toBeVisible({ timeout: 3000 });

  await page.getByTestId('study-card-choice-options').locator('button').first().click({ force: true });

  const beforeSubmit = await getProgressionEventCount(page);
  await page.getByTestId('study-card-submit-answer').click({ force: true });
  await waitForProgressionEvent(page, 'abyss-card:reviewed', beforeSubmit, 5000);

  const beforeContinue = await getProgressionEventCount(page);
  await page.getByTestId('study-card-continue').click({ force: true });
  await assertNoNewProgressionEvents(page, beforeContinue, 600);
});
