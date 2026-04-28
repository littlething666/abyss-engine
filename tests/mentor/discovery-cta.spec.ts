import { test as base, expect } from '@playwright/test';
import { seedApp } from '../fixtures/app';

/**
 * Discovery empty-state CTA → IncrementalSubjectModal flow.
 *
 * When the workspace has no subjects, the Wisdom Altar shows an Empty
 * placeholder (data-testid="discovery-empty-no-subjects") with a single
 * "New subject" button. Clicking it must:
 *
 *   1. Close the Discovery modal (so the two surfaces never stack).
 *   2. Open the IncrementalSubjectModal.
 *
 * This wires into the mentor flow because the welcome dialog's
 * `open_discovery` effect routes through `openDiscoveryModal()` and the user
 * naturally lands on this empty state on first run.
 *
 * The base seededApp fixture loads the default deck, which produces subjects.
 * For this spec we boot a no-deck app so `subjects.length === 0` and the empty
 * state is rendered.
 */

const test = base.extend<{ noDeckApp: import('@playwright/test').Page }>({
  noDeckApp: async ({ page }, use) => {
    await seedApp(page, { loadDefaultDeck: false });
    await use(page);
  },
});

test.describe('Mentor \u2014 Discovery empty-state CTA', () => {
  test(
    'clicking "New subject" closes Discovery and opens IncrementalSubjectModal',
    async ({ noDeckApp: page }) => {
      // Welcome dialog will auto-open; close it so it does not steal focus.
      const overlay = page.getByTestId('mentor-dialog-overlay');
      if (await overlay.isVisible().catch(() => false)) {
        await page.getByTestId('mentor-dialog-close').click();
        await expect(overlay).toBeHidden({ timeout: 5_000 });
      }

      // Open the Wisdom Altar (Discovery modal) via the Quick Actions HUD.
      await page.getByTestId('quick-actions-trigger').click();
      await page.getByRole('menuitem', { name: /Wisdom Altar/ }).click();

      // Discovery dialog is open with the no-subjects empty placeholder.
      const dialog = page.getByRole('dialog', { name: /Wisdom Altar/ });
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      const emptyState = page.getByTestId('discovery-empty-no-subjects');
      await expect(emptyState).toBeVisible();

      // Click the "New subject" CTA.
      await emptyState.getByRole('button', { name: /New subject/ }).click();

      // Discovery dialog closes — confirm the two surfaces never stack.
      await expect(dialog).toBeHidden({ timeout: 5_000 });

      // IncrementalSubjectModal opens. It is mounted as a Radix Dialog;
      // its accessible name is unknown to this spec, but we can confirm the
      // empty-state placeholder is gone and a NEW dialog is present that is
      // not the Wisdom Altar.
      const anyDialog = page.getByRole('dialog');
      await expect(anyDialog).toBeVisible({ timeout: 5_000 });
      await expect(anyDialog).not.toHaveAccessibleName(/Wisdom Altar/i);
    },
  );
});
