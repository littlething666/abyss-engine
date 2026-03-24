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
  const requestDiagram = vi.fn();
  const cancelMermaid = vi.fn();

  const llmExplain = {
    isPending: false,
    errorMessage: null as string | null,
    assistantText: null as string | null,
    requestExplain,
    cancelInflight: cancelExplain,
  };
  const llmFormulaExplain = {
    isPending: false,
    errorMessage: null as string | null,
    assistantText: null as string | null,
    requestExplain: requestFormula,
    cancelInflight: cancelFormula,
  };
  const llmMermaidDiagram = {
    isPending: false,
    errorMessage: null as string | null,
    assistantText: null as string | null,
    requestDiagram,
    cancelInflight: cancelMermaid,
  };

  return {
    llmExplain,
    llmFormulaExplain,
    llmMermaidDiagram,
    requestExplain,
    cancelExplain,
    requestFormula,
    cancelFormula,
    requestDiagram,
    cancelMermaid,
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

  it('cancels explain and formula when opening mermaid; requests diagram when auto-request applies', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleMermaidOpenChange(true);
    });
    expect(p.cancelExplain).toHaveBeenCalledTimes(1);
    expect(p.cancelFormula).toHaveBeenCalledTimes(1);
    expect(p.requestDiagram).toHaveBeenCalledTimes(1);
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

  it('cancels mermaid inflight when closing mermaid', () => {
    const p = makeLlmProps();
    const { getApi, unmount } = renderHarness(p);
    act(() => {
      getApi()?.handleMermaidOpenChange(true);
    });
    p.cancelMermaid.mockClear();
    act(() => {
      getApi()?.handleMermaidOpenChange(false);
    });
    expect(p.cancelMermaid).toHaveBeenCalledTimes(1);
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
    expect(p.cancelMermaid).toHaveBeenCalledTimes(1);
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
