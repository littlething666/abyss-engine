import { useCallback, useMemo, useState } from 'react';
import type { MiniGamePhase } from '../types/miniGame';
import type { MiniGameResult } from '../types/miniGame';

interface UseMiniGameInteractionConfig {
  itemIds: string[];
  /** When set, submit is allowed when every required id has a placement (optional ids may stay unplaced). */
  requiredItemIds?: string[];
  evaluateFn: (placements: Map<string, string>) => MiniGameResult;
}

export function useMiniGameInteraction({
  itemIds,
  requiredItemIds,
  evaluateFn,
}: UseMiniGameInteractionConfig) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Map<string, string>>(new Map());
  const [phase, setPhase] = useState<MiniGamePhase>('playing');
  const [result, setResult] = useState<MiniGameResult | null>(null);

  const correctItemIds = useMemo(() => {
    if (!result) return new Set<string>();
    return new Set(result.placements.filter((p) => p.isItemCorrect).map((p) => p.itemId));
  }, [result]);

  const incorrectItemIds = useMemo(() => {
    if (!result) return new Set<string>();
    return new Set(result.placements.filter((p) => !p.isItemCorrect).map((p) => p.itemId));
  }, [result]);

  const selectItem = useCallback(
    (itemId: string) => {
      if (phase !== 'playing') return;
      setSelectedItemId((prev) => (prev === itemId ? null : itemId));
    },
    [phase],
  );

  const placeItem = useCallback(
    (targetId: string, options?: { exclusiveTarget?: boolean; invertPlacement?: boolean }) => {
      if (phase !== 'playing' || !selectedItemId) return;
      setPlacements((prev) => {
        const next = new Map(prev);
        const invert = options?.invertPlacement ?? false;
        if (options?.exclusiveTarget) {
          const rightId = invert ? selectedItemId : targetId;
          const anchorLeftId = invert ? targetId : selectedItemId;
          for (const [id, tid] of next) {
            if (tid === rightId && id !== anchorLeftId) {
              next.delete(id);
            }
          }
        }
        if (invert) {
          next.set(targetId, selectedItemId);
        } else {
          next.set(selectedItemId, targetId);
        }
        return next;
      });
      setSelectedItemId(null);
    },
    [phase, selectedItemId],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      if (phase !== 'playing') return;
      setPlacements((prev) => {
        const next = new Map(prev);
        next.delete(itemId);
        return next;
      });
      if (selectedItemId === itemId) {
        setSelectedItemId(null);
      }
    },
    [phase, selectedItemId],
  );

  const submit = useCallback(() => {
    if (phase !== 'playing') return;
    const evalResult = evaluateFn(placements);
    setResult(evalResult);
    setPhase('submitted');
    setSelectedItemId(null);
    return evalResult;
  }, [phase, evaluateFn, placements]);

  const reset = useCallback(() => {
    setPlacements(new Map());
    setSelectedItemId(null);
    setPhase('playing');
    setResult(null);
  }, []);

  const idsForCompletion = requiredItemIds ?? itemIds;

  const unplacedItemIds = useMemo(
    () => idsForCompletion.filter((id) => !placements.has(id)),
    [idsForCompletion, placements],
  );

  const isComplete = unplacedItemIds.length === 0;
  const canSubmit = isComplete && phase === 'playing';

  return {
    selectedItemId,
    placements: placements as ReadonlyMap<string, string>,
    phase,
    correctItemIds: correctItemIds as ReadonlySet<string>,
    incorrectItemIds: incorrectItemIds as ReadonlySet<string>,
    result,
    selectItem,
    placeItem,
    removeItem,
    submit,
    reset,
    unplacedItemIds,
    isComplete,
    canSubmit,
  };
}
