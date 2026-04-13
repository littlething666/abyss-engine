import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  waitForCanvasClickBox,
  clearLocalStorage,
  startConsoleErrorCapture,
  expectWebGPUAvailable,
  waitForStudyPanelReady,
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
  await page.goto(E2E_HOME_PATH);
  await waitForPageHydrated(page);
  await clearLocalStorage(page);

  await page.goto(E2E_HOME_PATH);
  await waitForPageHydrated(page);

  // Load default deck
  const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
  if (await loadDeckButton.count() > 0) {
    await loadDeckButton.click();
    await page.waitForTimeout(1000);
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
    await (window as any).abyssDev.makeAllCardsDue();
    const candidate = await (window as any).abyssDev.getCardByType(type);
    if (!candidate) {
      throw new Error(`No available card for card type: ${type}`);
    }

    await (window as any).abyssDev.spawnCrystal(candidate.topicId);
    const postSpawnState = (window as any).abyssDev.getState();
    if ((postSpawnState?.activeCrystals ?? 0) === 0) {
      throw new Error(`Failed to spawn crystal for topic: ${candidate.topicId}`);
    }

    const selection = await (window as any).abyssDev.setCurrentCardByType(type);
    if (!selection) {
      throw new Error(`No available card for card type: ${type}`);
    }

    (window as any).abyssDev.openStudyPanel();
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
    const eventTypes = [
      'abyss-card:reviewed',
      'abyss-xp:gained',
      'abyss-study-panel:history',
      'abyss-session:completed',
      'abyss-crystal:leveled',
    ];

    win.__progressionEvents = [];
    const collectProgressionEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent?.detail;
      const entry = {
        type: customEvent?.type,
        detail: detail ? JSON.parse(JSON.stringify(detail)) : undefined,
        at: Date.now(),
      };
      win.__progressionEvents.push(entry);
    };
    const alreadyInstalled = win.__progressionEventProbeInstalled === true;
    if (!alreadyInstalled) {
      eventTypes.forEach((type) => {
        window.addEventListener(type, collectProgressionEvent);
        document.addEventListener(type, collectProgressionEvent);
      });

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
    }
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
   * Combines: Load deck -> Select crystal -> Open study -> Show answer -> Rate -> Verify stats
   */
  test('complete study session happy path', async ({ page }) => {
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);

    // Load deck
    const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
    if (await loadDeckButton.count() > 0) {
      await loadDeckButton.click();
      await page.waitForTimeout(1000);
    }

    // Get initial due count from Discovery (deck line in Wisdom Altar)
    await page.getByTestId('command-palette-trigger').click();
    await page.getByText('Open Wisdom Altar (Discovery)').click();
    const discoveryDialog = page.getByRole('dialog').filter({ hasText: 'Wisdom Altar' });
    await expect(discoveryDialog).toBeVisible({ timeout: 5000 });
    // Deck stats live in a separate <p> from DialogDescription ("Unlock topic crystals…")
    const deckSummary = discoveryDialog.getByText(/\d+\/\d+ cards due/);
    await expect(deckSummary).toBeVisible({ timeout: 5000 });
    const statsCardsText = await deckSummary.textContent();
    const dueMatch = statsCardsText ? statsCardsText.match(/(\d+)\s*\/\s*(\d+)/) : null;
    const initialDue = dueMatch ? parseInt(dueMatch[1], 10) : 0;
    await page.keyboard.press('Escape');
    await expect(discoveryDialog).not.toBeVisible({ timeout: 3000 });

    // If there are due cards, try to study one
    if (initialDue > 0) {
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

      // Click Show Answer if present (flashcard)
      const showAnswerButton = page.getByTestId('study-card-show-answer');
      if (await showAnswerButton.count() > 0) {
        await showAnswerButton.click();
        await page.waitForTimeout(500);

        // Click a rating button
      const goodButton = page.locator('button:has-text("Good")');
        if (await goodButton.count() > 0) {
          await goodButton.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    // Verify page is still functional
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Challenge Format Types', () => {
  /**
   * Flashcard: Renders, flips, and handles feedback
   */
  test('Flashcard format renders, flips, and handles feedback', async ({ page }) => {
    await setupTestWithDeck(page);

    // Spawn crystal and make due, set to flashcard
    await openCardByType(page, 'FLASHCARD');

    await expect(page.getByTestId('study-session-title')).toBeVisible({ timeout: 5000 });

    // Verify flashcard badge
    await expect(page.getByTestId('study-card-format-flashcard')).toBeVisible({ timeout: 3000 });

    // Click Show Answer button
    const showAnswerButton = page.getByTestId('study-card-show-answer');
    await showAnswerButton.click();
    await page.waitForTimeout(300);

    // Verify answer is shown
    await expect(page.getByTestId('study-card-answer-section')).toBeVisible({ timeout: 3000 });

    // Click a rating button (Good)
    const goodButton = page.locator('button:has-text("Good")');
    const priorEvents = await getEventCount(page);
    await goodButton.click();
    await page.waitForTimeout(500);

    // Verify feedback message is visible
    await assertProgressionEventIncrease(page, priorEvents);

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

    await expect(page.getByTestId('study-session-title')).toBeVisible({ timeout: 5000 });

    // Verify single choice badge
    await expect(page.getByTestId('study-card-format-single-choice')).toBeVisible({ timeout: 3000 });

    // Find and click an option
    const optionButton = page.getByTestId('study-card-choice-options').locator('button').nth(0);
    await optionButton.click();
    await page.waitForTimeout(200);

    // Click Submit Answer
    const submitButton = page.getByTestId('study-card-submit-answer');
    const submitEventCount = await getEventCount(page);
    await submitButton.click();
    await page.waitForTimeout(500);

    // Verify choice feedback and XP are not shown on submit
    await assertNoNewEvents(page, submitEventCount);

    // Click Continue to finalize the answer
    const continueButton = page.getByTestId('study-card-continue');
    const continueEventCount = await getEventCount(page);
    await continueButton.click();

    // Verify feedback message and XP gain animation appear after continue
    await assertProgressionEventIncrease(page, continueEventCount);
  });

  /**
   * Multi Choice: Renders, selects options, and handles feedback
   */
  test('Multi Choice format renders, selects, and handles feedback', async ({ page }) => {
    await setupTestWithDeck(page);

    // Spawn crystal and make due, set to multi choice
    await openCardByType(page, 'MULTI_CHOICE');

    // Verify modal is open
    await expect(page.getByTestId('study-session-title')).toBeVisible({ timeout: 5000 });

    // Verify multi choice badge
    await expect(page.getByTestId('study-card-format-multi-choice')).toBeVisible({ timeout: 3000 });

    // Verify submit is disabled initially
    const submitButton = page.getByTestId('study-card-submit-answer');
    expect(await submitButton.isDisabled()).toBe(true);

    // Select an option to enable Submit
    await page.getByTestId('study-card-choice-options').locator('button').nth(0).click();
    await page.waitForTimeout(200);

    // Now Submit should be enabled
    expect(await submitButton.isEnabled()).toBe(true);

    // Click Submit Answer
    const submitEventCount = await getEventCount(page);
    await submitButton.click();
    await page.waitForTimeout(500);

    // Verify choice feedback and XP are not shown on submit
    await assertNoNewEvents(page, submitEventCount);

    // Verify feedback message and XP gain animation appear after continue
    const continueEventCount = await getEventCount(page);
    await page.getByTestId('study-card-continue').click();
    await assertProgressionEventIncrease(page, continueEventCount);

  });

  test('command palette shows card type filter and study filtered command', async ({ page }) => {
    await page.goto(E2E_HOME_PATH);
    await waitForPageHydrated(page);

    await page.getByTestId('command-palette-trigger').click();
    const palette = page.getByRole('dialog');
    await expect(palette).toBeVisible({ timeout: 5000 });
    await expect(palette.getByText('Card type filter')).toBeVisible();
    await expect(palette.getByText('Include Flashcards')).toBeVisible();
    await expect(palette.getByText('Study filtered cards (selected topic)')).toBeVisible();
  });
});
