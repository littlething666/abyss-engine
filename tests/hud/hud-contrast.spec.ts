import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  expectWebGPUAvailable,
  E2E_HOME_PATH,
} from '../utils/test-helpers';

/**
 * HUD contrast — light theme regression.
 *
 * Locks the `--surface-hud` / `--surface-hud-border` tokens and their
 * application to the fixed-position HUD cluster. Light theme is the
 * regression target because transparent dark overlays historically fell
 * back to low-contrast neutrals before these tokens existed.
 */

test.describe('HUD contrast (light theme)', () => {
  test.use({ colorScheme: 'light' });

  test('surface-hud tokens are exposed and applied to HUD surfaces', async ({ page }) => {
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);
    await expectWebGPUAvailable(page);

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue('--surface-hud').trim(),
        border: style.getPropertyValue('--surface-hud-border').trim(),
      };
    });
    expect(tokens.bg.length).toBeGreaterThan(0);
    expect(tokens.border.length).toBeGreaterThan(0);

    const quickActions = page.getByTestId('quick-actions-trigger');
    await expect(quickActions).toBeVisible();

    const subjectNav = page.locator('[data-slot="subject-navigation-hud"]');
    await expect(subjectNav).toBeVisible();
    const subjectNavClasses = (await subjectNav.getAttribute('class')) ?? '';
    expect(subjectNavClasses).toMatch(/bg-surface-hud/);
    expect(subjectNavClasses).toMatch(/border-surface-hud-border/);

    const selectFloor = page.getByLabel('Select floor');
    await expect(selectFloor).toBeVisible();
  });
});
