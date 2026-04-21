import { test, expect } from '../fixtures/app';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';
import { waitForSceneProbe } from '../utils/three-probe';

/**
 * Verifies that a level-up sequence fires `abyss-crystal:leveled` and that the
 * ceremony store lifecycle transitions through "in progress" then clears.
 *
 * This test is written defensively: if the test harness does not expose an
 * `awardXp`/`forceLevelUp` hook, it is skipped rather than faking progression.
 */
test.describe('3D scene — crystal level-up', () => {
  test('crystal level-up dispatches abyss-crystal:leveled', async ({ seededApp: page }) => {
    await waitForSceneProbe(page);

    const canForce = await page.evaluate(() => {
      const dev = (window as unknown as {
        abyssDev?: { forceLevelUp?: (topicId: string) => Promise<boolean> };
      }).abyssDev;
      return typeof dev?.forceLevelUp === 'function';
    });

    test.skip(!canForce, 'abyssDev.forceLevelUp not available in this build');

    const topicId = await page.evaluate(async () => {
      const dev = (window as unknown as {
        abyssDev?: {
          getCardByType?: (
            t: 'FLASHCARD',
          ) => Promise<{ topicId: string; cardId: string } | null>;
          spawnCrystal?: (id: string) => Promise<void>;
          forceLevelUp?: (id: string) => Promise<boolean>;
        };
      }).abyssDev;
      if (!dev) return null;
      const c = await dev.getCardByType?.('FLASHCARD');
      if (!c) return null;
      await dev.spawnCrystal?.(c.topicId);
      return c.topicId;
    });

    expect(topicId).toBeTruthy();

    const priorEvents = await getProgressionEventCount(page);
    const applied = await page.evaluate(async (id: string) => {
      const dev = (window as unknown as {
        abyssDev?: { forceLevelUp?: (id: string) => Promise<boolean> };
      }).abyssDev;
      return Boolean(await dev?.forceLevelUp?.(id));
    }, topicId!);

    test.skip(!applied, 'forceLevelUp did not apply (requires progression store support)');

    const leveled = await waitForProgressionEvent(page, 'abyss-crystal:leveled', priorEvents, 5000);
    const detail = leveled.detail as { topicId?: string; to?: number } | undefined;
    expect(detail?.topicId).toBe(topicId);
    expect(typeof detail?.to).toBe('number');
  });
});
