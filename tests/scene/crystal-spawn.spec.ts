import { test, expect } from '../fixtures/app';
import { waitForSceneProbe, getSceneSnapshot, getCrystalByTopic } from '../utils/three-probe';
import { expectWebGPUAvailable } from '../utils/test-helpers';

/**
 * Scene-level coverage: crystals spawned by abyssDev are reflected in the R3F
 * scene graph within a few frames, at a plausible position on the garden floor.
 */
test.describe('3D scene — crystal spawn', () => {
  test('spawnCrystal populates scene probe with matching topicId', async ({ seededApp: page }) => {
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

    expect(spawned, 'abyssDev must produce a spawnable flashcard topic').toBeTruthy();

    await expect
      .poll(async () => getCrystalByTopic(page, spawned!), { timeout: 5000 })
      .not.toBeNull();

    const crystal = await getCrystalByTopic(page, spawned!);
    expect(crystal).not.toBeNull();
    expect(crystal!.visible).toBe(true);
    expect(Math.abs(crystal!.position[1])).toBeLessThan(2);

    const snap = await getSceneSnapshot(page);
    expect(snap).not.toBeNull();
    expect(snap!.crystalCount).toBeGreaterThan(0);
  });

  test('scene frame counter advances during idle soak', async ({ seededApp: page }) => {
    await waitForSceneProbe(page);
    const startFrames = await page.evaluate(
      () => (window as unknown as { __abyssScene?: { frameCount: number } }).__abyssScene?.frameCount ?? 0,
    );
    await page.waitForTimeout(1500);
    const endFrames = await page.evaluate(
      () => (window as unknown as { __abyssScene?: { frameCount: number } }).__abyssScene?.frameCount ?? 0,
    );
    expect(endFrames, 'scene must keep rendering while idle').toBeGreaterThan(startFrames);
  });
});
