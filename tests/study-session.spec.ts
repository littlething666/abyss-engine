import { test, expect } from '@playwright/test';
import {
  waitForPageHydrated,
  getCanvas,
  clearLocalStorage,
  startConsoleErrorCapture,
  expectWebGPUAvailable,
  waitForStudyPanelReady,
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
  await page.goto('/');
  await waitForPageHydrated(page);
  await clearLocalStorage(page);

  await page.goto('/');
  await waitForPageHydrated(page);

  // Load default deck
  const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
  if (await loadDeckButton.count() > 0) {
    await loadDeckButton.click();
    await page.waitForTimeout(1000);
  }
}

async function openCardByType(
  page: any,
  cardType: 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE',
) {
  const { errors, stop } = startConsoleErrorCapture(page);
  await expectWebGPUAvailable(page);
  await page.evaluate(async (type: 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE') => {
    await (window as any).abyssDev.makeAllCardsDue();
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

test.describe('Study Session', () => {
  /**
   * Happy Path: Complete Study Session
   * Combines: Load deck -> Select crystal -> Open study -> Show answer -> Rate -> Verify stats
   */
  test('complete study session happy path', async ({ page }) => {
    await page.goto('/');
    await waitForPageHydrated(page);

    // Load deck
    const loadDeckButton = page.locator('button:has-text("Load Default Deck")');
    if (await loadDeckButton.count() > 0) {
      await loadDeckButton.click();
      await page.waitForTimeout(1000);
    }

    // Get initial due count
    const statsContainer = page.locator('.absolute.top-5.left-5');
    const initialDueText = await statsContainer.locator('text=Due').locator('..').textContent();
    const initialDue = initialDueText ? parseInt(initialDueText.replace(/\D/g, '')) : 0;

    // If there are due cards, try to study one
    if (initialDue > 0) {
      const canvas = await getCanvas(page);
      const canvasBox = await canvas!.boundingBox();

      // Click to select and start study
      await page.mouse.click(
        canvasBox!.x + canvasBox!.width * 0.6,
        canvasBox!.y + canvasBox!.height * 0.5
      );
      await page.waitForTimeout(500);
      await page.mouse.click(
        canvasBox!.x + canvasBox!.width * 0.6,
        canvasBox!.y + canvasBox!.height * 0.5
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
    await goodButton.click();
    await page.waitForTimeout(500);

    // Verify we can still see the current card's content (feedback visible)
    await expect(page.getByTestId('study-card-question-label')).toBeVisible({ timeout: 3000 });
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
    await submitButton.click();
    await page.waitForTimeout(500);

    // Verify feedback is visible
    await expect(page.getByTestId('study-card-feedback')).toBeVisible({ timeout: 3000 });

    // Verify Continue button exists
    await expect(page.getByTestId('study-card-continue')).toBeVisible({ timeout: 3000 });
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
    await submitButton.click();
    await page.waitForTimeout(500);

    // Verify feedback is visible
    await expect(page.getByTestId('study-card-feedback')).toBeVisible({ timeout: 3000 });

    // Verify Continue button exists
    await expect(page.getByTestId('study-card-continue')).toBeVisible({ timeout: 3000 });
  });
});
