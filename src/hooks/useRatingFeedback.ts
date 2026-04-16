import { useCallback, useRef } from 'react';

import type { FeedbackTier } from '../features/studyPanel/feedbackFx';
import type { RatingFeedbackCanvasHandle } from '../components/studyPanel/RatingFeedbackCanvas';

const TIER_CSS_CLASS: Record<FeedbackTier, string> = {
  1: 'rating-fx-shudder',
  2: 'rating-fx-ember-pulse',
  3: 'rating-fx-shimmer',
  4: 'rating-fx-golden-vignette',
};

const CSS_DURATION_MS: Record<FeedbackTier, number> = {
  1: 350,
  2: 500,
  3: 900,
  4: 700,
};

/**
 * Maps a flashcard rating (1–4) directly to a feedback tier.
 */
export function ratingToTier(rating: 1 | 2 | 3 | 4): FeedbackTier {
  return rating as FeedbackTier;
}

/**
 * Maps choice question correctness to a feedback tier.
 */
export function choiceResultToTier(isCorrect: boolean): FeedbackTier {
  return isCorrect ? 3 : 1;
}

export interface UseRatingFeedbackOptions {
  canvasRef: React.RefObject<RatingFeedbackCanvasHandle | null>;
  cardRef: React.RefObject<HTMLElement | null>;
}

/**
 * Hook that triggers canvas particle effects and CSS companion animations
 * on the study card when a rating is submitted.
 */
export function useRatingFeedback({ canvasRef, cardRef }: UseRatingFeedbackOptions) {
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFeedback = useCallback(
    (tier: FeedbackTier) => {
      const card = cardRef.current;
      const canvas = canvasRef.current;
      if (!card) return;

      // Canvas particle effect
      if (canvas) {
        const rect = card.getBoundingClientRect();
        canvas.trigger(tier, rect);
      }

      // CSS companion class
      const cssClass = TIER_CSS_CLASS[tier];
      if (activeTimerRef.current !== null) {
        clearTimeout(activeTimerRef.current);
      }
      // Remove any previous classes
      for (const cls of Object.values(TIER_CSS_CLASS)) {
        card.classList.remove(cls);
      }
      // Force reflow so re-adding the same class re-triggers the animation
      void card.offsetWidth;
      card.classList.add(cssClass);

      activeTimerRef.current = setTimeout(() => {
        card.classList.remove(cssClass);
        activeTimerRef.current = null;
      }, CSS_DURATION_MS[tier]);
    },
    [canvasRef, cardRef],
  );

  const triggerForRating = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      triggerFeedback(ratingToTier(rating));
    },
    [triggerFeedback],
  );

  const triggerForChoice = useCallback(
    (isCorrect: boolean) => {
      triggerFeedback(choiceResultToTier(isCorrect));
    },
    [triggerFeedback],
  );

  return { triggerFeedback, triggerForRating, triggerForChoice };
}
