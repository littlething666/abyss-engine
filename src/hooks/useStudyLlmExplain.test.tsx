import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  createElement,
  createRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createRoot } from 'react-dom/client';

import {
  clearStudyFormulaLlmExplainSessionCacheForTests,
  useStudyFormulaLlmExplain,
} from './useStudyFormulaLlmExplain';
import {
  clearStudyQuestionMermaidDiagramSessionCacheForTests,
  useStudyQuestionMermaidDiagram,
} from './useStudyQuestionMermaidDiagram';
import {
  clearStudyQuestionLlmExplainSessionCacheForTests,
  useStudyQuestionLlmExplain,
} from './useStudyQuestionLlmExplain';

const { streamChatMock } = vi.hoisted(() => ({
  streamChatMock: vi.fn(),
}));

vi.mock('../infrastructure/llmInferenceRegistry', () => ({
  getChatCompletionsRepositoryForSurface: vi.fn(() => ({
    streamChat: streamChatMock,
  })),
}));

type QuestionHarnessProps = {
  topicLabel: string;
  questionText: string;
  cardId: string | null;
};

type QuestionApi = ReturnType<typeof useStudyQuestionLlmExplain>;

type MermaidHarnessProps = {
  topicLabel: string;
  questionText: string;
  cardId: string | null;
};

type MermaidApi = ReturnType<typeof useStudyQuestionMermaidDiagram>;

const MermaidHarness = forwardRef<MermaidApi | null, MermaidHarnessProps>(
  function MermaidHarness({ topicLabel, questionText, cardId }, ref) {
    const api = useStudyQuestionMermaidDiagram({ topicLabel, questionText, cardId });
    useImperativeHandle(ref, () => api, [api]);
    return null;
  },
);

const QuestionHarness = forwardRef<QuestionApi | null, QuestionHarnessProps>(
  function QuestionHarness({ topicLabel, questionText, cardId }, ref) {
    const api = useStudyQuestionLlmExplain({ topicLabel, questionText, cardId });
    useImperativeHandle(ref, () => api, [api]);
    return null;
  },
);

type FormulaHarnessProps = {
  topicLabel: string;
  cardQuestionText: string;
  cardId: string | null;
};

type FormulaApi = ReturnType<typeof useStudyFormulaLlmExplain>;

const FormulaHarness = forwardRef<FormulaApi | null, FormulaHarnessProps>(
  function FormulaHarness({ topicLabel, cardQuestionText, cardId }, ref) {
    const api = useStudyFormulaLlmExplain({ topicLabel, cardQuestionText, cardId });
    useImperativeHandle(ref, () => api, [api]);
    return null;
  },
);

