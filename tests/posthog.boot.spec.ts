import { expect, test } from '@playwright/test';

import {
  E2E_HOME_PATH,
  expectWebGPUAvailable,
  waitForPageHydrated,
} from './utils/test-helpers';

/**
 * Phase 1 PostHog smoke. Asserts that the cold-boot path performs no
 * outbound traffic to any PostHog host when analytics are disabled,
 * either implicitly (no `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` in the
 * environment) or explicitly via the documented `?abyss-analytics=off`
 * kill-switch querystring.
 *
 * The route handler aborts any matching request — a green test means
 * no requests were ever attempted.
 */
const POSTHOG_HOST_PATTERN = /\.(posthog\.com|posthog\.io)(?:[/?#]|$)/i;

test.describe('PostHog boot', () => {
  test('does not contact any PostHog host on cold boot when the kill switch is active', async ({
    page,
  }) => {
    const offendingRequests: string[] = [];

    await page.route(POSTHOG_HOST_PATTERN, async (route) => {
      offendingRequests.push(route.request().url());
      await route.abort();
    });

    await page.goto(`${E2E_HOME_PATH}?abyss-analytics=off`);
    await waitForPageHydrated(page);
    await expectWebGPUAvailable(page);

    // Allow any deferred analytics work to settle (rAF×2 mentor
    // re-broadcast, idle-time SDK lazy work, etc.).
    await page.waitForTimeout(1000);

    expect(
      offendingRequests,
      `Unexpected PostHog network activity:\n${offendingRequests.join('\n')}`,
    ).toEqual([]);
  });
});
