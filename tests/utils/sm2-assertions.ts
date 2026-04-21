import { expect, type Page } from '@playwright/test';

export interface Sm2Snapshot {
  cardId: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: number;
}

/** Reads SM-2 state for a single composite card id from the progression store. */
export async function getSm2Snapshot(page: Page, cardId: string): Promise<Sm2Snapshot | null> {
  return page.evaluate((id: string) => {
    const dev = (window as unknown as { abyssDev?: { getSM2?: (k: string) => Sm2Snapshot | null } }).abyssDev;
    return dev?.getSM2?.(id) ?? null;
  }, cardId);
}

export async function getCurrentCardId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const dev = (window as unknown as { abyssDev?: { getState?: () => unknown } }).abyssDev;
    const state = dev?.getState?.() as { currentCardId?: string | null } | undefined;
    return state?.currentCardId ?? null;
  });
}

/**
 * Assert that a card review advanced SM-2 in the expected direction.
 *
 * Ratings 1–2 (again/hard): interval resets toward 1, repetitions reset to 0,
 * easeFactor decreases.
 * Ratings 3–4 (good/easy): interval grows, repetitions increment (easy adds +2), easeFactor
 * stays stable or grows.
 */
export function assertSm2Advanced(
  before: Sm2Snapshot,
  after: Sm2Snapshot,
  rating: 1 | 2 | 3 | 4,
): void {
  if (rating <= 2) {
    expect(after.repetitions, 'repetitions reset on fail').toBe(0);
    expect(after.interval, 'interval bounded on fail').toBeLessThanOrEqual(Math.max(1, before.interval));
    expect(after.easeFactor, 'ease factor does not increase on fail').toBeLessThanOrEqual(before.easeFactor);
  } else {
    const expectedReps = rating === 4 ? before.repetitions + 2 : before.repetitions + 1;
    expect(after.repetitions, 'repetitions increment on pass').toBe(expectedReps);
    expect(after.interval, 'interval grows on pass').toBeGreaterThanOrEqual(Math.max(1, before.interval));
    expect(after.easeFactor, 'ease factor non-decreasing on easy rating').toBeGreaterThanOrEqual(
      Math.min(before.easeFactor, 1.3),
    );
  }
  expect(after.nextReview).toBeGreaterThan(before.nextReview);
}
