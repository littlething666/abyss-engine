import { Locator, Page } from '@playwright/test';

/**
 * Focused E2E helpers used by current specs.
 */

/**
 * Wait for the page to be fully loaded with client-side hydration.
 */
export async function waitForPageHydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return document.readyState === 'complete';
  });

  await page
    .waitForSelector('[class*="text-2xl"]:has-text("Loading"), [class*="Loading"]', {
      state: 'hidden',
      timeout: 10000,
    })
    .catch(() => {
      // Ignore if loading element doesn't exist.
    });
}

/**
 * Find the 3D canvas element on the page.
 */
export async function getCanvas(page: Page): Promise<Locator | null> {
  const canvas = page.locator('canvas').first();
  const count = await canvas.count();

  if (count === 0) {
    return null;
  }

  return canvas;
}

/**
 * Clear localStorage for fresh test state.
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
  });
}
