'use client';

import React from 'react';
import { LayoutGroup, motion } from 'motion/react';
import type { CategorySortContent } from '../../types/core';
import type { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';

interface CategorySortGameProps {
  content: CategorySortContent;
  interaction: ReturnType<typeof useMiniGameInteraction>;
}

type ItemVisualState = 'default' | 'selected' | 'correct' | 'incorrect';

function getItemVisualState(
  itemId: string,
  selectedItemId: string | null,
  phase: string,
  correctItemIds: ReadonlySet<string>,
  incorrectItemIds: ReadonlySet<string>,
): ItemVisualState {
  if (phase === 'submitted') {
    if (correctItemIds.has(itemId)) return 'correct';
    if (incorrectItemIds.has(itemId)) return 'incorrect';
    return 'default';
  }
  if (selectedItemId === itemId) return 'selected';
  return 'default';
}

const ITEM_STYLE: Record<ItemVisualState, string> = {
  default: 'bg-muted border-border text-foreground',
  selected: 'bg-primary/20 border-primary text-foreground ring-2 ring-primary',
  correct: 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300',
  incorrect: 'bg-destructive/20 border-destructive text-destructive',
};

function ItemChip({
  label,
  state,
  onTap,
  layoutId,
  disabled,
}: {
  label: string;
  state: ItemVisualState;
  onTap: () => void;
  layoutId: string;
  disabled: boolean;
}) {
  return (
    <motion.button
      layoutId={layoutId}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg border-2 px-3 py-2 text-sm font-medium min-h-[44px] min-w-[44px] select-none ${ITEM_STYLE[state]} ${disabled ? 'opacity-70' : ''}`}
      layout
      transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
      initial={false}
      animate={
        state === 'incorrect'
          ? { x: [0, -3, 3, -3, 3, 0], transition: { duration: 0.25 } }
          : state === 'correct'
            ? { scale: [1, 1.06, 1], transition: { duration: 0.2 } }
            : {}
      }
    >
      {state === 'correct' && <span className="mr-1">✓</span>}
      {state === 'incorrect' && <span className="mr-1">✗</span>}
      {label}
    </motion.button>
  );
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
                    const state = getItemVisualState(itemId, selectedItemId, phase, correctItemIds, incorrectItemIds);
                    return (
                      <ItemChip
                        key={itemId}
                        layoutId={`mini-game-item-${itemId}`}
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
              const state = getItemVisualState(itemId, selectedItemId, phase, correctItemIds, incorrectItemIds);
              return (
                <ItemChip
                  key={itemId}
                  layoutId={`mini-game-item-${itemId}`}
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
