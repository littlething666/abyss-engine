import { test, expect } from '../fixtures/app';

/**
 * Mentor Quick Actions parity for the bubble click.
 *
 * The MentorBubble billboard click and the HUD Quick Actions "\ud83d\udde3\ufe0f Mentor" item
 * route through the same `tryEnqueueBubbleClick()` helper. Driving the 3D
 * billboard click from Playwright is brittle (canvas pixel hit-testing, bobbing
 * geometry, WebGPU readiness), so this spec covers the keyboard-accessible
 * Quick Actions path \u2014 which exercises identical Pin selection rules:
 *
 *   - Overlay open    \u2192 click is a no-op (queued head still wins)
 *   - Queue non-empty \u2192 click is a no-op (queued head still wins)
 *   - Otherwise       \u2192 a bubble.click trigger plan is enqueued
 *
 * The shared helper logic is unit-tested in mentorBubbleClick.test.ts; this
 * spec confirms the wiring from the HUD button into the helper.
 */

async function dismissAnyOpenMentorDialog(page: import('@playwright/test').Page): Promise<void> {
  const overlay = page.getByTestId('mentor-dialog-overlay');
  if ((await overlay.count()) === 0) return;
  if (!(await overlay.isVisible())) return;

  // Walk through the welcome plan to dismissal: greet \u2192 name \u2192 'Maybe later'.
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

test.describe('Mentor \u2014 Quick Actions parity', () => {
  test('Quick Actions "Mentor" item enqueues a bubble.click plan when nothing is queued', async ({
    seededApp: page,
  }) => {
    // Welcome dialog auto-opens on first boot; dismiss it so the queue and
    // overlay are empty before we exercise the bubble.click path.
    await dismissAnyOpenMentorDialog(page);
    await expect(page.getByTestId('mentor-dialog-overlay')).toBeHidden();

    // Open Quick Actions \u2192 click the Mentor item.
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
    // Welcome dialog auto-opens \u2014 leave it open. Capture the current
    // dialog id from the persisted store so we can confirm it does not get
    // displaced by the bubble click.
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const initialText = await page.getByTestId('mentor-dialog-text').textContent();

    await page.getByTestId('quick-actions-trigger').click();
    await page.getByTestId('quick-action-mentor').click();

    // Dialog text must not change \u2014 v1 selection rules say overlay-open
    // clicks are no-ops.
    await page.waitForTimeout(250); // small settle window for any (unwanted) state churn
    const afterText = await page.getByTestId('mentor-dialog-text').textContent();
    expect(afterText).toBe(initialText);
  });
});
