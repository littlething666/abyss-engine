import { test, expect } from '../fixtures/app';
import {
  getProgressionEventCount,
  waitForProgressionEvent,
} from '../utils/progression-probe';
import { waitForSceneProbe } from '../utils/three-probe';

/**
 * Verifies the crystal-trial pass sequence dispatches
 * `abyss-crystal-trial:completed` with `passed === true` via the
 * production trial API exposed on `AbyssDev` (`triggerTrial` →
 * `submitTrialCorrect`).
 *
 * History: this spec previously drove a now-retired `AbyssDev.forceLevelUp`
 * shim (follow-up plan §1 Option B retired the surface as a no-op
 * stub). Routing through the real trial path doubles this test as
 * regression coverage for the user-visible trial flow that the dev
 * shim used to bypass.
 *
 * Scope note: crossing the level boundary itself (the
 * `abyss-crystal:leveled` event) is gated on the player clicking the
 * Level Up button in `CrystalTrialModal` after a passing trial — that
 * UI step is exercised by `tests/crystal-trial/*.spec.ts` and is
 * intentionally out of scope here. This spec asserts the deterministic
 * slice reachable from `AbyssDev` alone (trial pass), keeping the
 * level-boundary contract testable from a single canonical place.
 */
test.describe('3D scene — crystal trial pass', () => {
  test('passing a crystal trial dispatches abyss-crystal-trial:completed', async ({
    seededApp: page,
  }) => {
    await waitForSceneProbe(page);

    const topicId = await page.evaluate(async () => {
      const dev = (window as unknown as {
        abyssDev?: {
          getCardByType?: (
            t: 'FLASHCARD',
          ) => Promise<{ topicId: string; cardId: string } | null>;
          spawnCrystal?: (id: string) => Promise<void>;
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

    const triggered = await page.evaluate(async (id: string) => {
      const dev = (window as unknown as {
        abyssDev?: { triggerTrial?: (id: string) => Promise<boolean> };
      }).abyssDev;
      return Boolean(await dev?.triggerTrial?.(id));
    }, topicId!);

    expect(triggered).toBe(true);

    const submitted = await page.evaluate(async (id: string) => {
      const dev = (window as unknown as {
        abyssDev?: { submitTrialCorrect?: (id: string) => Promise<unknown> };
      }).abyssDev;
      const r = await dev?.submitTrialCorrect?.(id);
      return r ?? null;
    }, topicId!);

    expect(submitted).not.toBeNull();

    const completed = await waitForProgressionEvent(
      page,
      'abyss-crystal-trial:completed',
      priorEvents,
      5000,
    );
    const detail = completed.detail as
      | { topicId?: string; passed?: boolean; targetLevel?: number }
      | undefined;
    expect(detail?.topicId).toBe(topicId);
    expect(detail?.passed).toBe(true);
    expect(typeof detail?.targetLevel).toBe('number');
  });
});
