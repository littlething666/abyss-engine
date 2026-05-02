'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import type { MatchPairsContent } from '../../types/core';
import type { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';
import { MiniGameItemChip } from './shared/MiniGameItemChip';
import { getMiniGameItemVisualState } from './shared/miniGameVisualState';
import { shuffleMiniGameIds } from './shared/shuffleMiniGameIds';

/**
 * Stable, deterministic id for the right-column chip of a Match Pairs pair.
 * The evaluator scores a placement as correct when `placements.get(pair.id)
 * === matchPairsRightNodeId(pair.id)`.
 */
export function matchPairsRightNodeId(pairId: string): string {
  return `right-${pairId}`;
}

interface MatchPairsGameProps {
  content: MatchPairsContent;
  interaction: ReturnType<typeof useMiniGameInteraction>;
}

const PULSE_DURATION_MS = 280;

const CHIP_PULSE_ANIMATE = {
  scale: [1, 1.06, 1],
  transition: { duration: PULSE_DURATION_MS / 1000 },
};

const CHIP_IDLE_ANIMATE = { scale: 1 };

const CHIP_CLASS =
  '!flex w-full h-full min-h-[44px] max-w-full shrink-0 text-center [text-wrap:balance]';

function findLeftIdForRight(
  placements: ReadonlyMap<string, string>,
  rightId: string,
): string | undefined {
  for (const [leftId, rId] of placements) {
    if (rId === rightId) return leftId;
  }
  return undefined;
}

export function MatchPairsGame({ content, interaction }: MatchPairsGameProps) {
  const {
    selectedItemId,
    placements,
    phase,
    correctItemIds,
    incorrectItemIds,
    selectItem,
    placeItem,
    removeItem,
  } = interaction;

  const isPlaying = phase === 'playing';

  const leftNodes = useMemo(
    () => content.pairs.map((p) => ({ id: p.id, label: p.left })),
    [content],
  );

  const leftIndexById = useMemo(() => {
    const m = new Map<string, number>();
    leftNodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [leftNodes]);

  const rightLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of content.pairs) {
      m.set(matchPairsRightNodeId(p.id), p.right);
    }
    return m;
  }, [content]);

  /**
   * Stable, deterministic seed for the right column's initial order.
   * Independent of placements so unpinned chips keep a predictable order
   * across taps.
   */
  const baseShuffledRightIds = useMemo(() => {
    const ids = content.pairs.map((p) => matchPairsRightNodeId(p.id));
    const seed = `${content.prompt}:${[...ids].sort().join(',')}`;
    return shuffleMiniGameIds(ids, seed);
  }, [content]);

  /**
   * Right column ordering, derived from placements:
   *   1. For each placement (leftId -> rightId) where leftId is a known left
   *      node, pin rightId to that left's row index.
   *   2. Walk `baseShuffledRightIds` in order and drop the still-unpinned ids
   *      into the remaining empty rows.
   */
  const rightColumnIds = useMemo(() => {
    const rowCount = Math.max(leftNodes.length, baseShuffledRightIds.length);
    const slots: Array<string | undefined> = new Array(rowCount).fill(undefined);
    const pinned = new Set<string>();

    for (const [leftId, rightId] of placements) {
      const idx = leftIndexById.get(leftId);
      if (idx === undefined) continue;
      if (idx >= rowCount) continue;
      if (slots[idx] !== undefined) continue;
      slots[idx] = rightId;
      pinned.add(rightId);
    }

    let cursor = 0;
    for (let i = 0; i < rowCount; i++) {
      if (slots[i] !== undefined) continue;
      while (
        cursor < baseShuffledRightIds.length &&
        pinned.has(baseShuffledRightIds[cursor])
      ) {
        cursor++;
      }
      if (cursor >= baseShuffledRightIds.length) break;
      slots[i] = baseShuffledRightIds[cursor];
      cursor++;
    }

    return slots.filter((id): id is string => typeof id === 'string');
  }, [baseShuffledRightIds, leftIndexById, leftNodes.length, placements]);

  const leftIdSet = useMemo(() => new Set(leftNodes.map((n) => n.id)), [leftNodes]);
  const rightIdSet = useMemo(() => new Set(rightColumnIds), [rightColumnIds]);

  const hasLeftSelection = Boolean(
    isPlaying && selectedItemId && leftIdSet.has(selectedItemId),
  );
  const hasRightSelection = Boolean(
    isPlaying && selectedItemId && rightIdSet.has(selectedItemId),
  );

  /**
   * One-shot pulse driver: when a new (leftId -> rightId) entry appears in
   * the placements map, both chips of that pair pulse for `PULSE_DURATION_MS`.
   */
  const [pulseLeftId, setPulseLeftId] = useState<string | null>(null);
  const [pulseRightId, setPulseRightId] = useState<string | null>(null);
  const prevPlacementsRef = useRef<ReadonlyMap<string, string>>(placements);
  useEffect(() => {
    const prev = prevPlacementsRef.current;
    let newLeftId: string | null = null;
    let newRightId: string | null = null;
    for (const [leftId, rightId] of placements) {
      if (prev.get(leftId) !== rightId) {
        newLeftId = leftId;
        newRightId = rightId;
        break;
      }
    }
    prevPlacementsRef.current = placements;
    if (newLeftId === null || newRightId === null) return;
    setPulseLeftId(newLeftId);
    setPulseRightId(newRightId);
    const handle = setTimeout(() => {
      setPulseLeftId(null);
      setPulseRightId(null);
    }, PULSE_DURATION_MS);
    return () => clearTimeout(handle);
  }, [placements]);

  const handleLeftTap = useCallback(
    (leftId: string) => {
      if (!isPlaying) return;
      if (placements.has(leftId)) {
        removeItem(leftId);
        return;
      }
      if (hasRightSelection && selectedItemId) {
        placeItem(leftId, { exclusiveTarget: true, invertPlacement: true });
        return;
      }
      selectItem(leftId);
    },
    [hasRightSelection, isPlaying, placeItem, placements, removeItem, selectItem, selectedItemId],
  );

  const handleRightTap = useCallback(
    (rightId: string) => {
      if (!isPlaying) return;
      const existingLeft = findLeftIdForRight(placements, rightId);
      if (existingLeft !== undefined) {
        removeItem(existingLeft);
        return;
      }
      if (hasLeftSelection && selectedItemId) {
        placeItem(rightId, { exclusiveTarget: true });
        return;
      }
      selectItem(rightId);
    },
    [hasLeftSelection, isPlaying, placeItem, placements, removeItem, selectItem, selectedItemId],
  );

  const rowCount = Math.max(leftNodes.length, rightColumnIds.length);

  return (
    <LayoutGroup>
      <div className="flex w-full flex-col gap-3" data-testid="match-pairs-game">
        <p className="text-center text-xs text-muted-foreground">
          Tap a chip on either side, then tap a chip on the other side to connect them. Tap a connected
          chip to disconnect.
        </p>

        <div className="flex flex-col gap-2" data-testid="match-pairs-rows">
          {Array.from({ length: rowCount }, (_, rowIndex) => {
            const node = leftNodes[rowIndex];
            const rightId = rightColumnIds[rowIndex];
            if (!node || !rightId) return null;

            const label = rightLabelById.get(rightId) ?? '';
            const leftValidTarget = hasRightSelection;
            const rightValidTarget = hasLeftSelection;

            const leftState = getMiniGameItemVisualState(
              node.id,
              selectedItemId,
              phase,
              correctItemIds,
              incorrectItemIds,
            );
            const rightState = getMiniGameItemVisualState(
              rightId,
              selectedItemId,
              phase,
              correctItemIds,
              incorrectItemIds,
            );

            const leftWrapClass = `flex w-full min-w-0 max-w-full justify-end ${
              leftValidTarget
                ? 'rounded-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
                : ''
            }`;
            const rightWrapClass = `flex w-full min-w-0 max-w-full justify-start ${
              rightValidTarget
                ? 'rounded-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
                : ''
            }`;
            const leftAnimate = pulseLeftId === node.id ? CHIP_PULSE_ANIMATE : CHIP_IDLE_ANIMATE;
            const rightAnimate = pulseRightId === rightId ? CHIP_PULSE_ANIMATE : CHIP_IDLE_ANIMATE;

            return (
              <div
                key={`${node.id}-row-${rowIndex}`}
                className="grid grid-cols-2 gap-3 sm:gap-4 items-stretch"
                data-testid="match-pairs-row"
              >
                <div className="flex min-h-[44px] min-w-0 items-stretch justify-end">
                  <motion.div
                    role="button"
                    tabIndex={leftValidTarget ? 0 : -1}
                    onKeyDown={(e) => {
                      if (leftValidTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleLeftTap(node.id);
                      }
                    }}
                    className={leftWrapClass}
                    animate={leftAnimate}
                  >
                    <MiniGameItemChip
                      layoutId={`mp-left-${node.id}`}
                      itemId={node.id}
                      label={node.label}
                      state={leftState}
                      className={CHIP_CLASS}
                      onTap={() => handleLeftTap(node.id)}
                      disabled={!isPlaying}
                    />
                  </motion.div>
                </div>

                <div className="flex min-h-[44px] min-w-0 items-stretch justify-start">
                  <motion.div
                    role="button"
                    tabIndex={rightValidTarget ? 0 : -1}
                    onKeyDown={(e) => {
                      if (rightValidTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleRightTap(rightId);
                      }
                    }}
                    className={rightWrapClass}
                    animate={rightAnimate}
                  >
                    <MiniGameItemChip
                      layoutId={`mp-right-${rightId}`}
                      itemId={rightId}
                      label={label}
                      state={rightState}
                      className={CHIP_CLASS}
                      onTap={() => handleRightTap(rightId)}
                      disabled={!isPlaying}
                    />
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LayoutGroup>
  );
}
