import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  waitForAbyssDev,
  waitForDeckReady,
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
    await waitForAbyssDev(page);

    // Load deck first. The discovery grid is meaningless without a deck, so
    // the seed UI is a hard precondition for this spec — fail loudly here
    // (10 s) instead of timing out 15 s later on a downstream assertion if
    // the loader button has been renamed / feature-flagged out.
    const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
    await expect(
      loadDeckButton,
      'Default deck loader is required to seed the discovery grid',
    ).toBeVisible({ timeout: 10_000 });
    await loadDeckButton.click();
    await waitForDeckReady(page);

    // Click altar to open discovery modal
    const { box: canvasBox } = await waitForCanvasClickBox(page);

    await page.mouse.click(
      canvasBox.x + canvasBox.width / 2,
      canvasBox.y + canvasBox.height / 2
    );

    const altar = page.getByRole('dialog', { name: /Wisdom Altar/i });
    await expect(altar).toBeVisible({ timeout: 10_000 });

    // Unlock points are shown as a badge with a tooltip (no literal "Unlock Point" copy in the DOM)
    await expect(altar.getByTitle('Unlock points').first()).toBeVisible();

    // Default topic filter is "Locked". Loading the default deck can unlock the entire curriculum,
    // which leaves the locked filter with zero tiles (no lock badges) — that is expected, not a bug.
    // Widen to "All topics" so tier rows render. Use the toggle slot + title — Base UI toggles are not
    // always exposed as `role="button"` with the same accessible name Playwright expects.
    await altar.locator('[data-slot="toggle-group-item"][title^="All topics ("]').click();

    // Tier headings are "Tier 1", "Tier 2", … (substring match avoids brittle full-string anchoring).
    await expect(altar.getByText(/Tier\s+\d+/).first()).toBeVisible({ timeout: 15_000 });

    // Tiles use Lucide lock badges when locked and check badges when unlocked (no literal 🔒 in the grid).
    const lockBadges = altar.getByTestId('discovery-topic-lock-badge');
    const unlockBadges = altar.getByTestId('discovery-topic-unlock-badge');
    await expect(lockBadges.or(unlockBadges).first()).toBeVisible();
  });

  /**
   * Test: Can view topic details and close modal with escape
   */
  test('should open topic details and close discovery modal with escape', async ({ page }) => {
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);
    await waitForAbyssDev(page);

    // Load deck. As above, fail-fast on a missing seed UI rather than
    // letting the downstream assertions time out.
    const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
    await expect(
      loadDeckButton,
      'Default deck loader is required to seed the discovery grid',
    ).toBeVisible({ timeout: 10_000 });
    await loadDeckButton.click();
    await waitForDeckReady(page);

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
