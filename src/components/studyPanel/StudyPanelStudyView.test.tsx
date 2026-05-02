import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { StudyPanelStudyView } from './StudyPanelStudyView';

type StudyPanelStudyViewProps = ComponentProps<typeof StudyPanelStudyView>;

const baseProps: StudyPanelStudyViewProps = {
  renderedCard: {
    id: 'card-mcq',
    type: 'multi_choice',
    question: 'Which are prime?',
    options: ['2', '4', '3', '9'],
    correctAnswers: ['2', '3'],
    context: 'Numbers divisible by only 1 and itself are prime.',
  },
  isFlashcard: false,
  isChoiceQuestion: true,
  isSingleChoice: false,
  isMultiChoice: true,
  selectedAnswers: [],
  isAnswerSubmitted: false,
  isCorrect: false,
  isRevealed: false,
  sm2State: null,
  activeCard: null,
  topicSystemPrompt: '',
  resolvedTopic: 'Test topic',
  onSelectAnswer: vi.fn(),
  onChoiceSubmit: vi.fn(),
  onChoiceContinue: vi.fn(),
  onCoarseRate: vi.fn(),
  onHintUsed: vi.fn(),
  llmExplain: {
    isPending: false,
    errorMessage: null,
    assistantText: null,
    reasoningText: null,
    requestExplain: vi.fn(),
    cancelInflight: vi.fn(),
    clearSessionCache: vi.fn(),
  },
  llmFormulaExplain: {
    isPending: false,
    errorMessage: null,
    assistantText: null,
    reasoningText: null,
    requestExplain: vi.fn(),
    cancelInflight: vi.fn(),
    clearSessionCache: vi.fn(),
  },
  explainReasoningEnabled: false,
  explainReasoningToggleDisabled: false,
  formulaReasoningEnabled: false,
  formulaReasoningToggleDisabled: false,
  onToggleExplainReasoning: vi.fn(),
  onToggleFormulaReasoning: vi.fn(),
  explainTtsEnabled: true,
  formulaTtsEnabled: true,
  onToggleExplainTts: vi.fn(),
  onToggleFormulaTts: vi.fn(),
};

