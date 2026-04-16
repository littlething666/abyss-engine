import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useStudyKeyboardShortcuts } from './useStudyKeyboardShortcuts';

type ShortcutHarnessProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

function ShortcutHarness(props: ShortcutHarnessProps) {
  const { onUndo, onRedo, canUndo, canRedo } = props;
  useStudyKeyboardShortcuts(onUndo, onRedo, canUndo, canRedo);
  return null;
}

function renderShortcutHarness(override: Partial<ShortcutHarnessProps> = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (props: ShortcutHarnessProps) => {
    flushSync(() => {
      root.render(createElement(ShortcutHarness, props));
    });
  };

  const baseProps: ShortcutHarnessProps = {
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...override,
  };
  render(baseProps);

  return {
    root,
    unmount: () => root.unmount(),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useStudyKeyboardShortcuts', () => {
  it('triggers undo and redo callbacks from shared study panel shortcuts', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { unmount } = renderShortcutHarness({
      canUndo: true,
      canRedo: true,
      onUndo,
      onRedo,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(onUndo).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
    expect(onRedo).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not trigger undo/redo callbacks when unavailable', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { unmount } = renderShortcutHarness({
      canUndo: false,
      canRedo: false,
      onUndo,
      onRedo,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));

    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
    unmount();
  });
});
