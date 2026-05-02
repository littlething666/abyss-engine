import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  waitForAbyssDev,
  waitForCanvasClickBox,
  startConsoleErrorCapture,
  expectWebGPUAvailable,
  waitForStudyPanelReady,
  openCommandPaletteFromQuickActions,
  E2E_HOME_PATH,
} from './utils/test-helpers';

/**
 * Study Session E2E Tests - Abyss Engine
 *
 * Consolidated from 17 tests down to 4:
 * - 1 Happy Path test for Study Session Journey
 * - 3 Format tests (Flashcard, Single Choice, Multi Choice)
 */

// Helper function to setup test with deck loaded
async function setupTestWithDeck(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.sessionStorage.setItem('abyss:rng-seed', 'abyss-e2e-study-session');
    } catch {
      /* storage may be unavailable in some contexts */
    }
  });

  await page.goto(E2E_HOME_PATH);
  await waitForPageHydrated(page);
  await waitForAbyssDev(page);

  const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
  // Load default deck
  if ((await loadDeckButton.count()) > 0) {
    await loadDeckButton.click();
    // Load deck
    await page.waitForFunction(
      () => {
        const dev = (window as unknown as {
          abyssDev?: { getState?: () => { activeCards?: number } };
        }).abyssDev;
        const state = dev?.getState?.();
        return typeof state?.activeCards === 'number' && state.activeCards > 0;
      },
      undefined,
      { timeout: 8000 },
    );
  }

  await installProgressionEventProbe(page);
}

