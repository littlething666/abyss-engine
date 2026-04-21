import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  getCanvas,
  startConsoleErrorCapture,
  expectWebGPUAvailable,
  openCommandPaletteFromQuickActions,
  E2E_HOME_PATH,
} from './utils/test-helpers';

/**
 * Boot Test - Abyss Engine
 *
 * Single consolidated test for app boot and initialization.
 * Combines UI checks, console error detection, and canvas verification.
 */

test.describe('Boot Test', () => {
  test('should load the app with all UI elements and no critical errors', async ({ page }) => {
    const { errors, stop } = startConsoleErrorCapture(page);

    // Navigate to the home page
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);
    await expectWebGPUAvailable(page);

    // 1. Check the page title
    await expect(page).toHaveTitle(/Abyss Engine/i);

    // 2. Check for the main heading
    const heading = page.locator('h1');
    await expect(heading).toContainText('Abyss Engine');

    // 3. Find canvas element
    const canvas = await getCanvas(page);
    expect(canvas).not.toBeNull();
    await expect(canvas!).toBeVisible({ timeout: 8000 });

    // 4. Verify canvas has dimensions
    const box = await canvas!.boundingBox();
    expect(box).toBeDefined();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // 5. Check canvas dimensions as a proxy for rendering readiness
    const hasDimensions = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      return canvas.width > 0 && canvas.height > 0;
    });
    expect(hasDimensions).toBe(true);

    // 6. HUD: quick actions (command palette lives here) and floor select
    await expect(page.getByTestId('quick-actions-trigger')).toBeVisible();
    await openCommandPaletteFromQuickActions(page);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Select floor')).toBeVisible();

    // 7. Check the main container
    const mainContainer = page.locator('.w-screen.h-screen').first();
    await expect(mainContainer).toBeVisible();

    // 8. Verify viewport dimensions
    const viewport = page.viewportSize();
    expect(viewport).toBeDefined();
    expect(viewport!.width).toBeGreaterThanOrEqual(800);
    expect(viewport!.height).toBeGreaterThanOrEqual(600);

    // 9. Check for critical console errors
    // Wait a bit for any async errors
    await page.waitForTimeout(1000);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter((error) => !isKnownNonCriticalError(error));

    if (criticalErrors.length > 0) {
      console.log('[boot.spec] critical console errors:', JSON.stringify(criticalErrors, null, 2));
    }
    expect(criticalErrors.length).toBe(0);
    stop();
  });
});

// NOTE: The former `isKnownWebGPUBufferAllocationError` branch was removed on
// purpose. Per CLAUDE.md "Root Cause over Symptom", those errors only occurred
// when Dawn bound to a degenerate fallback adapter with tiny buffer limits
// (the CI runner had no Vulkan ICD installed). The fix lives upstream in
// `.github/workflows/e2e-headless-ci.yml` — installing Mesa lavapipe so
// WebGPU has a real software Vulkan backend. If this filter reappears, the
// underlying adapter has regressed and the boot smoke must fail loudly.
const isKnownNonCriticalError = (error: string): boolean =>
  error.includes('Warning:') ||
  error.includes('ReactDOM.render') ||
  error.includes('Cannot read properties of undefined') ||
  error.includes('404') ||
  error.includes('Failed to load resource') ||
  error.includes('ResizeObserver loop limit exceeded') ||
  error.includes('ResizeObserver loop completed with undelivered notifications');
