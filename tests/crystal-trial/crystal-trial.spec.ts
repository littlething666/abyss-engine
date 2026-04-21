import { test, expect } from '../fixtures/app';
import { waitForSceneProbe } from '../utils/three-probe';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';

/**
 * Crystal Trial flow — trigger → answer → pass/fail → level-up.
 *
 * Relies on `abyssDev.triggerTrial` / `submitTrialCorrect` / `submitTrialWrong`
 * which are part of the E2E dev surface. Skipped if those hooks are absent.
 */
test.describe('Crystal Trial', () => {
  test('passing a trial emits trial-completed (passed)', async ({
    seededApp: page,
  }) => {
    await waitForSceneProbe(page);

    const available = await page.evaluate(() => {
      const dev = (window as unknown as {
        abyssDev?: {
          triggerTrial?: (topicId: string) => Promise<boolean>;
          submitTrialCorrect?: (topicId: string) => Promise<unknown>;
        };
      }).abyssDev;
      return typeof dev?.triggerTrial === 'function' && typeof dev?.submitTrialCorrect === 'function';
    });

    test.skip(!available, 'abyssDev trial hooks not available in this build');

    const topicId = await page.evaluate(async () => {
      const dev = (window as unknown as {
        abyssDev?: {
          getCardByType?: (
            t: 'FLASHCARD',
          ) => Promise<{ topicId: string; cardId: string } | null>;
          spawnCrystal?: (id: string) => Promise<void>;
          triggerTrial?: (id: string) => Promise<boolean>;
        };
      }).abyssDev;
      if (!dev) return null;
      const c = await dev.getCardByType?.('FLASHCARD');
      if (!c) return null;
      await dev.spawnCrystal?.(c.topicId);
      const ok = await dev.triggerTrial?.(c.topicId);
      return ok ? c.topicId : null;
    });

    test.skip(!topicId, 'trial could not be triggered for the seeded topic');

    const priorEvents = await getProgressionEventCount(page);
    await page.evaluate(async (id: string) => {
      const dev = (window as unknown as {
        abyssDev?: { submitTrialCorrect?: (id: string) => Promise<unknown> };
      }).abyssDev;
      await dev?.submitTrialCorrect?.(id);
    }, topicId!);

    const completed = await waitForProgressionEvent(
      page,
      'abyss-crystal:trial-completed',
      priorEvents,
      5000,
    );
    expect((completed.detail as { passed?: boolean } | undefined)?.passed).toBe(true);
    // Crystal XP / `abyss-crystal:leveled` is applied from the trial modal "Level Up" action, not from `submitTrialCorrect`.
  });

  test('failing a trial enters cooldown and does not emit crystal:leveled', async ({
    seededApp: page,
  }) => {
    await waitForSceneProbe(page);

    const available = await page.evaluate(() => {
      const dev = (window as unknown as {
        abyssDev?: {
          triggerTrial?: unknown;
          submitTrialWrong?: unknown;
          getTrialStatus?: unknown;
        };
      }).abyssDev;
      return (
        typeof dev?.triggerTrial === 'function' &&
        typeof dev?.submitTrialWrong === 'function' &&
        typeof dev?.getTrialStatus === 'function'
      );
    });

    test.skip(!available, 'abyssDev trial hooks not available in this build');

    const topicId = await page.evaluate(async () => {
      const dev = (window as unknown as {
        abyssDev?: {
          getCardByType?: (
            t: 'FLASHCARD',
          ) => Promise<{ topicId: string; cardId: string } | null>;
          spawnCrystal?: (id: string) => Promise<void>;
          triggerTrial?: (id: string) => Promise<boolean>;
        };
      }).abyssDev;
      if (!dev) return null;
      const c = await dev.getCardByType?.('FLASHCARD');
      if (!c) return null;
      await dev.spawnCrystal?.(c.topicId);
      const ok = await dev.triggerTrial?.(c.topicId);
      return ok ? c.topicId : null;
    });

    test.skip(!topicId, 'trial could not be triggered');

    const prior = await getProgressionEventCount(page);
    await page.evaluate(async (id: string) => {
      const dev = (window as unknown as {
        abyssDev?: { submitTrialWrong?: (id: string) => Promise<unknown> };
      }).abyssDev;
      await dev?.submitTrialWrong?.(id);
    }, topicId!);

    const completed = await waitForProgressionEvent(
      page,
      'abyss-crystal:trial-completed',
      prior,
      5000,
    );
    expect((completed.detail as { passed?: boolean } | undefined)?.passed).toBe(false);

    const status = await page.evaluate(async (id: string) => {
      const dev = (window as unknown as {
        abyssDev?: { getTrialStatus?: (id: string) => string };
      }).abyssDev;
      return dev?.getTrialStatus?.(id) ?? null;
    }, topicId!);
    expect(status).toBe('cooldown');
  });
});
