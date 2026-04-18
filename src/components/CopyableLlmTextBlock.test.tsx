import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { CopyableLlmTextBlock } from './CopyableLlmTextBlock';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/infrastructure/toast', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('CopyableLlmTextBlock', () => {
  it('copies copyText to clipboard on button click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        createElement(CopyableLlmTextBlock, {
          copyText: 'alpha',
          'data-testid': 'block-pre',
        }),
      );
    });

    const btn = document.body.querySelector('[data-testid="copyable-llm-text-copy"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    await act(async () => {
      btn.click();
    });
    await expect.poll(() => writeText.mock.calls.length).toBeGreaterThan(0);
    expect(writeText).toHaveBeenCalledWith('alpha');
    expect(toastSuccess).toHaveBeenCalledWith('Copied to clipboard');

    root.unmount();
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders displayText but copies copyText when they differ', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        createElement(CopyableLlmTextBlock, {
          copyText: '{"raw":true}',
          displayText: '{}',
          'data-testid': 'block-pre',
        }),
      );
    });

    const pre = document.body.querySelector('[data-testid="block-pre"]');
    expect(pre?.textContent).toBe('{}');

    const btn = document.body.querySelector('[data-testid="copyable-llm-text-copy"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    await expect.poll(() => writeText.mock.calls.length).toBeGreaterThan(0);
    expect(writeText).toHaveBeenCalledWith('{"raw":true}');

    root.unmount();
    container.remove();
    vi.unstubAllGlobals();
  });

  it('shows emptyDisplay when copyText is empty but still copies empty string', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        createElement(CopyableLlmTextBlock, {
          copyText: '',
          emptyDisplay: '(empty)',
          'data-testid': 'block-pre',
        }),
      );
    });

    expect(document.body.textContent).toContain('(empty)');

    const btn = document.body.querySelector('[data-testid="copyable-llm-text-copy"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    await expect.poll(() => writeText.mock.calls.length).toBeGreaterThan(0);
    expect(writeText).toHaveBeenCalledWith('');

    root.unmount();
    container.remove();
    vi.unstubAllGlobals();
  });

  it('surfaces clipboard failure via toast.error', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(createElement(CopyableLlmTextBlock, { copyText: 'x' }));
    });

    const btn = document.body.querySelector('[data-testid="copyable-llm-text-copy"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    await expect.poll(() => toastError.mock.calls.length).toBeGreaterThan(0);
    expect(toastError).toHaveBeenCalledWith('denied');

    root.unmount();
    container.remove();
    vi.unstubAllGlobals();
  });
});
