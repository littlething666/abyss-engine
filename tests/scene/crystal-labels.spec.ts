import { test, expect } from '../fixtures/app';
import {
  waitForSceneProbe,
  getSceneSnapshot,
  getCrystalByTopic,
  getFrameCount,
} from '../utils/three-probe';
import {
  expectWebGPUAvailable,
  startConsoleErrorCapture,
} from '../utils/test-helpers';

/**
 * Phase 3 smoke for topic Lucide icons in the 3D scene.
 *
 * Boots the seeded subject, spawns a single flashcard crystal, and verifies
 * that the CrystalLabelBillboard pipeline (text + optional icon glyph)
 * renders end-to-end without console errors. We do not introspect the label
 * billboard mesh directly; instead we rely on the scene probe contract: if
 * the crystal is in the snapshot and frames keep advancing, the label's
 * useFrame callback ran without throwing.
 */
test.describe('3D scene — topic icon labels (smoke)', () => {
  test('seeded subject loads a crystal and labels render without errors', async ({
    seededApp: page,
  }) => {
    const consoleErrors = startConsoleErrorCapture(page);

    await expectWebGPUAvailable(page);
    await waitForSceneProbe(page);

    const spawned = await page.evaluate(async () => {
      const dev = (window as unknown as {
        abyssDev?: {
          getCardByType?: (
            t: 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE',
          ) => Promise<{ topicId: string; cardId: string } | null>;
          spawnCrystal?: (id: string) => Promise<void>;
        };
      }).abyssDev;
      if (!dev) return null;
      const candidate = await dev.getCardByType?.('FLASHCARD');
      if (!candidate) return null;
      await dev.spawnCrystal?.(candidate.topicId);
      return candidate.topicId;
    });

    expect(
      spawned,
      'abyssDev must produce a spawnable flashcard topic',
    ).toBeTruthy();

    await expect
      .poll(async () => getCrystalByTopic(page, spawned!), { timeout: 5000 })
      .not.toBeNull();

    const snap = await getSceneSnapshot(page);
    expect(snap).not.toBeNull();
    expect(snap!.crystalCount).toBeGreaterThan(0);

    // Allow a handful of frames so the CrystalLabelBillboard's useFrame
    // callback exercises the texture/material at least once.
    const startFrames = await getFrameCount(page);
    await page.waitForTimeout(750);
    const endFrames = await getFrameCount(page);
    expect(
      endFrames,
      'scene must keep rendering with topic icon labels active',
    ).toBeGreaterThan(startFrames);

    consoleErrors.stop();
    expect(
      consoleErrors.errors,
      'no console errors while rendering icon-bearing labels',
    ).toEqual([]);
  });
});
