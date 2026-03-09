import { ConsoleMessage, expect, Locator, Page } from '@playwright/test';

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
export async function getCanvas(page: Page, timeoutMs = 8000): Promise<Locator | null> {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'attached', timeout: timeoutMs }).catch(() => null);

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

/**
 * Capture console error messages for a given page context.
 */
export interface BrowserConsoleErrors {
  errors: string[];
  stop: () => void;
}

export function startConsoleErrorCapture(page: Page): BrowserConsoleErrors {
  const errors: string[] = [];
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };

  page.on('console', handler);

  return {
    errors,
    stop: () => {
      page.off('console', handler);
    },
  };
}

/**
 * Wait until the study panel is mounted and card content container is visible.
 */
export async function waitForStudyPanelReady(page: Page): Promise<void> {
  await page.locator('[data-testid="study-panel-modal-content"]').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-testid="study-session-title"]').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-testid="study-panel-card-root"]').waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Assert that the browser exposes a usable WebGPU interface.
 */
export async function expectWebGPUAvailable(page: Page): Promise<void> {
  const hasNavigatorGpu = await page.evaluate(() => typeof navigator !== 'undefined' && 'gpu' in navigator);
  expect(hasNavigatorGpu).toBe(true);
}
