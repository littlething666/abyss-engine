'use client';

import React, { useMemo } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import type { SequenceBuildContent } from '../../types/core';
import type { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';
import { MiniGameItemChip } from './shared/MiniGameItemChip';
import { getMiniGameItemVisualState } from './shared/miniGameVisualState';
import { shuffleMiniGameIds } from './shared/shuffleMiniGameIds';

interface SequenceBuildGameProps {
  content: SequenceBuildContent;
  interaction: ReturnType<typeof useMiniGameInteraction>;
}

export function SequenceBuildGame({ content, interaction }: SequenceBuildGameProps) {
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
  const n = content.items.length;

  const poolOrder = useMemo(() => {
    const ids = content.items.map((i) => i.id);
    const seed = `${content.prompt}:${ids.join(',')}`;
    return shuffleMiniGameIds(ids, seed);
  }, [content]);

  const orderedUnplaced = useMemo(() => {
    const set = new Set(unplacedItemIds);
    return poolOrder.filter((id) => set.has(id));
  }, [poolOrder, unplacedItemIds]);

  const slotIndices = useMemo(() => [...Array(n).keys()], [n]);

  function itemIdInSlot(slotIndex: number): string | undefined {
    for (const [itemId, target] of placements) {
      if (target === String(slotIndex)) return itemId;
    }
    return undefined;
  }

  function slotFeedbackClass(slotIndex: number): string {
    if (phase !== 'submitted') return '';
    const itemId = itemIdInSlot(slotIndex);
    if (!itemId) return '';
    if (correctItemIds.has(itemId)) return 'border-green-500 bg-green-500/10';
    if (incorrectItemIds.has(itemId)) return 'border-destructive bg-destructive/10';
    return '';
  }

  return (
    <LayoutGroup>
      <div className="flex flex-col gap-4 w-full" data-testid="sequence-build-game">
        <div className="text-xs text-muted-foreground text-center">
          Tap an item below, then tap a numbered slot to place it. Tap a placed item to return it to the pool.
        </div>

        {/* Sequence slots + flow arrows */}
        <div
          className="flex flex-wrap justify-center items-stretch gap-x-1 gap-y-3"
          data-testid="sequence-slots"
        >
          {slotIndices.map((slotIndex) => {
            const placedId = itemIdInSlot(slotIndex);
            const isValidTarget = isPlaying && selectedItemId !== null;
            const slotStr = String(slotIndex);

            return (
              <React.Fragment key={slotIndex}>
                {slotIndex > 0 && (
                  <span
                    className="self-center text-muted-foreground text-lg px-0.5 select-none"
                    aria-hidden
                  >
                    →
                  </span>
                )}
                <div
                  role="button"
                  tabIndex={isValidTarget ? 0 : -1}
                  onClick={() => {
                    if (isValidTarget) placeItem(slotStr, { exclusiveTarget: true });
                  }}
                  onKeyDown={(e) => {
                    if (isValidTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      placeItem(slotStr, { exclusiveTarget: true });
                    }
                  }}
                  data-testid={`sequence-slot-${slotIndex}`}
                  className={`flex min-w-[72px] max-w-[140px] flex-1 flex-col rounded-xl border-2 border-dashed p-2 transition-colors ${
                    isValidTarget ? 'border-primary/60 bg-primary/5' : 'border-border bg-card'
                  } ${slotFeedbackClass(slotIndex)}`}
                >
                  <span className="text-center text-xs font-semibold text-muted-foreground mb-1">
                    {slotIndex + 1}
                  </span>
                  <motion.div layout className="flex min-h-[52px] flex-1 items-center justify-center">
                    {placedId ? (
                      (() => {
                        const item = itemsById.get(placedId);
                        if (!item) return null;
                        const state = getMiniGameItemVisualState(
                          placedId,
                          selectedItemId,
                          phase,
                          correctItemIds,
                          incorrectItemIds,
                        );
                        return (
                          <MiniGameItemChip
                            layoutId={`mini-game-item-${placedId}`}
                            itemId={placedId}
                            label={item.label}
                            state={state}
                            multilineLabel
                            onTap={() => {
                              if (isPlaying) {
                                if (selectedItemId) {
                                  placeItem(slotStr, { exclusiveTarget: true });
                                } else {
                                  removeItem(placedId);
                                }
                              }
                            }}
                            disabled={phase === 'submitted'}
                          />
                        );
                      })()
                    ) : (
                      <span className="text-xs text-muted-foreground/60 italic px-1 text-center">
                        {isValidTarget ? 'Place here' : 'Empty'}
                      </span>
                    )}
                  </motion.div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Connecting line hint (decorative, below slots) */}
        <div
          className="h-0.5 w-full max-w-xs mx-auto rounded-full bg-border/80"
          aria-hidden
          data-testid="sequence-flow-line"
        />

        {orderedUnplaced.length > 0 && (
          <>
            <div className="border-t border-border" />
            <motion.div
              layout
              className="flex flex-wrap gap-2 justify-center"
              data-testid="item-pool"
            >
              {orderedUnplaced.map((itemId) => {
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
                    multilineLabel
                    onTap={() => selectItem(itemId)}
                    disabled={phase === 'submitted'}
                  />
                );
              })}
            </motion.div>
          </>
        )}
      </div>
    </LayoutGroup>
  );
}
