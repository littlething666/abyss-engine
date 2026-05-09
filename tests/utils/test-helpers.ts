import {
  expect,
  type BrowserContext,
  type ConsoleMessage,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';

/**
 * Focused E2E helpers used by current specs.
 */

/** Home path that disables the WebGPU gate overlay so Playwright can reach the shell (see `app/page.tsx`). */
export const E2E_HOME_PATH = '/?e2e=1';

/**
 * Deterministic durable Worker base URL used by Playwright. The route mock
 * below owns this URL; no local Cloudflare Worker process is required for boot
 * and shell tests that do not explicitly exercise durable execution.
 */
export const E2E_DURABLE_GENERATION_WORKER_URL =
  'http://127.0.0.1:3000/__abyss-e2e-durable-generation';

const E2E_DURABLE_GENERATION_PATH_PREFIX =
  new URL(E2E_DURABLE_GENERATION_WORKER_URL).pathname;

const routedDurableGenerationContexts = new WeakSet<BrowserContext>();

function normaliseDurableWorkerPath(url: URL): string {
  if (url.pathname.startsWith(E2E_DURABLE_GENERATION_PATH_PREFIX)) {
    return url.pathname.slice(E2E_DURABLE_GENERATION_PATH_PREFIX.length) || '/';
  }
  return url.pathname;
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Install a narrow durable Worker mock for tests whose purpose is app-shell
 * behaviour, not backend workflow execution. It returns empty run lists so
 * mount-time durable hydration has a deterministic backend boundary.
 */
export async function installDurableGenerationWorkerMock(page: Page): Promise<void> {
  const context = page.context();
  if (routedDurableGenerationContexts.has(context)) return;
  routedDurableGenerationContexts.add(context);

  let runSequence = 0;

  await context.route(
    /^(?:https?:\/\/(?:127\.0\.0\.1:3000\/__abyss-e2e-durable-generation|localhost:8787|127\.0\.0\.1:8787))(?:\/|$)/,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = normaliseDurableWorkerPath(url);

      if (request.method() === 'GET' && path === '/health') {
        await fulfillJson(route, 200, { ok: true });
        return;
      }

      if (request.method() === 'GET' && path === '/v1/runs') {
        await fulfillJson(route, 200, { runs: [] });
        return;
      }

      if (request.method() === 'POST' && path === '/v1/runs') {
        runSequence += 1;
        await fulfillJson(route, 200, { runId: `e2e-run-${runSequence}` });
        return;
      }

      if (request.method() === 'GET' && /^\/v1\/runs\/[^/]+\/events$/.test(path)) {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: ': e2e empty durable stream\n\n',
        });
        return;
      }

      await fulfillJson(route, 404, {
        error: `Unhandled e2e durable Worker route: ${request.method()} ${path}`,
      });
    },
  );
}

/**
 * Wait for the page to be fully loaded with client-side hydration.
 */
/** Opens the command palette via the bottom-right Quick actions menu (no standalone trigger). */
export async function openCommandPaletteFromQuickActions(page: Page): Promise<void> {
  await page.getByTestId('quick-actions-trigger').click();
  await page.getByRole('menuitem', { name: /Command palette/ }).click();
}

export async function waitForPageHydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return document.readyState === 'complete';
  });

  await page
    .waitForFunction(
      () => !document.querySelector('[data-testid="cloud-loading-screen"]'),
      { timeout: 10000 },
    )
    .catch(() => {
      // Ignore if loading overlay was never present or already gone.
    });
}

export async function waitForAbyssDev(page: Page, timeout = 10000): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const dev = (window as unknown as {
            abyssDev?: { makeAllCardsDue?: () => void; getState?: () => unknown };
          }).abyssDev;
          return typeof dev?.makeAllCardsDue === 'function' || typeof dev?.getState === 'function';
        }),
      {
        timeout,
        message: 'window.abyssDev was not initialized before test action',
      },
    )
    .toBe(true);
}

/**
 * Wait until the deck store reports at least one active card (after "Load Default Deck").
 * Ensures bundled graphs/topics have hydrated into the client before Discovery lists topics.
 */
export async function waitForDeckReady(page: Page, timeoutMs = 8000): Promise<void> {
  await page.waitForFunction(
    () => {
      const dev = (window as unknown as {
        abyssDev?: { getState?: () => { activeCards?: number } };
      }).abyssDev;
      const state = dev?.getState?.();
      return typeof state?.activeCards === 'number' && state.activeCards > 0;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

/**
 * Find the 3D canvas element on the page.
 */
export async function getCanvas(page: Page, timeoutMs = 8000): Promise<Locator | null> {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'attached', timeout: timeoutMs }).catch(() => null);

  const count = await canvas.count();

  if (count === 0) {
    return null;
  }

  return canvas;
}

/**
 * Wait until the main canvas is visible and has a non-zero layout box (for `page.mouse` clicks).
 */
export async function waitForCanvasClickBox(
  page: Page,
  timeoutMs = 15000,
): Promise<{
  canvas: Locator;
  box: { x: number; y: number; width: number; height: number };
}> {
  const canvas = await getCanvas(page, timeoutMs);
  expect(canvas).not.toBeNull();
  await expect(canvas!).toBeVisible({ timeout: timeoutMs });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const box = await canvas!.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      return { canvas: canvas!, box };
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Canvas bounding box did not become usable in time');
}

/**
 * Clear localStorage for fresh test state.
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
  });
}

/**
 * Capture console error messages for a given page context.
 */
export interface BrowserConsoleErrors {
  errors: string[];
  stop: () => void;
}

export function startConsoleErrorCapture(page: Page): BrowserConsoleErrors {
  const errors: string[] = [];
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };

  page.on('console', handler);

  return {
    errors,
    stop: () => {
      page.off('console', handler);
    },
  };
}

/**
 * Wait until the study panel is mounted and card content container is visible.
 */
export async function waitForStudyPanelReady(page: Page): Promise<void> {
  await page.locator('[data-testid="study-panel-modal-content"]').waitFor({ state: 'visible', timeout: 5000 });
  // Study tabs were removed from the modal; the active card mounts under `study-panel-card-root`
  // after loading finishes (brief `study-panel-loading` is possible).
  await page.locator('[data-testid="study-panel-card-root"]').waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * Assert that the browser exposes a usable WebGPU interface.
 */
export async function expectWebGPUAvailable(page: Page): Promise<void> {
  const hasNavigatorGpu = await page.evaluate(() => typeof navigator !== 'undefined' && 'gpu' in navigator);
  expect(hasNavigatorGpu).toBe(true);
}
