import React from 'react';

import { Button } from '@/components/ui/button';

interface StudyPanelStateViewsProps {
  isEmptyDeck: boolean;
  isLoadingCards: boolean;
  isCardsLoadError: boolean;
  hasActiveCard: boolean;
  isCompleted: boolean;
  onClose: () => void;
}

/**
 * Renders the small set of non-card states the study panel can be in:
 * empty deck, loading, error, no-active-card, and completed. Theory and
 * system-prompt branches were removed when the in-modal tabs were dropped.
 */
export function StudyPanelStateViews({
  isEmptyDeck,
  isLoadingCards,
  isCardsLoadError,
  hasActiveCard,
  isCompleted,
  onClose,
}: StudyPanelStateViewsProps) {
  return (
    <div className="min-h-0 pr-1" data-testid="study-panel-state">
      {isEmptyDeck && (
        <div className="text-center py-8 px-5">
          <p className="text-muted-foreground mb-4" data-testid="study-panel-empty-state">
            No cards are currently available for this topic.
          </p>
        </div>
      )}

      {isLoadingCards && (
        <div className="text-center py-8 px-5 text-muted-foreground" data-testid="study-panel-loading">
          Loading cards for this topic...
        </div>
      )}

      {isCardsLoadError && (
        <div className="text-center py-8 px-5 text-destructive" data-testid="study-panel-error">
          Unable to load cards for this topic. Open a topic and try again.
        </div>
      )}

      {!isLoadingCards && !isCardsLoadError && !hasActiveCard && !isEmptyDeck && !isCompleted && (
        <div className="text-center py-8 px-5 text-muted-foreground">
          <p className="mb-4" data-testid="study-panel-no-card">
            No current card is available for this study session.
          </p>
          <Button onClick={onClose} className="w-full" data-testid="study-panel-return-to-grid">
            Return to Grid
          </Button>
        </div>
      )}

      {isCompleted && (
        <div className="text-center py-6 px-5">
          <h3 className="text-primary text-xl mb-2">🎉 All Done!</h3>
          <p className="text-muted-foreground mb-2">You&apos;ve reviewed all cards due today.</p>
          <p className="text-muted-foreground mb-4">Return to the grid to see your crystals grow!</p>
          <div className="sticky bottom-0 z-10 bg-card py-3">
            <Button onClick={onClose} className="w-full" data-testid="study-panel-all-done-cta">
              Back to Grid
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
