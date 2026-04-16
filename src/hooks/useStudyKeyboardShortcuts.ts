import { useEffect } from 'react';

export function useStudyKeyboardShortcuts(
  onUndo: () => void,
  onRedo: () => void,
  canUndo: boolean,
  canRedo: boolean,
) {
  useEffect(() => {
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
  }, [onUndo, onRedo, canRedo, canUndo]);
}
