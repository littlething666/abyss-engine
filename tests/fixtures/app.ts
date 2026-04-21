import { test as base, type Page } from '@playwright/test';
import {
  waitForPageHydrated,
  waitForAbyssDev,
  startConsoleErrorCapture,
  E2E_HOME_PATH,
} from '../utils/test-helpers';
import { installProgressionEventProbe } from '../utils/progression-probe';

interface SeedOptions {
  /** Load the default deck via the on-screen button + makeAllCardsDue. */
  loadDefaultDeck?: boolean;
  /** Fixed seed for deterministic shuffles (written to sessionStorage). */
  rngSeed?: string;
}

/**
 * Wait until the deck store reports at least one active card. Replaces the
 * previous magic `waitForTimeout(750)` after clicking "Load Default Deck".
 */
async function waitForDeckReady(page: Page, timeoutMs = 8000): Promise<void> {
  await page.waitForFunction(
    () => {
      const dev = (window as unknown as {
        abyssDev?: { getState?: () => { activeCards?: number } };
      }).abyssDev;
      const state = dev?.getState?.();
      return typeof state?.activeCards === 'number' && state.activeCards > 0;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

export async function seedApp(page: Page, opts: SeedOptions = {}): Promise<void> {
  const { loadDefaultDeck = true, rngSeed = 'abyss-e2e-seed-1' } = opts;

  // Clear storage and seed deterministic RNG BEFORE first paint so we don't
  // have to navigate twice. The prior `goto -> clear -> goto` pattern forced
  // WebGPU to re-initialize, which under parallel workers intermittently
  // closed the browser context during `localStorage.clear()`.
  await page.addInitScript((seed: string) => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.sessionStorage.setItem('abyss:rng-seed', seed);
    } catch {
      /* storage may be unavailable in some contexts */
    }
  }, rngSeed);

  await page.goto(E2E_HOME_PATH);
  await waitForPageHydrated(page);
  await waitForAbyssDev(page);

  if (loadDefaultDeck) {
    const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
    if ((await loadDeckButton.count()) > 0) {
      await loadDeckButton.click();
      await waitForDeckReady(page);
    }

    await page.evaluate(() => {
      const dev = (window as unknown as { abyssDev?: { makeAllCardsDue?: () => void } }).abyssDev;
      dev?.makeAllCardsDue?.();
    });
  }

  await installProgressionEventProbe(page);
}

/**
 * Playwright test fixture that boots the Abyss Engine shell in a known-good
 * state: hydrated, fresh storage, deterministic RNG seed, default deck loaded
 * with all cards due, progression event probe installed, console error capture
 * ready.
 */
export const test = base.extend<{
  seededApp: Page;
  consoleErrors: { errors: string[]; stop: () => void };
}>({
  seededApp: async ({ page }, use) => {
    await seedApp(page);
    await use(page);
  },
  consoleErrors: async ({ page }, use) => {
    const capture = startConsoleErrorCapture(page);
    await use(capture);
    capture.stop();
  },
});

export { expect } from '@playwright/test';