function renderQuestionHarness(props: QuestionHarnessProps) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const ref = createRef<QuestionApi | null>();
  act(() => {
    root.render(createElement(QuestionHarness, { ...props, ref }));
  });
  return {
    getApi: () => ref.current,
    rerender: (next: QuestionHarnessProps) => {
      act(() => {
        root.render(createElement(QuestionHarness, { ...next, ref }));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

function renderMermaidHarness(props: MermaidHarnessProps) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const ref = createRef<MermaidApi | null>();
  act(() => {
    root.render(createElement(MermaidHarness, { ...props, ref }));
  });
  return {
    getApi: () => ref.current,
    rerender: (next: MermaidHarnessProps) => {
      act(() => {
        root.render(createElement(MermaidHarness, { ...next, ref }));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

function renderFormulaHarness(props: FormulaHarnessProps) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const ref = createRef<FormulaApi | null>();
  act(() => {
    root.render(createElement(FormulaHarness, { ...props, ref }));
  });
  return {
    getApi: () => ref.current,
    rerender: (next: FormulaHarnessProps) => {
      act(() => {
        root.render(createElement(FormulaHarness, { ...next, ref }));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

/** Flush React updates from async stream iteration. */
async function flushStreamUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useStudyQuestionLlmExplain', () => {
  beforeEach(() => {
    streamChatMock.mockReset();
    clearStudyQuestionLlmExplainSessionCacheForTests();
  });

  it('skips streamChat when session cache has a completed answer', async () => {
    streamChatMock.mockImplementation(async function* () {
      yield 'hello';
    });

    const first = renderQuestionHarness({
      cardId: 'c1',
      topicLabel: 'Topic',
      questionText: 'Why?',
    });
    await act(async () => {
      first.getApi()?.requestExplain();
    });
    await flushStreamUpdates();
    expect(first.getApi()?.assistantText).toBe('hello');
    expect(first.getApi()?.isPending).toBe(false);
    expect(streamChatMock).toHaveBeenCalledTimes(1);

    first.unmount();

    const second = renderQuestionHarness({
      cardId: 'c1',
      topicLabel: 'Topic',
      questionText: 'Why?',
    });
    await act(async () => {
      second.getApi()?.requestExplain();
    });
    await flushStreamUpdates();
    expect(streamChatMock).toHaveBeenCalledTimes(1);
    expect(second.getApi()?.assistantText).toBe('hello');
    expect(second.getApi()?.isPending).toBe(false);
    second.unmount();
  });

  it('cancelInflight aborts stream and leaves isPending false', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    streamChatMock.mockImplementation(async function* () {
      yield 'a';
      await gate;
      yield 'b';
    });

    const { getApi, unmount } = renderQuestionHarness({
      cardId: 'c1',
      topicLabel: 'T',
      questionText: 'Q',
    });
    await act(async () => {
      getApi()?.requestExplain();
    });
    await flushStreamUpdates();
    expect(getApi()?.isPending).toBe(true);

    await act(async () => {
      getApi()?.cancelInflight();
    });
    await flushStreamUpdates();
    expect(getApi()?.isPending).toBe(false);
    expect(getApi()?.assistantText).toBeNull();
    release();
    await flushStreamUpdates();
    expect(getApi()?.assistantText).toBeNull();
    unmount();
  });

  it('unmount aborts without leaving isPending true', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    streamChatMock.mockImplementation(async function* () {
      yield 'x';
      await gate;
      yield 'y';
    });

    const { getApi, unmount } = renderQuestionHarness({
      cardId: 'c1',
      topicLabel: 'T',
      questionText: 'Q',
    });
    await act(async () => {
      getApi()?.requestExplain();
    });
    await flushStreamUpdates();
    unmount();
    release();
    await flushStreamUpdates();
  });
});

describe('useStudyQuestionMermaidDiagram', () => {
  beforeEach(() => {
    streamChatMock.mockReset();
    clearStudyQuestionMermaidDiagramSessionCacheForTests();
  });

  it('skips streamChat when session cache has a completed diagram', async () => {
    streamChatMock.mockImplementation(async function* () {
      yield '```mermaid\nflowchart LR\n  A --> B\n```';
    });

    const first = renderMermaidHarness({
      cardId: 'c1',
      topicLabel: 'Topic',
      questionText: 'Why?',
    });
    await act(async () => {
      first.getApi()?.requestDiagram();
    });
    await flushStreamUpdates();
    expect(first.getApi()?.assistantText).toContain('flowchart');
    expect(first.getApi()?.isPending).toBe(false);
    expect(streamChatMock).toHaveBeenCalledTimes(1);

    first.unmount();

    const second = renderMermaidHarness({
      cardId: 'c1',
      topicLabel: 'Topic',
      questionText: 'Why?',
    });
    await act(async () => {
      second.getApi()?.requestDiagram();
    });
    await flushStreamUpdates();
    expect(streamChatMock).toHaveBeenCalledTimes(1);
    expect(second.getApi()?.assistantText).toContain('flowchart');
    expect(second.getApi()?.isPending).toBe(false);
    second.unmount();
  });

  it('cancelInflight aborts stream and leaves isPending false', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    streamChatMock.mockImplementation(async function* () {
      yield 'a';
      await gate;
      yield 'b';
    });

    const { getApi, unmount } = renderMermaidHarness({
      cardId: 'c1',
      topicLabel: 'T',
      questionText: 'Q',
    });
    await act(async () => {
      getApi()?.requestDiagram();
    });
    await flushStreamUpdates();
    expect(getApi()?.isPending).toBe(true);

    await act(async () => {
      getApi()?.cancelInflight();
    });
    await flushStreamUpdates();
    expect(getApi()?.isPending).toBe(false);
    expect(getApi()?.assistantText).toBeNull();
    release();
    await flushStreamUpdates();
    expect(getApi()?.assistantText).toBeNull();
    unmount();
  });
});

describe('useStudyFormulaLlmExplain', () => {
  beforeEach(() => {
    streamChatMock.mockReset();
    clearStudyFormulaLlmExplainSessionCacheForTests();
  });

  it('skips streamChat when session cache has a completed formula explanation', async () => {
    streamChatMock.mockImplementation(async function* () {
      yield 'fn';
    });

    const first = renderFormulaHarness({
      cardId: 'c1',
      topicLabel: 'Topic',
      cardQuestionText: 'Compute?',
    });
    await act(async () => {
      first.getApi()?.requestExplain('x^2', 'question');
    });
    await flushStreamUpdates();
    expect(first.getApi()?.assistantText).toBe('fn');
    expect(streamChatMock).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderFormulaHarness({
      cardId: 'c1',
      topicLabel: 'Topic',
      cardQuestionText: 'Compute?',
    });
    await act(async () => {
      second.getApi()?.requestExplain('x^2', 'question');
    });
    await flushStreamUpdates();
    expect(streamChatMock).toHaveBeenCalledTimes(1);
    expect(second.getApi()?.assistantText).toBe('fn');
    second.unmount();
  });

  it('cancelInflight clears pending state', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    streamChatMock.mockImplementation(async function* () {
      await gate;
      yield 'z';
    });

    const { getApi, unmount } = renderFormulaHarness({
      cardId: 'c1',
      topicLabel: 'T',
      cardQuestionText: 'Q',
    });
    await act(async () => {
      getApi()?.requestExplain('a', 'answer');
    });
    await flushStreamUpdates();
    expect(getApi()?.isPending).toBe(true);
    await act(async () => {
      getApi()?.cancelInflight();
    });
    await flushStreamUpdates();
    expect(getApi()?.isPending).toBe(false);
    expect(getApi()?.assistantText).toBeNull();
    release();
    await flushStreamUpdates();
    unmount();
  });
});
