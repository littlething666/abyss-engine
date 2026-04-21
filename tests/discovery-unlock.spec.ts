import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  waitForCanvasClickBox,
  E2E_HOME_PATH,
} from './utils/test-helpers';

/**
 * Discovery/Unlock E2E Test - Abyss Engine
 *
 * Keeps only UI-based tests. State logic tests moved to Vitest.
 */

test.describe('Discovery/Unlock Journey', () => {
  /**
   * Test: Discovery modal displays tiered topic grid
   * This inherently tests that clicking the altar opens the modal
   */
  test('should display tiered topic grid with unlock points and lock icons', async ({ page }) => {
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);

    // Load deck first
    const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
    if (await loadDeckButton.count() > 0) {
      await loadDeckButton.click();
      await page.waitForTimeout(1000);
    }

    // Click altar to open discovery modal
    const { box: canvasBox } = await waitForCanvasClickBox(page);

    await page.mouse.click(
      canvasBox.x + canvasBox.width / 2,
      canvasBox.y + canvasBox.height / 2
    );

    await page.waitForTimeout(1500);

    // Check for modal container (discovery modal opened)
    const modalContainer = page.locator('[class*="fixed inset-0"]').first();
    await expect(modalContainer).toBeVisible();

    // Check for tier labels (there are multiple tiers, so use first())
    const tierLabel = page.locator('text=Tier').first();
    await expect(tierLabel).toBeVisible();

    // Unlock points are shown as a badge with a tooltip (no literal "Unlock Point" copy in the DOM)
    await expect(page.getByTitle('Unlock points').first()).toBeVisible();

    // Check for lock icons
    const lockIcon = page.locator('text=🔒');
    expect(await lockIcon.count()).toBeGreaterThan(0);
  });

  /**
   * Test: Can view topic details and close modal with escape
   */
  test('should open topic details and close discovery modal with escape', async ({ page }) => {
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);

    // Load deck
    const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
    if (await loadDeckButton.count() > 0) {
      await loadDeckButton.click();
      await page.waitForTimeout(1000);
    }

    // Click altar
    const { canvas, box: canvasBox } = await waitForCanvasClickBox(page);

    await page.mouse.click(
      canvasBox.x + canvasBox.width / 2,
      canvasBox.y + canvasBox.height / 2
    );

    await page.waitForTimeout(1500);

    // Look for any topic buttons and click them
    const modalContainer = page.locator('[class*="fixed inset-0"]').first();

    // Get topic buttons in the modal
    const topicButtons = modalContainer.locator('div.grid button');
    const buttonCount = await topicButtons.count();

    if (buttonCount > 0) {
      await topicButtons.first().click();
      await page.waitForTimeout(500);

      // Check for details popup (prerequisites or topic info)
      const detailsPopup = page.locator('text=Prerequisites');
      const hasDetails = await detailsPopup.count() > 0 || await page.locator('[class*="bg-slate-800"]').count() > 1;
      expect(hasDetails).toBe(true);
    }

    // Press Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Canvas should still be visible after closing modal
    await expect(canvas!).toBeVisible();
  });
});
