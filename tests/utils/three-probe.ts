import { expect, type Page } from '@playwright/test';
import type { AbyssSceneSnapshot } from '../../src/utils/abyssSceneProbe';

export async function waitForSceneProbe(page: Page, timeout = 10_000): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const probe = (window as unknown as { __abyssScene?: { ready: boolean; snapshot: unknown } })
            .__abyssScene;
          return Boolean(probe?.ready && probe?.snapshot);
        }),
      { timeout, message: 'scene probe never became ready' },
    )
    .toBe(true);
}

export async function getSceneSnapshot(page: Page): Promise<AbyssSceneSnapshot | null> {
  return page.evaluate(() =>
    (window as unknown as { __abyssScene?: { snapshot: AbyssSceneSnapshot | null } }).__abyssScene
      ?.snapshot ?? null,
  );
}

export async function getCrystalByTopic(
  page: Page,
  topicId: string,
): Promise<AbyssSceneSnapshot['crystals'][number] | null> {
  const snap = await getSceneSnapshot(page);
  return snap?.crystals.find((c) => c.topicId === topicId) ?? null;
}

export async function getFrameCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __abyssScene?: { frameCount: number } }).__abyssScene?.frameCount ?? 0,
  );
}
