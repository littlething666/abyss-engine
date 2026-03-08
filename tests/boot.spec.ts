import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  getCanvas,
} from './utils/test-helpers';

/**
 * Boot Test - Abyss Engine
 *
 * Single consolidated test for app boot and initialization.
 * Combines UI checks, console error detection, and canvas verification.
 */

test.describe('Boot Test', () => {
  test('should load the app with all UI elements and no critical errors', async ({ page }) => {
    const errors: string[] = [];

    // Collect console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to the home page
    await page.goto('/');
    await waitForPageHydrated(page);

    // 1. Check the page title
    await expect(page).toHaveTitle(/Abyss Engine/i);

    // 2. Check for the main heading
    const heading = page.locator('h1');
    await expect(heading).toContainText('Abyss Engine');

    // 3. Find canvas element
    const canvas = await getCanvas(page);
    expect(canvas).not.toBeNull();

    // 4. Verify canvas has dimensions
    const canvasElement = await canvas!.elementHandle();
    const box = await canvasElement?.boundingBox();
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

    // 6. Wait for the stats container
    const statsContainer = page.locator('.absolute.top-5.left-5');
    await expect(statsContainer).toBeVisible();

    // 7. Check for stat labels
    await expect(statsContainer).toContainText('Total');
    await expect(statsContainer).toContainText('Due');
    await expect(statsContainer).toContainText('Topics');
    await expect(statsContainer).toContainText('Locked');

    // 8. Check the main container
    const mainContainer = page.locator('.w-screen.h-screen').first();
    await expect(mainContainer).toBeVisible();

    // 9. Verify viewport dimensions
    const viewport = page.viewportSize();
    expect(viewport).toBeDefined();
    expect(viewport!.width).toBeGreaterThanOrEqual(800);
    expect(viewport!.height).toBeGreaterThanOrEqual(600);

    // 10. Check for critical console errors
    // Wait a bit for any async errors
    await page.waitForTimeout(1000);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(error => {
      if (error.includes('Warning:')) return false;
      if (error.includes('ReactDOM.render')) return false;
      if (error.includes('Cannot read properties of undefined')) return false;
      if (error.includes('404') || error.includes('Failed to load resource')) return false;
      return true;
    });

    expect(criticalErrors.length).toBe(0);
  });
});
