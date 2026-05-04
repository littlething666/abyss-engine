import { test, expect } from '../fixtures/app';

/**
 * Mentor Quick Actions parity for the bubble click.
 *
 * The MentorBubble billboard click and the HUD Quick Actions "Mentor" item
 * route through the same `tryEnqueueBubbleClick()` helper. Driving the 3D
 * billboard click from Playwright is brittle (canvas pixel hit-testing, bobbing
 * geometry, WebGPU readiness), so this spec covers the keyboard-accessible
 * Quick Actions path - which exercises identical Pin selection rules:
 *
 *   - Overlay open    -> click is a no-op (queued head still wins)
 *   - Queue non-empty -> click is a no-op (queued head still wins)
 *   - Otherwise       -> a bubble.click trigger plan is enqueued
 *
 * The shared helper logic is unit-tested in mentorBubbleClick.test.ts; this
 * spec confirms the wiring from the HUD button into the helper.
 */

async function dismissAnyOpenMentorDialog(page: import('@playwright/test').Page): Promise<void> {
  const overlay = page.getByTestId('mentor-dialog-overlay');
  if ((await overlay.count()) === 0) return;
  if (!(await overlay.isVisible())) return;

  // Walk through the welcome plan to dismissal: greet -> name -> 'Maybe later'.
  const next = page.getByTestId('mentor-dialog-next');
  if (await next.isVisible().catch(() => false)) await next.click();
  const skip = page.getByTestId('mentor-choice-skip-name');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const maybeLater = page.getByTestId('mentor-choice-maybe-later');
  if (await maybeLater.isVisible().catch(() => false)) {
    await maybeLater.click();
  } else {
    await page.getByTestId('mentor-dialog-close').click();
  }
  await expect(overlay).toBeHidden({ timeout: 5_000 });
}

test.describe('Mentor — Quick Actions parity', () => {
  test('Quick Actions "Mentor" item enqueues a bubble.click plan when nothing is queued', async ({
    seededApp: page,
  }) => {
    // Welcome dialog auto-opens on first boot; dismiss it so the queue and
    // overlay are empty before we exercise the bubble.click path.
    await dismissAnyOpenMentorDialog(page);
    await expect(page.getByTestId('mentor-dialog-overlay')).toBeHidden();

    // Open Quick Actions -> click the Mentor item.
    await page.getByTestId('quick-actions-trigger').click();
    await page.getByTestId('quick-action-mentor').click();

    // The bubble.click trigger evaluates the rule engine and enqueues a plan;
    // since no other dialog is queued, the head opens.
    await expect(page.getByTestId('mentor-dialog-overlay')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('mentor-dialog-text')).toBeVisible();
  });

  test('clicking the Quick Actions Mentor item while the overlay is open is a no-op', async ({
    seededApp: page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Welcome dialog auto-opens - leave it open. Capture the current
    // dialog id from the persisted store so we can confirm it does not get
    // displaced by the bubble click.
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const textLocator = page.getByTestId('mentor-dialog-text');
    // Typewriter cursor (U+258C) must be gone or the "before" snapshot races the animation.
    await expect(textLocator).not.toContainText('\u258c', { timeout: 5_000 });
    const initialText = await textLocator.textContent();

    await page.getByTestId('quick-actions-trigger').click();
    await page.getByTestId('quick-action-mentor').click();

    // Dialog text must not change - v1 selection rules say overlay-open
    // clicks are no-ops.
    await page.waitForTimeout(250); // small settle window for any (unwanted) state churn
    const afterText = await textLocator.textContent();
    expect(afterText).toBe(initialText);
  });
});