function renderStudyPanelView(override: Partial<StudyPanelStudyViewProps> = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  let lastProps: StudyPanelStudyViewProps = { ...baseProps, ...override };
  const render = (props: StudyPanelStudyViewProps) => {
    lastProps = props;
    flushSync(() => {
      root.render(createElement(StudyPanelStudyView, props));
    });
  };
  render(lastProps);

  return {
    container,
    root,
    rerender: (nextOverride: Partial<StudyPanelStudyViewProps>) => render({ ...lastProps, ...nextOverride }),
    unmount: () => root.unmount(),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('StudyPanelStudyView', () => {
  it('renders Hint trigger for LLM inference', () => {
    const { container, unmount } = renderStudyPanelView();
    const trigger = container.querySelector('[data-testid="study-card-llm-explain-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-label')).toContain('Hint');
    expect(trigger?.textContent).toContain('Hint');
    unmount();
  });

  it('requests formula LLM explanation when a KaTeX span is clicked', () => {
    const requestExplain = vi.fn();
    const { container, unmount } = renderStudyPanelView({
      renderedCard: {
        ...baseProps.renderedCard,
        question: 'What is $x^2$?',
      },
      llmFormulaExplain: {
        isPending: false,
        errorMessage: null,
        assistantText: null,
        reasoningText: null,
        requestExplain,
        cancelInflight: vi.fn(),
        clearSessionCache: vi.fn(),
      },
    });
    document.body.append(container);
    const katex = container.querySelector('.katex') as HTMLElement | null;
    expect(katex).not.toBeNull();
    katex?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(requestExplain).toHaveBeenCalledTimes(1);
    expect(requestExplain).toHaveBeenCalledWith(expect.stringMatching(/x/), 'question');
    unmount();
  });

  it('requests LLM explanation when Explain inference surface opens', () => {
    const requestExplain = vi.fn();
    const { container, unmount } = renderStudyPanelView({
      llmExplain: {
        isPending: false,
        errorMessage: null,
        assistantText: null,
        reasoningText: null,
        requestExplain,
        cancelInflight: vi.fn(),
        clearSessionCache: vi.fn(),
      },
    });
    document.body.append(container);
    const trigger = container.querySelector('[data-testid="study-card-llm-explain-trigger"]') as HTMLButtonElement;
    trigger?.click();
    expect(requestExplain).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('shows loading text in explain inference surface while pending', () => {
    const requestExplain = vi.fn();
    const cancelInflight = vi.fn();
    const { container, rerender, unmount } = renderStudyPanelView({
      llmExplain: {
        isPending: false,
        errorMessage: null,
        assistantText: null,
        reasoningText: null,
        requestExplain,
        cancelInflight,
        clearSessionCache: vi.fn(),
      },
    });
    document.body.append(container);
    container.querySelector('[data-testid="study-card-llm-explain-trigger"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    rerender({
      llmExplain: {
        isPending: true,
        errorMessage: null,
        assistantText: null,
        reasoningText: null,
        requestExplain,
        cancelInflight,
        clearSessionCache: vi.fn(),
      },
    });
    const loading = document.body.querySelector('[data-testid="study-card-llm-explain-loading"]');
    expect(loading).not.toBeNull();
    unmount();
  });

  it('shows icon-only status markers for all option states after submit', () => {
    const { container, unmount } = renderStudyPanelView({
      selectedAnswers: ['4'],
      isAnswerSubmitted: true,
    });

    const optionOne = container.querySelector('[data-testid="study-card-choice-option-0"]') as HTMLButtonElement;
    const optionTwo = container.querySelector('[data-testid="study-card-choice-option-1"]') as HTMLButtonElement;
    const optionThree = container.querySelector('[data-testid="study-card-choice-option-2"]') as HTMLButtonElement;
    const optionFour = container.querySelector('[data-testid="study-card-choice-option-3"]') as HTMLButtonElement;

    expect(optionOne?.textContent).toContain('✓');
    expect(optionOne?.className).toContain('border-border');
    expect(optionOne?.className).not.toContain('bg-destructive/20');

    expect(optionTwo?.textContent).toContain('✗');
    expect(optionTwo?.className).toContain('bg-destructive/20');
    expect(optionTwo?.className).toContain('border-destructive');

    expect(optionThree?.textContent).toContain('✓');
    expect(optionThree?.className).toContain('border-border');
    expect(optionThree?.className).not.toContain('bg-destructive/20');
    expect(optionFour?.textContent).not.toContain('✓');
    expect(optionFour?.textContent).not.toContain('✗');
    expect(optionFour?.className).not.toContain('bg-accent/20');
    expect(optionFour?.className).not.toContain('bg-destructive/20');

    unmount();
  });

  it('hides markers before submit and keeps selected option highlighted', () => {
    const { container, unmount } = renderStudyPanelView({
      selectedAnswers: ['4'],
      isAnswerSubmitted: false,
      isSingleChoice: true,
      isMultiChoice: false,
      renderedCard: {
        id: 'card-single',
        type: 'single_choice',
        question: 'Pick one',
        options: ['A', 'B', 'C'],
        correctAnswers: ['A'],
      },
    });

    const selectedOption = container.querySelector('[data-testid="study-card-choice-option-1"]') as HTMLButtonElement;
    expect(selectedOption?.textContent).not.toContain('✓');
    expect(selectedOption?.textContent).not.toContain('✗');
    expect(selectedOption?.getAttribute('aria-label')).toContain('not submitted');

    unmount();
  });

  it('preserves submit/continue and context visibility transitions', () => {
    const props: Partial<StudyPanelStudyViewProps> = {
      selectedAnswers: ['4'],
      isAnswerSubmitted: false,
    };
    const { container, rerender, unmount } = renderStudyPanelView(props);

    const submitButton = () => container.querySelector('[data-testid="study-card-submit-answer"]');
    const continueButton = () => container.querySelector('[data-testid="study-card-continue"]');

    expect(submitButton()).not.toBeNull();
    expect(continueButton()).toBeNull();
    expect(container.textContent).not.toContain('Numbers divisible by only 1 and itself are prime.');

    rerender({ ...props, isAnswerSubmitted: true });

    expect(submitButton()).toBeNull();
    expect(continueButton()).not.toBeNull();
    expect(container.textContent).toContain('Numbers divisible by only 1 and itself are prime.');

    unmount();
  });

  it('shows flashcard rating on the first screen and answer/explanation on reveal', () => {
    const onCoarseRate = vi.fn();
    const { container, rerender, unmount } = renderStudyPanelView({
      isFlashcard: true,
      isChoiceQuestion: false,
      isSingleChoice: false,
      isMultiChoice: false,
      isAnswerSubmitted: false,
      isRevealed: false,
      onCoarseRate,
      renderedCard: {
        id: 'card-flash',
        type: 'flashcard',
        question: 'What is a lambda?',
        answer: 'An anonymous function.',
      },
    });

    expect(container.querySelector('[data-testid="study-card-coarse-forgot"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="study-card-coarse-recalled"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="study-card-answer-section"]')).toBeNull();

    const forgotButton = container.querySelector('[data-testid="study-card-coarse-forgot"]') as HTMLButtonElement;
    const recalledButton = container.querySelector('[data-testid="study-card-coarse-recalled"]') as HTMLButtonElement;
    forgotButton?.click();
    expect(onCoarseRate).toHaveBeenCalledTimes(1);
    expect(onCoarseRate).toHaveBeenCalledWith('forgot');
    onCoarseRate.mockClear();
    recalledButton?.click();
    expect(onCoarseRate).toHaveBeenCalledTimes(1);
    expect(onCoarseRate).toHaveBeenCalledWith('recalled');

    rerender({
      isAnswerSubmitted: true,
      isRevealed: true,
    });
    expect(container.querySelector('[data-testid="study-card-answer-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="study-card-continue"]')).not.toBeNull();

    unmount();
  });
});
