'use client';

import React from 'react';
import { LayoutGroup, motion } from 'motion/react';
import type { CategorySortContent } from '../../types/core';
import type { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';
import { MiniGameItemChip } from './shared/MiniGameItemChip';
import { getMiniGameItemVisualState } from './shared/miniGameVisualState';

interface CategorySortGameProps {
  content: CategorySortContent;
  interaction: ReturnType<typeof useMiniGameInteraction>;
}

export function CategorySortGame({ content, interaction }: CategorySortGameProps) {
  const {
    selectedItemId,
    placements,
    phase,
    correctItemIds,
    incorrectItemIds,
    selectItem,
    placeItem,
    removeItem,
    unplacedItemIds,
  } = interaction;

  const isPlaying = phase === 'playing';
  const itemsById = new Map(content.items.map((item) => [item.id, item]));

  const cols = content.categories.length <= 2 ? content.categories.length : 2;
  const gridClass = cols === 2 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <LayoutGroup>
      <div className="flex flex-col gap-4 w-full" data-testid="category-sort-game">
        {/* Category zones */}
        <div className={`grid ${gridClass} gap-3`}>
          {content.categories.map((category) => {
            const placedItemIds = Array.from(placements.entries())
              .filter(([, targetId]) => targetId === category.id)
              .map(([itemId]) => itemId);
            const isValidTarget = isPlaying && selectedItemId !== null;

            return (
              <div
                key={category.id}
                role="button"
                tabIndex={isValidTarget ? 0 : -1}
                onClick={() => {
                  if (isValidTarget) placeItem(category.id);
                }}
                onKeyDown={(e) => {
                  if (isValidTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    placeItem(category.id);
                  }
                }}
                className={`flex flex-col rounded-xl border-2 border-dashed p-3 min-h-[100px] transition-colors ${
                  isValidTarget
                    ? 'border-primary/60 bg-primary/5 cursor-pointer'
                    : 'border-border bg-card'
                }`}
                data-testid={`category-zone-${category.id}`}
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {category.label}
                </span>
                <motion.div layout className="flex flex-wrap gap-1.5">
                  {placedItemIds.map((itemId) => {
                    const item = itemsById.get(itemId);
                    if (!item) return null;
                    const state = getMiniGameItemVisualState(
                      itemId,
                      selectedItemId,
                      phase,
                      correctItemIds,
                      incorrectItemIds,
                    );
                    return (
                      <MiniGameItemChip
                        key={itemId}
                        layoutId={`mini-game-item-${itemId}`}
                        itemId={itemId}
                        label={item.label}
                        state={state}
                        onTap={() => {
                          if (isPlaying) {
                            if (selectedItemId) {
                              placeItem(category.id);
                            } else {
                              removeItem(itemId);
                            }
                          }
                        }}
                        disabled={phase === 'submitted'}
                      />
                    );
                  })}
                  {placedItemIds.length === 0 && (
                    <span className="text-xs text-muted-foreground/50 italic py-2">
                      {isValidTarget ? 'Tap to place here' : 'No items yet'}
                    </span>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        {unplacedItemIds.length > 0 && (
          <div className="border-t border-border" />
        )}

        {/* Item pool */}
        {unplacedItemIds.length > 0 && (
          <motion.div layout className="flex flex-wrap gap-2 justify-center" data-testid="item-pool">
            {unplacedItemIds.map((itemId) => {
              const item = itemsById.get(itemId);
              if (!item) return null;
              const state = getMiniGameItemVisualState(
                itemId,
                selectedItemId,
                phase,
                correctItemIds,
                incorrectItemIds,
              );
              return (
                <MiniGameItemChip
                  key={itemId}
                  layoutId={`mini-game-item-${itemId}`}
                  itemId={itemId}
                  label={item.label}
                  state={state}
                  onTap={() => selectItem(itemId)}
                  disabled={phase === 'submitted'}
                />
              );
            })}
          </motion.div>
        )}
      </div>
    </LayoutGroup>
  );
}
