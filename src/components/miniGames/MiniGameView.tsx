'use client';

import React, { useCallback, useMemo } from 'react';
import type {
  MiniGameContent,
  CategorySortContent,
  SequenceBuildContent,
  ConnectionWebContent,
} from '../../types/core';
import type { MiniGameResult } from '../../types/miniGame';
import { evaluateMiniGame } from '../../features/content/evaluateMiniGame';
import { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';
import { CategorySortGame } from './CategorySortGame';
import { SequenceBuildGame } from './SequenceBuildGame';
import { ConnectionWebGame } from './ConnectionWebGame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import MathMarkdownRenderer from '../MathMarkdownRenderer';

interface MiniGameViewProps {
  content: MiniGameContent;
  isRevealed: boolean;
  onSubmit: (isCorrect: boolean) => void;
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
    case 'CONNECTION_WEB': {
      const leftDistractorIds = (content.distractors ?? [])
        .filter((d) => d.side === 'left')
        .map((d) => d.id);
      return [...content.pairs.map((pair) => pair.id), ...leftDistractorIds];
    }
  }
}

function getRequiredItemIds(content: MiniGameContent): string[] | undefined {
  if (content.gameType === 'CONNECTION_WEB') {
    return content.pairs.map((pair) => pair.id);
  }
  return undefined;
}

/**
 * Single-line submit nudge per game type.
 *
 * Match Pairs has no remaining concept (every row will be a placement once
 * Phase 2 lands; even pre-Phase-2 the player can submit at any time and the
 * hint stays neutral). Category Sort and Sequence Build report how many items
 * still need placing while keeping Submit enabled.
 */
function buildSubmitHint(
  gameType: MiniGameContent['gameType'],
  isComplete: boolean,
  remaining: number,
): string {
  if (gameType === 'CONNECTION_WEB') {
    return 'Submit Answer';
  }
  if (isComplete) {
    return 'Submit Answer';
  }
  return `Submit (${remaining} remaining)`;
}

export function MiniGameView({ content, isRevealed, onSubmit, onContinue }: MiniGameViewProps) {
  const itemIds = useMemo(() => getItemIds(content), [content]);
  const requiredItemIds = useMemo(() => getRequiredItemIds(content), [content]);

  const evaluateFn = useCallback(
    (placements: Map<string, string>): MiniGameResult => {
      return evaluateMiniGame(content, placements);
    },
    [content],
  );

  const interaction = useMiniGameInteraction({ itemIds, requiredItemIds, evaluateFn });

  const handleSubmit = useCallback(() => {
    const result = interaction.submit();
    if (result) {
      onSubmit(result.isCorrect);
    }
  }, [interaction, onSubmit]);

  const handleContinue = useCallback(() => {
    onContinue();
  }, [onContinue]);

  const scorePercent = interaction.result
    ? Math.round(interaction.result.score * 100)
    : null;

  const submitHint = buildSubmitHint(
    content.gameType,
    interaction.isComplete,
    interaction.unplacedItemIds.length,
  );

  return (
    <div className="w-full" data-testid="mini-game-view">
      <div className="bg-card rounded-[15px] p-5 min-h-[150px] flex flex-col">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="secondary" data-testid="study-card-format-mini-game">
            🎮 {GAME_TYPE_LABELS[content.gameType] ?? 'Mini Game'}
          </Badge>
          {interaction.phase === 'submitted' && isRevealed && interaction.result && (
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

        {content.gameType === 'CONNECTION_WEB' && (
          <ConnectionWebGame
            content={content as ConnectionWebContent}
            interaction={interaction}
          />
        )}

        {/* Explanation (post-submit) */}
        {interaction.phase === 'submitted' && isRevealed && content.explanation && (
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
            className="w-full"
            data-testid="mini-game-submit"
          >
            {submitHint}
          </Button>
        )}

        {interaction.phase === 'submitted' && isRevealed && (
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