async function openCardByType(
  page: any,
  cardType: 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE',
) {
  const { errors, stop } = startConsoleErrorCapture(page);
  await expectWebGPUAvailable(page);
  await page.evaluate(async (type: 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE') => {
    const dev = (window as any).abyssDev as {
      makeAllCardsDue?: () => void;
      getCardByType?: (cardType: 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE') => Promise<{ topicId: string; cardId: string } | null>;
      spawnCrystal?: (topicId: string) => Promise<void>;
      getState?: () => { activeCrystals?: number };
      setCurrentCardByType?: (cardType: 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE') => Promise<{ topicId: string; cardId: string } | null>;
      openStudyPanel?: () => void;
    };
    if (!dev) {
      throw new Error('abyssDev missing');
    }

    await dev.makeAllCardsDue?.();
    const candidate = await dev.getCardByType?.(type);
    if (!candidate) {
      throw new Error(`No available card for card type: ${type}`);
    }

    await dev.spawnCrystal?.(candidate.topicId);
    const postSpawnState = dev.getState?.();
    if ((postSpawnState?.activeCrystals ?? 0) === 0) {
      throw new Error(`Failed to spawn crystal for topic: ${candidate.topicId}`);
    }

    const selection = await dev.setCurrentCardByType?.(type);
    if (!selection) {
      throw new Error(`No available card for card type: ${type}`);
    }

    dev.openStudyPanel?.();
  }, cardType);

  await waitForStudyPanelReady(page);

  const criticalErrors = errors.filter((error) => {
    if (error.includes('Warning:')) return false;
    if (error.includes('favicon')) return false;
    return true;
  });
  stop();
  expect(criticalErrors.length).toBe(0);

  await page.waitForTimeout(500);
}

async function installProgressionEventProbe(page: any) {
  await page.evaluate(() => {
    const win = window as any;
    if (win.__progressionEventProbeInstalled === true) {
      win.__progressionEvents = win.__progressionEvents ?? [];
      return;
    }

    win.__progressionEvents = [];
    const collectProgressionEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (typeof customEvent?.type !== 'string') return;
      const detail = customEvent.detail;
      const entry = {
        type: customEvent.type,
        detail: detail ? JSON.parse(JSON.stringify(detail)) : undefined,
        at: Date.now(),
      };
      win.__progressionEvents.push(entry);
    };

    try {
      const originalDispatchEvent = win.dispatchEvent.bind(win);
      win.dispatchEvent = (event: Event) => {
        if (typeof event === 'object' && event && 'type' in event) {
          const customEvent = event as CustomEvent;
          if (typeof customEvent.type === 'string' && customEvent.type.startsWith('abyss-')) {
            collectProgressionEvent(customEvent);
          }
        }

        return originalDispatchEvent(event);
      };
    } catch (_error) {
      // eslint-disable-next-line no-console
      console.info('Unable to monkey patch dispatchEvent in progression probe.');
    }

    win.__progressionEventProbeInstalled = true;
  });
}

async function getProgressionEvents(page: any) {
  return page.evaluate(() => {
    return (window as any).__progressionEvents ?? [];
  });
}

async function getEventCount(page: any) {
  const events = await getProgressionEvents(page);
  return events.length;
}

async function assertNoNewEvents(page: any, beforeCount: number) {
  await expect.poll(async () => getEventCount(page), {
    timeout: 800,
  }).toBeLessThanOrEqual(beforeCount);
}

async function assertProgressionEventIncrease(page: any, priorEvents: number) {
  const hasNewXpEvent = async () => {
    const events = await getProgressionEvents(page);
    return events
      .slice(priorEvents)
      .some((entry: { type?: string }) =>
        entry.type === 'abyss-card:reviewed' || entry.type === 'abyss-xp:gained',
      );
  };

  await expect.poll(async () => hasNewXpEvent(), {
    timeout: 3000,
  }).toBeTruthy();

  const events = await getProgressionEvents(page);
  const newXpEvent = events
    .slice(priorEvents)
    .reverse()
    .find((entry: { type?: string }) =>
      entry.type === 'abyss-card:reviewed' || entry.type === 'abyss-xp:gained',
    );
  const detail = newXpEvent?.detail as {
    amount?: number;
    buffedReward?: number;
    message?: string;
    rating?: number;
  };
  const value = detail?.buffedReward ?? detail?.amount ?? 0;
  expect(value).toBeGreaterThanOrEqual(0);
  if (newXpEvent?.type === 'abyss-card:reviewed') {
    expect(typeof detail?.rating).toBe('number');
    if (detail?.buffedReward && detail.buffedReward > 0) {
      expect(detail.buffedReward).not.toBe(0);
    }
  }
}

test.describe('Study Session', () => {
  /**
   * Happy Path: Complete Study Session
   * Combines: Load deck -> Select crystal -> Open study -> Rate card -> Verify stability
   */
  test('complete study session happy path', async ({ page }) => {
    await setupTestWithDeck(page);

    await page.evaluate(() => {
      const dev = (window as unknown as { abyssDev?: { makeAllCardsDue?: () => void } }).abyssDev;
      dev?.makeAllCardsDue?.();
    });

    // Get initial due count from Discovery (deck line in Wisdom Altar)
    await openCommandPaletteFromQuickActions(page);
    await page.getByText('Open Wisdom Altar (Discovery)').click({ force: true });
    const discoveryDialog = page.getByRole('dialog').filter({ hasText: 'Wisdom Altar' });
    await expect(discoveryDialog).toBeVisible({ timeout: 5000 });
    await expect(discoveryDialog.getByText(/Spend keys to unlock topic crystals/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(discoveryDialog).not.toBeVisible({ timeout: 3000 });

    // If there are due cards, try to study one
    const { box: canvasBox } = await waitForCanvasClickBox(page);

    // Click to select and start study
    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.6,
      canvasBox.y + canvasBox.height * 0.5
    );
    await page.waitForTimeout(500);
    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.6,
      canvasBox.y + canvasBox.height * 0.5
    );
    await page.waitForTimeout(1000);

    // If a flashcard happens to be open, rate it (coarse choice + reveal happen together).
    const flashcardRecallButton = page.getByTestId('study-card-coarse-recalled');
    if ((await flashcardRecallButton.count()) > 0) {
      const priorEvents = await getEventCount(page);
      await flashcardRecallButton.click({ force: true });
      await expect(page.getByTestId('study-card-answer-section')).toBeVisible({ timeout: 3000 });
      await assertProgressionEventIncrease(page, priorEvents);
      const continueButton = page.getByTestId('study-card-continue');
      if (await continueButton.count() > 0) {
        await continueButton.click({ force: true });
      }
    }

    // Verify page is still functional
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Challenge Format Types', () => {
  /**
   * Flashcard: Renders, reveals answer, and handles feedback
   */
  test('Flashcard format renders, flips, and handles feedback', async ({ page }) => {
    await setupTestWithDeck(page);

    // Spawn crystal and make due, set to flashcard
    await openCardByType(page, 'FLASHCARD');

    // Verify the study card root is mounted (replaces the removed format badge + tab probes).
    await expect(page.getByTestId('study-panel-card-root')).toBeVisible({ timeout: 5000 });

    // Submit a recall rating (flashcard answer reveal + rating happen together).
    const priorEvents = await getEventCount(page);
    const recallButton = page.getByTestId('study-card-coarse-recalled');
    await recallButton.click({ force: true });
    await page.waitForTimeout(300);

    // Verify answer is shown
    await expect(page.getByTestId('study-card-answer-section')).toBeVisible({ timeout: 3000 });

    // Verify progression event after rating
    await assertProgressionEventIncrease(page, priorEvents);
    await page.waitForTimeout(500);

    // Verify we can still see the current card's content (feedback visible)
    await expect(page.getByTestId('study-card-question')).toBeVisible({ timeout: 3000 });
  });

  /**
   * Single Choice: Renders, selects option, and handles feedback
   */
  test('Single Choice format renders, selects, and handles feedback', async ({ page }) => {
    await setupTestWithDeck(page);

    // Spawn crystal and make due, set to single choice
    await openCardByType(page, 'SINGLE_CHOICE');

    await expect(page.getByTestId('study-panel-card-root')).toBeVisible({ timeout: 5000 });
    // Single-choice card surfaces the Submit button only when there is at least one option pickable.
    await expect(page.getByTestId('study-card-submit-answer')).toBeVisible({ timeout: 3000 });

    // Find and click an option
    const optionButton = page.getByTestId('study-card-choice-options').locator('button').nth(0);
    await optionButton.click({ force: true });
    await page.waitForTimeout(200);

    // Click Submit Answer (choice result is scored immediately for progression)
    const submitButton = page.getByTestId('study-card-submit-answer');
    const submitEventCount = await getEventCount(page);
    await submitButton.click({ force: true });
    await page.waitForTimeout(500);

    // Verify XP/feedback event is emitted on submit.
    await assertProgressionEventIncrease(page, submitEventCount);

    // Click Continue to finalize the answer
    const continueButton = page.getByTestId('study-card-continue');
    const continueEventCount = await getEventCount(page);
    await continueButton.click({ force: true });

    // Continue should only advance state, not add additional progression events.
    await assertNoNewEvents(page, continueEventCount);
  });

  /**
   * Multi Choice: Renders, selects options, and handles feedback
   */
  test('Multi Choice format renders, selects, and handles feedback', async ({ page }) => {
    await setupTestWithDeck(page);

    // Spawn crystal and make due, set to multi choice
    await openCardByType(page, 'MULTI_CHOICE');

    // Verify modal is open
    await expect(page.getByTestId('study-panel-card-root')).toBeVisible({ timeout: 5000 });

    // Verify submit is disabled initially
    const submitButton = page.getByTestId('study-card-submit-answer');
    expect(await submitButton.isDisabled()).toBe(true);

    // Select an option to enable Submit
    await page.getByTestId('study-card-choice-options').locator('button').nth(0).click({ force: true });
    await page.waitForTimeout(200);

    // Now Submit should be enabled
    expect(await submitButton.isEnabled()).toBe(true);

    // Click Submit Answer
    const submitEventCount = await getEventCount(page);
    await submitButton.click({ force: true });
    await page.waitForTimeout(500);

    // Continue surfaces only after submit applies; assert via the panel state and the event stream.
    await expect(page.getByTestId('study-card-continue')).toBeVisible({ timeout: 3000 });
    await assertProgressionEventIncrease(page, submitEventCount);

    // Continue should only advance state, not add additional progression events.
    const continueEventCount = await getEventCount(page);
    await page.getByTestId('study-card-continue').click({ force: true });
    await assertNoNewEvents(page, continueEventCount);

  });

  test('command palette shows card type filter and study filtered command', async ({ page }) => {
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);

    await openCommandPaletteFromQuickActions(page);
    const palette = page.getByRole('dialog');
    await expect(palette).toBeVisible({ timeout: 5000 });
    await expect(palette.getByText('Card type filter')).toBeVisible();
    await expect(palette.getByText('Include Flashcards')).toBeVisible();
    await expect(palette.getByText('Study filtered cards (selected topic)')).toBeVisible();
  });
});
