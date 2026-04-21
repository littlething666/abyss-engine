import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Installs an in-page probe that captures every `abyss-*` CustomEvent.
 *
 * Events captured:
 *   - abyss-card:reviewed
 *   - abyss-xp:gained
 *   - abyss-session:completed
 *   - abyss-crystal:leveled
 *   - abyss-crystal:trial-pregenerate
 *   - abyss-crystal:trial-completed
 *   - abyss-study-panel:history
 *
 * The probe monkey-patches `window.dispatchEvent` so events synthesized via
 * `AppEventBus.emit` are also captured even when listeners are attached on
 * sub-targets.
 */
export async function installProgressionEventProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    if (win.__progressionEventProbeInstalled === true) return;

    const eventTypes = [
      'abyss-card:reviewed',
      'abyss-xp:gained',
      'abyss-session:completed',
      'abyss-crystal:leveled',
      'abyss-crystal:trial-pregenerate',
      'abyss-crystal:trial-completed',
      'abyss-study-panel:history',
    ];

    const events: Array<{ type: string; detail: unknown; at: number }> = [];
    win.__progressionEvents = events;

    const recorded = new WeakSet<Event>();
    const collect = (ev: Event) => {
      if (recorded.has(ev)) return;
      recorded.add(ev);
      const ce = ev as CustomEvent;
      if (!ce || typeof ce.type !== 'string') return;
      const detail = ce.detail === undefined ? undefined : JSON.parse(JSON.stringify(ce.detail));
      events.push({ type: ce.type, detail, at: Date.now() });
    };

    for (const type of eventTypes) {
      window.addEventListener(type, collect);
      document.addEventListener(type, collect);
    }

    try {
      const original = window.dispatchEvent.bind(window);
      window.dispatchEvent = (ev: Event) => {
        if (ev && typeof (ev as Event).type === 'string' && (ev as Event).type.startsWith('abyss-')) {
          collect(ev);
        }
        return original(ev);
      };
    } catch {
      /* monkey-patch failed; addEventListener path still captures handlers */
    }

    win.__progressionEventProbeInstalled = true;
  });
}

export interface ProgressionEvent {
  type: string;
  detail: Record<string, unknown> | undefined;
  at: number;
}

export async function getProgressionEvents(page: Page): Promise<ProgressionEvent[]> {
  return page.evaluate(() => (window as unknown as { __progressionEvents?: ProgressionEvent[] }).__progressionEvents ?? []);
}

export async function getProgressionEventCount(page: Page): Promise<number> {
  return (await getProgressionEvents(page)).length;
}

export async function waitForProgressionEvent(
  page: Page,
  type: string,
  priorCount: number,
  timeout = 3000,
): Promise<ProgressionEvent> {
  await expect
    .poll(
      async () => {
        const all = await getProgressionEvents(page);
        return all.slice(priorCount).some((e) => e.type === type);
      },
      { timeout, message: `expected event "${type}" after index ${priorCount}` },
    )
    .toBeTruthy();
  const all = await getProgressionEvents(page);
  const match = all.slice(priorCount).find((e) => e.type === type);
  if (!match) throw new Error(`Event ${type} disappeared between poll and fetch`);
  return match;
}

export async function assertNoNewProgressionEvents(
  page: Page,
  priorCount: number,
  settleMs = 500,
): Promise<void> {
  await page.waitForTimeout(settleMs);
  const now = await getProgressionEventCount(page);
  expect(now).toBeLessThanOrEqual(priorCount);
}
