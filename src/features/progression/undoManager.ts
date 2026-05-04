import type { ProgressionState, StudyUndoSnapshot } from '@/types/progression';
import { BuffEngine } from './buffs/buffEngine';

export const MAX_UNDO_DEPTH = 50;

function cloneDeep<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function captureUndoSnapshot(state: ProgressionState): StudyUndoSnapshot {
  if (!state.currentSession) {
    throw new Error('Cannot capture undo snapshot without an active session.');
  }

  const coreSession = cloneDeep(state.currentSession);

  return {
    timestamp: Date.now(),
    sm2Data: cloneDeep(state.sm2Data),
    activeCrystals: cloneDeep(state.activeCrystals),
    activeBuffs: cloneDeep(state.activeBuffs),
    unlockPoints: state.unlockPoints,
    resonancePoints: state.resonancePoints,
    currentSession: coreSession,
  };
}

function trimUndoSnapshotStack<T>(
  stack: T[],
  maxDepth: number = MAX_UNDO_DEPTH,
): T[] {
  return stack.slice(Math.max(0, stack.length - maxDepth));
}

/**
 * Build the partial ProgressionState that an undo / redo applies back into
 * the four progression stores.
 *
 * Card-submission undo intentionally does NOT restore the following fields,
 * even though they live on `ProgressionState`. Verified during the
 * progression monolith follow-up plan (§4 cleanup-debt review):
 *
 *   - `currentSubjectId`: a UI viewport signal scoping which subject the
 *     player is engaged with. The player may have navigated to a different
 *     subject between card submissions; teleporting them back on undo would
 *     be surprising and unrelated to the per-card state being rolled back.
 *
 *   - `pendingRitual`: queued attunement-ritual state that belongs to a
 *     potentially different topic's lifecycle. Per-card undo is scoped to
 *     the active study session and must not perturb a queued ritual on
 *     another topic.
 *
 *   - `lastRitualSubmittedAt`: the cooldown gate enforced between
 *     attunement-ritual submissions. Rolling it back on a card-submission
 *     undo would let undo / redo loops bypass the attunement cooldown.
 *
 * Restored fields are limited to the SM-2 schedule, the crystal garden
 * (`activeCrystals` + `unlockPoints` + `resonancePoints`), the active
 * buffs, and the in-flight `currentSession` snapshot.
 */
function buildRestoredPartial(
  state: ProgressionState,
  snapshot: StudyUndoSnapshot,
): Partial<ProgressionState> {
  if (!snapshot.currentSession) {
    throw new Error('Invalid snapshot: currentSession is required for restore.');
  }

  const restoredActiveBuffs = BuffEngine.get().pruneExpired(
    snapshot.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff)),
  );

  return {
    sm2Data: snapshot.sm2Data,
    activeCrystals: snapshot.activeCrystals,
    activeBuffs: restoredActiveBuffs,
    unlockPoints: snapshot.unlockPoints,
    resonancePoints: snapshot.resonancePoints,
    currentSession: snapshot.currentSession,
  };
}

class UndoManager {
  private undoStack: StudyUndoSnapshot[] = [];

  private redoStack: StudyUndoSnapshot[] = [];

  capture(state: ProgressionState): void {
    this.redoStack = [];
    const snap = captureUndoSnapshot(state);
    this.undoStack = trimUndoSnapshotStack([...this.undoStack, snap]);
  }

  undo(state: ProgressionState): Partial<ProgressionState> | null {
    if (this.undoStack.length === 0) {
      return null;
    }
    const snap = this.undoStack[this.undoStack.length - 1];
    this.undoStack = this.undoStack.slice(0, -1);
    const redoSnap = captureUndoSnapshot(state);
    this.redoStack = trimUndoSnapshotStack([...this.redoStack, redoSnap]);
    return buildRestoredPartial(state, snap);
  }

  redo(state: ProgressionState): Partial<ProgressionState> | null {
    if (this.redoStack.length === 0) {
      return null;
    }
    const snap = this.redoStack[this.redoStack.length - 1];
    this.redoStack = this.redoStack.slice(0, -1);
    const undoSnap = captureUndoSnapshot(state);
    this.undoStack = trimUndoSnapshotStack([...this.undoStack, undoSnap]);
    return buildRestoredPartial(state, snap);
  }

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoStackSize(): number {
    return this.undoStack.length;
  }

  get redoStackSize(): number {
    return this.redoStack.length;
  }
}

export const undoManager = new UndoManager();
