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
  isCardFlipped: false,
  sm2State: null,
  activeCard: null,
  onSelectAnswer: vi.fn(),
  onChoiceSubmit: vi.fn(),
  onChoiceContinue: vi.fn(),
  onFlip: vi.fn(),
  onRate: vi.fn(),
  getRatingLabel: vi.fn(),
  getRatingColor: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,
  llmExplain: {
    isPending: false,
    errorMessage: null,
    assistantText: null,
    requestExplain: vi.fn(),
    cancelInflight: vi.fn(),
  },
  llmFormulaExplain: {
    isPending: false,
    errorMessage: null,
    assistantText: null,
    requestExplain: vi.fn(),
    cancelInflight: vi.fn(),
  },
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
  it('renders Explain control for LLM inference', () => {
    const { container, unmount } = renderStudyPanelView();
    const trigger = container.querySelector('[data-testid="study-card-llm-explain-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-label')).toContain('Explain');
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
        requestExplain,
        cancelInflight: vi.fn(),
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
        requestExplain,
        cancelInflight: vi.fn(),
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
        requestExplain,
        cancelInflight,
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
        requestExplain,
        cancelInflight,
      },
    });
    const loading = document.body.querySelector('[data-testid="study-card-llm-explain-loading"]');
    expect(loading).not.toBeNull();
    unmount();
  });

  it('renders undo and redo controls with current stack counts', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { container, unmount } = renderStudyPanelView({
      onUndo,
      onRedo,
      canUndo: true,
      canRedo: true,
      undoCount: 2,
      redoCount: 1,
    });

    const undoButton = container.querySelector('[data-testid="study-card-undo"]') as HTMLButtonElement;
    const redoButton = container.querySelector('[data-testid="study-card-redo"]') as HTMLButtonElement;

    expect(undoButton).not.toBeNull();
    expect(redoButton).not.toBeNull();
    expect(undoButton?.getAttribute('aria-label')).toContain('Undo (2)');
    expect(redoButton?.getAttribute('aria-label')).toContain('Redo (1)');
    expect(undoButton.closest('[data-testid="study-card-history-actions"]')).not.toBeNull();
    expect(redoButton.closest('[data-testid="study-card-history-actions"]')).not.toBeNull();

    undoButton?.click();
    redoButton?.click();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('disables undo and redo buttons when no history is available', () => {
    const { container, unmount } = renderStudyPanelView({
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      redoCount: 0,
    });

    const undoButton = container.querySelector('[data-testid="study-card-undo"]') as HTMLButtonElement;
    const redoButton = container.querySelector('[data-testid="study-card-redo"]') as HTMLButtonElement;

    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(true);
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

    expect(optionOne?.textContent).toContain('✗');
    expect(optionOne?.className).toContain('border-destructive');
    expect(optionOne?.className).not.toContain('bg-destructive/20');

    expect(optionTwo?.textContent).toContain('✗');
    expect(optionTwo?.className).toContain('bg-destructive/20');
    expect(optionTwo?.className).toContain('border-destructive');

    expect(optionThree?.textContent).toContain('✗');
    expect(optionThree?.className).toContain('border-destructive');
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

});
