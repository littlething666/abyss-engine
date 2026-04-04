'use client';

import React, { useCallback, useMemo } from 'react';
import type { MiniGameContent, CategorySortContent, SequenceBuildContent } from '../../types/core';
import type { MiniGameResult } from '../../types/miniGame';
import { evaluateMiniGame } from '../../features/content/evaluateMiniGame';
import { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';
import { CategorySortGame } from './CategorySortGame';
import { SequenceBuildGame } from './SequenceBuildGame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import MathMarkdownRenderer from '../MathMarkdownRenderer';

interface MiniGameViewProps {
  content: MiniGameContent;
  onComplete: (isCorrect: boolean) => void;
  onContinue: () => void;
}

const GAME_TYPE_LABELS: Record<string, string> = {
  CATEGORY_SORT: 'Category Sort',
  SEQUENCE_BUILD: 'Sequence Build',
  CONNECTION_WEB: 'Connection Web',
};

function getItemIds(content: MiniGameContent): string[] {
  switch (content.gameType) {
    case 'CATEGORY_SORT':
      return content.items.map((item) => item.id);
    case 'SEQUENCE_BUILD':
      return content.items.map((item) => item.id);
    case 'CONNECTION_WEB':
      return content.pairs.map((pair) => pair.left);
  }
}

export function MiniGameView({ content, onComplete, onContinue }: MiniGameViewProps) {
  const itemIds = useMemo(() => getItemIds(content), [content]);

  const evaluateFn = useCallback(
    (placements: Map<string, string>): MiniGameResult => {
      return evaluateMiniGame(content, placements);
    },
    [content],
  );

  const interaction = useMiniGameInteraction({ itemIds, evaluateFn });

  const handleSubmit = useCallback(() => {
    interaction.submit();
  }, [interaction]);

  const handleContinue = useCallback(() => {
    if (interaction.result) {
      onComplete(interaction.result.isCorrect);
    }
    onContinue();
  }, [interaction.result, onComplete, onContinue]);

  const scorePercent = interaction.result
    ? Math.round(interaction.result.score * 100)
    : null;

  return (
    <div className="w-full" data-testid="mini-game-view">
      <div className="bg-card rounded-[15px] p-5 min-h-[150px] flex flex-col">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="secondary" data-testid="study-card-format-mini-game">
            🎮 {GAME_TYPE_LABELS[content.gameType] ?? 'Mini Game'}
          </Badge>
          {interaction.phase === 'submitted' && interaction.result && (
            <Badge variant={interaction.result.isCorrect ? 'default' : 'destructive'}>
              {scorePercent}% — {interaction.result.correctItems}/{interaction.result.totalItems}
            </Badge>
          )}
        </div>

        {/* Prompt */}
        <div className="mb-4" data-testid="mini-game-prompt">
          <MathMarkdownRenderer
            source={content.prompt}
            className="text-foreground text-lg markdown-body markdown-body--block"
          />
        </div>

        {/* Game renderer */}
        {content.gameType === 'CATEGORY_SORT' && (
          <CategorySortGame
            content={content as CategorySortContent}
            interaction={interaction}
          />
        )}

        {content.gameType === 'SEQUENCE_BUILD' && (
          <SequenceBuildGame
            content={content as SequenceBuildContent}
            interaction={interaction}
          />
        )}

        {/* Explanation (post-submit) */}
        {interaction.phase === 'submitted' && content.explanation && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="mb-2">
              <Badge variant="outline">💡 Explanation</Badge>
            </div>
            <MathMarkdownRenderer
              source={content.explanation}
              className="text-foreground text-sm italic markdown-body markdown-body--block"
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 text-center sticky bottom-0 z-10 bg-card pt-3">
        {interaction.phase === 'playing' && (
          <Button
            onClick={handleSubmit}
            disabled={!interaction.canSubmit}
            className={`w-full ${!interaction.canSubmit ? 'opacity-50' : ''}`}
            data-testid="mini-game-submit"
          >
            {interaction.isComplete
              ? 'Submit Answer'
              : `Place all items (${interaction.unplacedItemIds.length} remaining)`}
          </Button>
        )}

        {interaction.phase === 'submitted' && (
          <Button
            onClick={handleContinue}
            className="w-full"
            data-testid="mini-game-continue"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
