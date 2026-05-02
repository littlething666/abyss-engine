import { test, expect } from '../fixtures/app';
import { waitForStudyPanelReady } from '../utils/test-helpers';
import {
  assertNoNewProgressionEvents,
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';

test('Multi Choice -- submit is gated by selection, emits single review event', async ({
  seededApp: page,
}) => {
  await page.evaluate(async () => {
    const dev = (window as unknown as {
      abyssDev?: {
        getCardByType?: (
          t: 'MULTI_CHOICE',
        ) => Promise<{ topicId: string; cardId: string } | null>;
        spawnCrystal?: (topicId: string) => Promise<void>;
        setCurrentCardByType?: (
          t: 'MULTI_CHOICE',
        ) => Promise<{ topicId: string; cardId: string } | null>;
        openStudyPanel?: () => void;
      };
    }).abyssDev;
    if (!dev) throw new Error('abyssDev missing');
    const pick = await dev.getCardByType?.('MULTI_CHOICE');
    if (!pick) throw new Error('no multi-choice card');
    await dev.spawnCrystal?.(pick.topicId);
    await dev.setCurrentCardByType?.('MULTI_CHOICE');
    dev.openStudyPanel?.();
  });

  await waitForStudyPanelReady(page);
  await expect(page.getByTestId('study-panel-card-root')).toBeVisible({ timeout: 3000 });

  const submit = page.getByTestId('study-card-submit-answer');
  await expect(submit).toBeDisabled();

  await page.getByTestId('study-card-choice-options').locator('button').first().click({ force: true });
  await expect(submit).toBeEnabled();

  const beforeSubmit = await getProgressionEventCount(page);
  await submit.click({ force: true });
  await waitForProgressionEvent(page, 'abyss-card:reviewed', beforeSubmit, 5000);

  const beforeContinue = await getProgressionEventCount(page);
  await page.getByTestId('study-card-continue').click({ force: true });
  await assertNoNewProgressionEvents(page, beforeContinue, 600);
});
