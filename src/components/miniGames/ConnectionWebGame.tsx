'use client';

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup } from 'motion/react';
import type { ConnectionWebContent } from '../../types/core';
import type { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';
import { MiniGameConnectorLayer, type MiniGameConnectorSegment } from './shared/MiniGameConnectorLayer';
import { MiniGameItemChip } from './shared/MiniGameItemChip';
import { getMiniGameItemVisualState } from './shared/miniGameVisualState';
import { shuffleMiniGameIds } from './shared/shuffleMiniGameIds';

export function connectionWebRightNodeId(pairId: string): string {
  return `right-${pairId}`;
}

interface ConnectionWebGameProps {
  content: ConnectionWebContent;
  interaction: ReturnType<typeof useMiniGameInteraction>;
}

interface LeftNode {
  id: string;
  label: string;
  kind: 'pair' | 'distractor';
}

function findLeftIdForRight(placements: ReadonlyMap<string, string>, rightId: string): string | undefined {
  for (const [leftId, rId] of placements) {
    if (rId === rightId) return leftId;
  }
  return undefined;
}

export function ConnectionWebGame({ content, interaction }: ConnectionWebGameProps) {
  const {
    selectedItemId,
    placements,
    phase,
    correctItemIds,
    incorrectItemIds,
    selectItem,
    placeItem,
    removeItem,
    result,
  } = interaction;

  const isPlaying = phase === 'playing';
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [lineVersion, setLineVersion] = useState(0);

  const setNodeRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      nodeRefs.current.set(id, el);
    } else {
      nodeRefs.current.delete(id);
    }
  }, []);

  const leftNodes: LeftNode[] = useMemo(() => {
    const pairs = content.pairs.map((p) => ({
      id: p.id,
      label: p.left,
      kind: 'pair' as const,
    }));
    const dist = (content.distractors ?? [])
      .filter((d) => d.side === 'left')
      .map((d) => ({
        id: d.id,
        label: d.label,
        kind: 'distractor' as const,
      }));
    return [...pairs, ...dist];
  }, [content]);

  const rightLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of content.pairs) {
      m.set(connectionWebRightNodeId(p.id), p.right);
    }
    for (const d of content.distractors ?? []) {
      if (d.side === 'right') {
        m.set(d.id, d.label);
      }
    }
    return m;
  }, [content]);

  const rightColumnIds = useMemo(() => {
    const ids = [
      ...content.pairs.map((p) => connectionWebRightNodeId(p.id)),
      ...(content.distractors ?? []).filter((d) => d.side === 'right').map((d) => d.id),
    ];
    const seed = `${content.prompt}:${[...ids].sort().join(',')}`;
    return shuffleMiniGameIds(ids, seed);
  }, [content]);

  const leftIdSet = useMemo(() => new Set(leftNodes.map((n) => n.id)), [leftNodes]);
  const rightIdSet = useMemo(() => new Set(rightColumnIds), [rightColumnIds]);

  const hasLeftSelection = Boolean(isPlaying && selectedItemId && leftIdSet.has(selectedItemId));
  const hasRightSelection = Boolean(isPlaying && selectedItemId && rightIdSet.has(selectedItemId));

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

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setContainerSize({ width: r.width, height: r.height });
      setLineVersion((v) => v + 1);
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setContainerSize({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    setLineVersion((v) => v + 1);
  }, [placements, phase, containerSize.width, containerSize.height]);

  const lines: MiniGameConnectorSegment[] = useMemo(() => {
    if (containerSize.width <= 0 || containerSize.height <= 0) return [];
    const container = containerRef.current;
    if (!container) return [];

    const c = container.getBoundingClientRect();
    const out: MiniGameConnectorSegment[] = [];

    for (const [leftId, rightId] of placements) {
      const leftEl = nodeRefs.current.get(`wrap-${leftId}`);
      const rightEl = nodeRefs.current.get(`wrap-${rightId}`);
      if (!leftEl || !rightEl) continue;

      const lr = leftEl.getBoundingClientRect();
      const rr = rightEl.getBoundingClientRect();

      const x1 = lr.right - c.left;
      const y1 = lr.top + lr.height / 2 - c.top;
      const x2 = rr.left - c.left;
      const y2 = rr.top + rr.height / 2 - c.top;

      let variant: MiniGameConnectorSegment['variant'] = 'default';
      if (phase === 'submitted' && result) {
        const row = result.placements.find((p) => p.itemId === leftId);
        variant = row?.isItemCorrect ? 'correct' : 'incorrect';
      }

      out.push({
        key: `${leftId}-${rightId}`,
        x1,
        y1,
        x2,
        y2,
        variant,
      });
    }

    return out;
  }, [placements, phase, result, containerSize, lineVersion]);

  const rowCount = Math.max(leftNodes.length, rightColumnIds.length);

  return (
    <LayoutGroup>
      <div className="flex w-full flex-col gap-3" data-testid="connection-web-game">
        <p className="text-center text-xs text-muted-foreground">
          Tap either column first, then tap the other side to connect. Tap a connected chip to remove its
          line.
        </p>

        <div ref={containerRef} className="relative min-h-[120px] w-full">
          <MiniGameConnectorLayer
            width={containerSize.width}
            height={containerSize.height}
            lines={lines}
          />

          <div className="relative z-[2] flex flex-col gap-2" data-testid="connection-web-rows">
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

              const chipClass =
                '!flex w-full h-full min-h-[44px] max-w-full shrink-0 text-center [text-wrap:balance]';

              return (
                <div
                  key={`${node.id}-${rightId}-${rowIndex}`}
                  className="grid grid-cols-2 gap-4 items-stretch"
                  data-testid="connection-web-row"
                >
                  <div className="flex min-h-[44px] min-w-0 items-stretch justify-end">
                    <div
                      ref={(el) => setNodeRef(`wrap-${node.id}`, el)}
                      role="button"
                      tabIndex={leftValidTarget ? 0 : -1}
                      onKeyDown={(e) => {
                        if (leftValidTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          handleLeftTap(node.id);
                        }
                      }}
                      className={`flex w-full min-w-0 max-w-full justify-end ${leftValidTarget ? 'rounded-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-background' : ''}`}
                    >
                      <MiniGameItemChip
                        layoutId={`cw-left-${node.id}`}
                        itemId={node.id}
                        label={node.label}
                        state={leftState}
                        className={chipClass}
                        onTap={() => handleLeftTap(node.id)}
                        disabled={!isPlaying}
                      />
                    </div>
                  </div>

                  <div className="flex min-h-[44px] min-w-0 items-stretch justify-start">
                    <div
                      ref={(el) => setNodeRef(`wrap-${rightId}`, el)}
                      role="button"
                      tabIndex={rightValidTarget ? 0 : -1}
                      onKeyDown={(e) => {
                        if (rightValidTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          handleRightTap(rightId);
                        }
                      }}
                      className={`flex w-full min-w-0 max-w-full justify-start ${rightValidTarget ? 'rounded-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-background' : ''}`}
                    >
                      <MiniGameItemChip
                        layoutId={`cw-right-${rightId}`}
                        itemId={rightId}
                        label={label}
                        state={rightState}
                        className={chipClass}
                        onTap={() => handleRightTap(rightId)}
                        disabled={!isPlaying}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </LayoutGroup>
  );
}
