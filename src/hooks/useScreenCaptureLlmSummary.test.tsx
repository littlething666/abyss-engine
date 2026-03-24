import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';

import { chatCompletionsRepository } from '../infrastructure/di';
import { useScreenCaptureLlmSummary } from './useScreenCaptureLlmSummary';

vi.mock('../infrastructure/di', () => ({
  chatCompletionsRepository: {
    streamChat: vi.fn(),
  },
}));

vi.mock('../lib/captureDisplayMediaFrame', () => ({
  captureDisplayMediaAsPngDataUrl: vi.fn(),
}));

import { captureDisplayMediaAsPngDataUrl } from '../lib/captureDisplayMediaFrame';

const streamChatMock = vi.mocked(chatCompletionsRepository.streamChat);
const captureMock = vi.mocked(captureDisplayMediaAsPngDataUrl);

type Api = ReturnType<typeof useScreenCaptureLlmSummary>;

const Harness = forwardRef<Api | null>(function Harness(_props, ref) {
  const api = useScreenCaptureLlmSummary();
  useImperativeHandle(ref, () => api, [api]);
  return null;
});

async function flushStreamUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = createRef<Api | null>();
  act(() => {
    root.render(createElement(Harness, { ref }));
  });
  return {
    getApi: () => ref.current,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useScreenCaptureLlmSummary', () => {
  beforeEach(() => {
    streamChatMock.mockReset();
    captureMock.mockReset();
  });

  it('streams assistant text after capture resolves', async () => {
    captureMock.mockResolvedValue('data:image/png;base64,xx');
    streamChatMock.mockImplementation(async function* () {
      yield 'Hello';
      yield ' world';
    });

    const { getApi, unmount } = renderHarness();

    await act(async () => {
      getApi()!.startSummarize();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await flushStreamUpdates();

    expect(getApi()!.assistantText).toBe('Hello world');
    expect(getApi()!.isPending).toBe(false);

    expect(streamChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              { type: 'text', text: expect.any(String) },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } },
            ]),
          }),
        ]),
      }),
    );

    unmount();
  });

  it('sets error when capture fails', async () => {
    captureMock.mockRejectedValue(new Error('User dismissed share dialog'));

    const { getApi, unmount } = renderHarness();

    await act(async () => {
      getApi()!.startSummarize();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getApi()!.errorMessage).toContain('User dismissed');
    expect(getApi()!.isPending).toBe(false);

    unmount();
  });
});
