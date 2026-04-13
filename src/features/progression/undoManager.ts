import type { ProgressionState, StudyUndoSnapshot } from '@/types/progression';
import { BuffEngine } from './buffs/buffEngine';
import {
  captureUndoSnapshot,
  MAX_UNDO_DEPTH,
  trimUndoSnapshotStack,
} from './progressionUtils';

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

export { MAX_UNDO_DEPTH };
