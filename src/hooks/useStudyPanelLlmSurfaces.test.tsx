import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';

import type { UseStudyPanelLlmSurfacesParams } from './useStudyPanelLlmSurfaces';
import { useStudyPanelLlmSurfaces } from './useStudyPanelLlmSurfaces';

type Api = ReturnType<typeof useStudyPanelLlmSurfaces>;

const Harness = forwardRef<Api | null, UseStudyPanelLlmSurfacesParams>(function Harness(props, ref) {
  const api = useStudyPanelLlmSurfaces(props);
  useImperativeHandle(ref, () => api, [api]);
  return null;
});

function makeLlmProps() {
  const requestExplain = vi.fn();
  const cancelExplain = vi.fn();
  const requestFormula = vi.fn();
  const cancelFormula = vi.fn();
  const clearExplain = vi.fn();
  const clearFormula = vi.fn();
  const onHintUsed = vi.fn();

  const llmExplain = {
    isPending: false,
    errorMessage: null as string | null,
    assistantText: null as string | null,
    reasoningText: null as string | null,
    requestExplain,
    cancelInflight: cancelExplain,
    clearSessionCache: clearExplain,
  };
  const llmFormulaExplain = {
    isPending: false,
    errorMessage: null as string | null,
    assistantText: null as string | null,
    reasoningText: null as string | null,
    requestExplain: requestFormula,
    cancelInflight: cancelFormula,
    clearSessionCache: clearFormula,
  };

  return {
    llmExplain,
    llmFormulaExplain,
    clearExplain,
    clearFormula,
    requestExplain,
    cancelExplain,
    requestFormula,
    cancelFormula,
    explainReasoningEnabled: false,
    formulaReasoningEnabled: false,
    isAnswerSubmitted: false,
    onHintUsed,
  };
}

function renderHarness(params: UseStudyPanelLlmSurfacesParams) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const ref = createRef<Api | null>();
  act(() => {
    root.render(createElement(Harness, { ...params, ref }));
  });
  return {
    getApi: () => ref.current,
    rerender: (next: UseStudyPanelLlmSurfacesParams) => {
      act(() => {
        root.render(createElement(Harness, { ...next, ref }));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useStudyPanelLlmSurfaces', () => {
  it('fires onHintUsed when opening explanation before answer submitted', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleExplainOpenChange(true);
    });
    expect(p.onHintUsed).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not fire onHintUsed when answer already submitted', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness({ ...p, isAnswerSubmitted: true });
    act(() => {
      getApi()?.handleExplainOpenChange(true);
    });
    expect(p.onHintUsed).toHaveBeenCalledTimes(0);
    unmount();
  });

  it('requests question explain when opening explain and auto-request applies', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleExplainOpenChange(true);
    });
    expect(p.requestExplain).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not request explain when a successful response already exists', () => {
    const p = makeLlmProps();
    p.llmExplain.assistantText = 'already';
    p.llmExplain.errorMessage = null;
    const { getApi, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleExplainOpenChange(true);
    });
    expect(p.requestExplain).not.toHaveBeenCalled();
    unmount();
  });

  it('cancels explain inflight when closing explain', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleExplainOpenChange(true);
    });
    p.cancelExplain.mockClear();
    act(() => {
      getApi()?.handleExplainOpenChange(false);
    });
    expect(p.cancelExplain).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('openFormulaExplain closes other surfaces and invokes formula request', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness(p);
    const anchor = document.createElement('span');
    act(() => {
      getApi()?.openFormulaExplain('x^2', 'question', anchor);
    });
    expect(p.cancelExplain).toHaveBeenCalledTimes(1);
    expect(p.requestFormula).toHaveBeenCalledWith('x^2', 'question');
    unmount();
  });

  it('clears and restarts explain request when explain reasoning toggle changes while explain is open', () => {
    const p = makeLlmProps();
    const { getApi, rerender, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleExplainOpenChange(true);
    });
    p.clearExplain.mockClear();
    p.requestExplain.mockClear();

    rerender({
      ...p,
      explainReasoningEnabled: true,
      formulaReasoningEnabled: false,
    });

    expect(p.cancelExplain).toHaveBeenCalledTimes(1);
    expect(p.clearExplain).toHaveBeenCalledTimes(1);
    expect(p.requestExplain).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('clears and restarts formula request when formula reasoning toggle changes while formula is open', () => {
    const p = makeLlmProps();
    const anchor = document.createElement('span');
    const { getApi, rerender, unmount } = renderHarness(p);
    act(() => {
      getApi()?.openFormulaExplain('x^2', 'question', anchor);
    });
    p.clearFormula.mockClear();
    p.requestFormula.mockClear();

    rerender({
      ...p,
      explainReasoningEnabled: false,
      formulaReasoningEnabled: true,
    });

    expect(p.cancelFormula).toHaveBeenCalledTimes(1);
    expect(p.clearFormula).toHaveBeenCalledTimes(1);
    expect(p.requestFormula).toHaveBeenCalledTimes(1);
    expect(p.requestFormula).toHaveBeenCalledWith('x^2', 'question');
    unmount();
  });

  it('dismiss helpers close surfaces', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleExplainOpenChange(true);
    });
    act(() => {
      getApi()?.dismissExplainInference();
    });
    expect(p.cancelExplain).toHaveBeenCalled();
    unmount();
  });
});
