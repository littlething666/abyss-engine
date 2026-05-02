import { useEffect } from 'react';

export interface UseStudyKeyboardShortcutsOptions {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * When false, the hook is a no-op and no global keydown listener is attached.
   * This is the only undo/redo affordance in the study panel UI; visible undo/redo
   * buttons were removed as part of the visual-clutter cleanup.
   */
  enabled: boolean;
}

/**
 * Wires Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo) to the supplied callbacks while the
 * Study Panel is open. The hook intentionally takes an options object so future shortcut
  * additions stay backwards-compatible at call sites.
 */
export function useStudyKeyboardShortcuts({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  enabled,
}: UseStudyKeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleUndoRedoShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z') {
        return;
      }

      const supportsShortcut = event.ctrlKey || event.metaKey;
      if (!supportsShortcut) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        if (canRedo) {
          onRedo();
        }
        return;
      }

      if (canUndo) {
        onUndo();
      }
    };

    window.addEventListener('keydown', handleUndoRedoShortcut);
    return () => {
      window.removeEventListener('keydown', handleUndoRedoShortcut);
    };
  }, [enabled, onUndo, onRedo, canRedo, canUndo]);
}
