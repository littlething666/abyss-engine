'use client';

import React, { useMemo } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import type { SequenceBuildContent } from '../../types/core';
import type { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';

interface SequenceBuildGameProps {
  content: SequenceBuildContent;
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
      className={`inline-flex max-w-full items-center justify-center rounded-lg border-2 px-2 py-2 text-center text-sm font-medium min-h-[44px] min-w-[44px] select-none break-words ${ITEM_STYLE[state]} ${disabled ? 'opacity-70' : ''}`}
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
      {state === 'correct' && <span className="mr-1 shrink-0">✓</span>}
      {state === 'incorrect' && <span className="mr-1 shrink-0">✗</span>}
      <span className="line-clamp-3">{label}</span>
    </motion.button>
  );
}

/** Deterministic shuffle so pool order is stable across renders (SSR-safe). */
function shuffleItemIds(itemIds: string[], seed: string): string[] {
  const a = [...itemIds];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = a.length - 1; i > 0; i--) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
    return shuffleItemIds(ids, seed);
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
                        const state = getItemVisualState(
                          placedId,
                          selectedItemId,
                          phase,
                          correctItemIds,
                          incorrectItemIds,
                        );
                        return (
                          <ItemChip
                            layoutId={`mini-game-item-${placedId}`}
                            label={item.label}
                            state={state}
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
                const state = getItemVisualState(
                  itemId,
                  selectedItemId,
                  phase,
                  correctItemIds,
                  incorrectItemIds,
                );
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
          </>
        )}
      </div>
    </LayoutGroup>
  );
}
