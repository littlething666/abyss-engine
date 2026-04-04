import { useCallback, useMemo, useState } from 'react';
import type { MiniGamePhase } from '../types/miniGame';
import type { MiniGameResult } from '../types/miniGame';

interface UseMiniGameInteractionConfig {
  itemIds: string[];
  evaluateFn: (placements: Map<string, string>) => MiniGameResult;
}

export function useMiniGameInteraction({ itemIds, evaluateFn }: UseMiniGameInteractionConfig) {
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
    (targetId: string, options?: { exclusiveTarget?: boolean }) => {
      if (phase !== 'playing' || !selectedItemId) return;
      setPlacements((prev) => {
        const next = new Map(prev);
        if (options?.exclusiveTarget) {
          for (const [id, tid] of next) {
            if (tid === targetId && id !== selectedItemId) {
              next.delete(id);
            }
          }
        }
        next.set(selectedItemId, targetId);
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
  }, [phase, evaluateFn, placements]);

  const reset = useCallback(() => {
    setPlacements(new Map());
    setSelectedItemId(null);
    setPhase('playing');
    setResult(null);
  }, []);

  const unplacedItemIds = useMemo(
    () => itemIds.filter((id) => !placements.has(id)),
    [itemIds, placements],
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
