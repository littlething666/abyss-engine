import { test, expect } from '../fixtures/app';

test.describe('Mentor onboarding (pre-first-subject)', () => {
  test('fresh player sees the unnamed greet with a name input', async ({ seededApp: page }) => {
    await expect(page.getByTestId('mentor-dialog-overlay')).toBeVisible({ timeout: 10_000 });
    // The fresh-player flow auto-advances through the greet to the
    // name-input message; click `next` once to land on the name step if
    // the dialog has not auto-advanced yet.
    const next = page.getByTestId('mentor-dialog-next');
    if (await next.isVisible().catch(() => false)) {
      await next.click();
    }
    await expect(page.getByTestId('mentor-name-input')).toBeVisible();
  });

  test('returning player (playerName persisted) skips the name input', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'abyss-mentor-v1',
        JSON.stringify({
          state: {
            playerName: 'Sergio',
            mentorLocale: 'en',
            seenTriggers: [],
            narrationEnabled: true,
            lastInteractionAt: null,
            cooldowns: {},
            firstSubjectGenerationEnqueuedAt: null,
          },
          version: 3,
        }),
      );
    });
    await page.goto('/?e2e=1');
    await expect(page.getByTestId('mentor-dialog-overlay')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mentor-name-input')).toHaveCount(0);
  });
});
