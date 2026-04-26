import { test, expect } from '../fixtures/app';
import { expectWebGPUAvailable, waitForStudyPanelReady } from '../utils/test-helpers';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';
import { assertSm2Advanced, getCurrentCardId, getSm2Snapshot } from '../utils/sm2-assertions';

/**
 * Flashcard flow: coarse-rate → SM-2 update → XP.
 *
 * Parametrized across coarse choices. Each test:
 *   1. Opens a flashcard via abyssDev
 *   2. Records pre-rating SM-2 + event count
 *   3. Clicks the coarse rating button
 *   4. Asserts abyss-card:reviewed fires with expected coarse metadata and derived rating
 *   5. Asserts SM-2 advanced per the rating direction
 *   6. Asserts non-zero XP on the review payload when the rating grants XP (no separate `xp:gained` bus event)
 */
const COARSE_CHOICES = ['forgot', 'recalled'] as const;

for (const coarseChoice of COARSE_CHOICES) {
  test(`Flashcard coarse choice=${coarseChoice} updates SM-2 and emits progression events`, async ({
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
    await page.getByTestId(`study-card-coarse-${coarseChoice}`).click({ force: true });

    const reviewed = await waitForProgressionEvent(page, 'abyss-card:reviewed', priorEvents, 5000);
    const reviewDetail = reviewed.detail as
      | { rating?: 1 | 2 | 3 | 4; buffedReward?: number; coarseChoice?: string; appliedBucket?: string }
      | undefined;
    expect(reviewDetail?.coarseChoice).toBe(coarseChoice);
    if (coarseChoice === 'forgot') {
      expect(reviewDetail?.rating).toBe(1);
      expect(reviewDetail?.appliedBucket).toBe('forgot');
    } else {
      expect(reviewDetail?.rating).toBeGreaterThan(1);
      expect(reviewDetail?.appliedBucket).not.toBe('forgot');
    }

    if (before) {
      await expect
        .poll(async () => {
          const s = await getSm2Snapshot(page, cardId!);
          return s?.nextReview ?? 0;
        }, { timeout: 3000 })
        .toBeGreaterThan(before.nextReview);
      const after = await getSm2Snapshot(page, cardId!);
      if (after && reviewDetail?.rating !== undefined) {
        assertSm2Advanced(before, after, reviewDetail.rating);
      }
    }

    if (coarseChoice === 'recalled') {
      expect(reviewDetail?.buffedReward ?? 0).toBeGreaterThan(0);
    }

    await expect(page.getByTestId('study-card-answer-section')).toBeVisible({ timeout: 3000 });
  });
}

test('Flashcard coarse recall after opening a hint opens applies slow bucket', async ({ seededApp: page }) => {
  await expectWebGPUAvailable(page);

  await page.evaluate(async () => {
    const dev = (window as unknown as {
      abyssDev?: {
        getCardByType?: (t: 'FLASHCARD') => Promise<{ topicId: string; cardId: string } | null>;
        spawnCrystal?: (topicId: string) => Promise<void>;
        setCurrentCardByType?: (t: 'FLASHCARD') => Promise<{ topicId: string; cardId: string } | null>;
        openStudyPanel?: () => void;
      };
    }).abyssDev;
    if (!dev) throw new Error('abyssDev missing');
    const pick = await dev.getCardByType?.('FLASHCARD');
    if (!pick) throw new Error('no flashcard available');
    await dev.spawnCrystal?.(pick.topicId);
    const selection = await dev.setCurrentCardByType?.('FLASHCARD');
    if (!selection) throw new Error('could not set flashcard after spawn');
    dev.openStudyPanel?.();
  });

  await waitForStudyPanelReady(page);
  await expect(page.getByTestId('study-card-format-flashcard')).toBeVisible({ timeout: 3000 });

  const cardId = await getCurrentCardId(page);
  expect(cardId).toBeTruthy();
  const priorEvents = await getProgressionEventCount(page);

  await page.getByTestId('study-card-llm-explain-trigger').click({ force: true });
  await page.getByTestId('study-card-coarse-recalled').click({ force: true });

  const reviewed = await waitForProgressionEvent(page, 'abyss-card:reviewed', priorEvents, 5000);
  const reviewDetail = reviewed.detail as
    | { rating?: number; buffedReward?: number; coarseChoice?: string; appliedBucket?: string; hintUsed?: boolean }
    | undefined;
  expect(reviewDetail?.coarseChoice).toBe('recalled');
  expect(reviewDetail?.hintUsed).toBe(true);
  expect(reviewDetail?.appliedBucket).toBe('slow');
  expect(reviewDetail?.rating).toBe(2);
  expect(await getSm2Snapshot(page, cardId!)).toBeTruthy();
  expect(reviewDetail?.buffedReward).toBeGreaterThan(0);
});
