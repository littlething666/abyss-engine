import { test, expect } from '../fixtures/app';
import { expectWebGPUAvailable, waitForStudyPanelReady } from '../utils/test-helpers';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';
import { assertSm2Advanced, getCurrentCardId, getSm2Snapshot } from '../utils/sm2-assertions';

/**
 * Flashcard flow: review → rate → SM-2 update → XP.
 *
 * Parametrized across all four SM-2 rating buckets. Each test:
 *   1. Opens a flashcard via abyssDev
 *   2. Records pre-rating SM-2 + event count
 *   3. Clicks the rating button
 *   4. Asserts abyss-card:reviewed fires with matching rating
 *   5. Asserts SM-2 advanced per the rating direction
 *   6. Asserts non-zero XP on the review payload when the rating grants XP (no separate `xp:gained` bus event)
 */
const RATINGS = [1, 2, 3, 4] as const;

for (const rating of RATINGS) {
  test(`Flashcard rating=${rating} updates SM-2 and emits progression events`, async ({
    seededApp: page,
  }) => {
    await expectWebGPUAvailable(page);

    await page.evaluate(async () => {
      const dev = (window as unknown as {
        abyssDev?: {
          getCardByType?: (
            t: 'FLASHCARD',
          ) => Promise<{ topicId: string; cardId: string } | null>;
          spawnCrystal?: (topicId: string) => Promise<void>;
          setCurrentCardByType?: (
            t: 'FLASHCARD',
          ) => Promise<{ topicId: string; cardId: string } | null>;
          openStudyPanel?: () => void;
        };
      }).abyssDev;
      if (!dev) throw new Error('abyssDev missing');
      const pick = await dev.getCardByType?.('FLASHCARD');
      if (!pick) throw new Error('no flashcard available');
      // submitStudyResult requires an active crystal for the session topic (progressionStore).
      await dev.spawnCrystal?.(pick.topicId);
      const selection = await dev.setCurrentCardByType?.('FLASHCARD');
      if (!selection) throw new Error('could not set flashcard after spawn');
      dev.openStudyPanel?.();
    });

    await waitForStudyPanelReady(page);
    await expect(page.getByTestId('study-card-format-flashcard')).toBeVisible({ timeout: 3000 });

    const cardId = await getCurrentCardId(page);
    expect(cardId).toBeTruthy();
    const before = await getSm2Snapshot(page, cardId!);

    const priorEvents = await getProgressionEventCount(page);
    await page.getByTestId(`study-card-rating-${rating}`).click({ force: true });

    const reviewed = await waitForProgressionEvent(page, 'abyss-card:reviewed', priorEvents, 5000);
    const reviewDetail = reviewed.detail as { rating?: number; buffedReward?: number } | undefined;
    expect(reviewDetail?.rating).toBe(rating);

    if (before) {
      await expect
        .poll(async () => {
          const s = await getSm2Snapshot(page, cardId!);
          return s?.nextReview ?? 0;
        }, { timeout: 3000 })
        .toBeGreaterThan(before.nextReview);
      const after = await getSm2Snapshot(page, cardId!);
      if (after) assertSm2Advanced(before, after, rating);
    }

    if (rating >= 2) {
      expect(reviewDetail?.buffedReward ?? 0).toBeGreaterThan(0);
    }

    await expect(page.getByTestId('study-card-answer-section')).toBeVisible({ timeout: 3000 });
  });
}
