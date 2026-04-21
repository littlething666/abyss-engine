import { expect, type Locator, type Page } from '@playwright/test';

/** Tap an item chip by its item id (data-testid="mg-item-<id>"). */
export function miniGameItemChip(page: Page, itemId: string): Locator {
  return page.getByTestId(`mg-item-${itemId}`);
}

/** Click a category zone by id (CategorySortGame). */
export function categoryZone(page: Page, categoryId: string): Locator {
  return page.getByTestId(`category-zone-${categoryId}`);
}

/** Click a sequence slot by index (SequenceBuildGame). */
export function sequenceSlot(page: Page, index: number): Locator {
  return page.getByTestId(`sequence-slot-${index}`);
}

/**
 * Tap-to-select then tap-to-place flow (category-sort + sequence-build +
 * connection-web). Waits for the item chip to become attached before clicking.
 */
export async function placeMiniGameItem(
  page: Page,
  itemId: string,
  target: Locator,
): Promise<void> {
  const chip = miniGameItemChip(page, itemId);
  await expect(chip).toBeVisible();
  await chip.click();
  await target.click();
}

/** Read the mini-game interaction snapshot exposed by abyssDev. */
export async function getMiniGameState(page: Page): Promise<{
  phase: 'idle' | 'playing' | 'submitted';
  placements: Array<[string, string]>;
  selectedItemId: string | null;
} | null> {
  return page.evaluate(() => {
    const dev = (window as unknown as {
      abyssDev?: { getMiniGameState?: () => unknown };
    }).abyssDev;
    return (dev?.getMiniGameState?.() as ReturnType<NonNullable<typeof getMiniGameState>> | null) ?? null;
  });
}
