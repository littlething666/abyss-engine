import { test, expect } from '../fixtures/app';

/**
 * Mentor onboarding.welcome E2E.
 *
 * Boots a fresh app (no persisted mentor state), waits for the welcome dialog
 * to auto-open via mentorBootstrap's double-rAF deferred enqueue, then exercises:
 *   - typewriter skip-on-tap (mentor-dialog-text is clickable, jumps to full text)
 *   - choice routing (Skip name → next message)
 *   - dismiss via 'Maybe later' (advance past last message clears currentDialog)
 *   - dismiss via the explicit close button (mentor-dialog-close)
 *
 * The welcome trigger is one-shot: once the overlay renders the trigger is
 * marked seen, so we don't try to re-fire it within a single test.
 */
test.describe('Mentor \u2014 onboarding.welcome flow', () => {
  test('welcome dialog auto-opens on first boot and renders the greeting', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const text = page.getByTestId('mentor-dialog-text');
    // Typewriter reveal may be in progress; assert the initial greeting
    // substring shows up after reveal completes.
    await expect.poll(async () => (await text.textContent())?.includes('test subject'), {
      timeout: 5000,
      message: 'welcome greeting text never finished revealing',
    }).toBe(true);
  });

  test('clicking the message text skips the typewriter to full reveal', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const text = page.getByTestId('mentor-dialog-text');
    // Click before the reveal completes — handler is the same once revealed,
    // but the assertion below works either way.
    await text.click();

    // After the click, the visible text should not contain the in-progress
    // typewriter caret (▌) since revealedChars === totalChars.
    await expect.poll(async () => {
      const innerHtml = await text.innerHTML();
      return innerHtml.includes('\u258c');
    }).toBe(false);
  });

  test('Skip choice on the name prompt advances to the destination message', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    // First message is greet (no choices); click 'Got it' Next button to advance.
    const next = page.getByTestId('mentor-dialog-next');
    await expect(next).toBeVisible();
    await next.click();

    // Second message is the name prompt with input + 'Skip' choice.
    await expect(page.getByTestId('mentor-name-input')).toBeVisible();
    const skip = page.getByTestId('mentor-choice-skip-name');
    await expect(skip).toBeVisible();
    await skip.click();

    // Third message offers 'Create my first subject' / 'Maybe later'.
    await expect(page.getByTestId('mentor-choice-create-subject')).toBeVisible();
    await expect(page.getByTestId('mentor-choice-maybe-later')).toBeVisible();
  });

  test("selecting 'Maybe later' on the welcome destination dismisses the dialog", async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    // Greet → name prompt → destination.
    await page.getByTestId('mentor-dialog-next').click();
    await page.getByTestId('mentor-choice-skip-name').click();
    await page.getByTestId('mentor-choice-maybe-later').click();

    await expect(overlay).toBeHidden({ timeout: 5_000 });
  });

  test('explicit close button dismisses the dialog at any message', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('mentor-dialog-close').click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });
  });

  test('welcome marks the trigger seen so re-mounts do not re-fire it', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    // Dismiss the welcome dialog.
    await page.getByTestId('mentor-dialog-close').click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    // Verify the persisted mentor store recorded onboarding.welcome as seen.
    const seen = await page.evaluate(() => {
      const raw = window.localStorage.getItem('abyss-mentor-v1');
      if (!raw) return [] as string[];
      try {
        const parsed = JSON.parse(raw) as { state?: { seenTriggers?: string[] } };
        return parsed.state?.seenTriggers ?? [];
      } catch {
        return [] as string[];
      }
    });
    expect(seen).toContain('onboarding.welcome');
  });
});
