import { test, expect } from '../fixtures/app';

/**
 * Mentor pre-first-subject onboarding E2E.
 *
 * Boots a fresh app (no persisted mentor state, no first-subject generation
 * on record), waits for the onboarding dialog to auto-open via
 * mentorBootstrap's double-rAF deferred enqueue, then exercises:
 *   - typewriter skip-on-tap
 *   - choice routing (Skip name → destination message)
 *   - dismiss via 'Maybe later'
 *   - dismiss via the explicit close button
 *
 * The pre-first-subject trigger is intentionally NOT one-shot; the only
 * gate is `firstSubjectGenerationEnqueuedAt === null`, so dismissal does
 * not lock it out for the rest of the session — the bubble / Quick Action
 * resolver can re-surface it.
 */
test.describe('Mentor — onboarding.pre_first_subject flow', () => {
  test('onboarding dialog auto-opens on first boot and renders non-empty greeting', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const text = page.getByTestId('mentor-dialog-text');
    await expect
      .poll(
        async () => {
          const inner = await text.innerHTML();
          const visible = (await text.textContent()) ?? '';
          return !inner.includes('\u258c') && visible.trim().length > 0;
        },
        {
          timeout: 5000,
          message: 'pre-first-subject greeting text never finished revealing',
        },
      )
      .toBe(true);
  });

  test('clicking the message text skips the typewriter to full reveal', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const text = page.getByTestId('mentor-dialog-text');
    await text.click();

    await expect
      .poll(async () => {
        const innerHtml = await text.innerHTML();
        return innerHtml.includes('\u258c');
      })
      .toBe(false);
  });

  test('Skip choice on the name prompt advances to the destination message', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    // First message is greet (no choices); use the Next button to advance.
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

  test("selecting 'Maybe later' on the destination dismisses the dialog", async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

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

  test('overlay records the pre_first_subject trigger as seen so re-mounts in the same session do not re-fire bootstrap', async ({
    seededApp: page,
  }) => {
    const overlay = page.getByTestId('mentor-dialog-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('mentor-dialog-close').click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });

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
    expect(seen).toContain('onboarding.pre_first_subject');
  });
});
