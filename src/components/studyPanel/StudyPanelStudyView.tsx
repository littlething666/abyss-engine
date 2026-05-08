'use client';

import React, { useEffect, useState } from 'react';
import MathMarkdownRenderer from '../MathMarkdownRenderer';
import { RenderableCard } from '../../features/studyPanel/cardPresenter';
import {
  type StudyPanelFormulaExplainProps,
  type StudyPanelLlmExplainProps,
} from '../../features/studyPanel/studyPanelLlmSurfaceProps';
import { CoarseChoice } from '../../types';
import { Card } from '../../types/core';
import { SM2Data } from '../../features/progression';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveLlmInferenceSurface,
  type ResponsiveLlmInferenceDescription,
} from '../ResponsiveLlmInferenceSurface';
import { LlmReasoningBlock } from '../LlmReasoningBlock';
import { LlmReasoningToggle } from '../LlmReasoningToggle';
import { LlmTtsToggle } from '../LlmTtsToggle';
import { Lightbulb, Sparkles } from 'lucide-react';
import { StudyKatexInteractive } from './StudyKatexInteractive';
import { StudyPromptExternalActions } from './StudyPromptExternalActions';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useLlmAssistantSpeech } from '@/hooks/useLlmAssistantSpeech';
import { useStudyPanelLlmSurfaces } from '@/hooks/useStudyPanelLlmSurfaces';

export type { StudyPanelFormulaExplainProps, StudyPanelLlmExplainProps };

type LlmStreamBlockProps = {
  isPending: boolean;
  errorMessage: string | null;
  assistantText: string | null;
  reasoningText: string | null;
  contentTestId: string;
  errorTestId: string;
  loadingTestId: string;
};

function LlmStreamBlock({
  isPending,
  errorMessage,
  assistantText,
  reasoningText,
  contentTestId,
  errorTestId,
  loadingTestId,
}: LlmStreamBlockProps) {
  return (
    <div
      className="max-h-80 overflow-y-auto text-sm"
      data-testid={contentTestId}
    >
        <LlmReasoningBlock reasoningText={reasoningText} isPending={isPending} />
      {errorMessage && !isPending && (
        <p className="text-destructive" data-testid={errorTestId}>
          {errorMessage}
        </p>
      )}
      {isPending && !(assistantText && assistantText.length > 0) && !reasoningText && (
        <p className="text-muted-foreground" data-testid={loadingTestId}>
          Warming up…
        </p>
      )}
      {assistantText && assistantText.length > 0 && (
        <div className="min-h-[1em]">
          <MathMarkdownRenderer
            source={assistantText}
            className="text-foreground markdown-body markdown-body--block text-sm"
          />
          {isPending && (
            <span
              className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-foreground/50 align-middle"
              aria-hidden
            />
          )}
        </div>
      )}
    </div>
  );
}

type OptionState =
  | 'default'
  | 'selected'
  | 'selected-correct'
  | 'selected-incorrect'
  | 'unselected-correct'
  | 'unselected-incorrect';

const optionStateByAnswer = (isSubmitted: boolean, isSelected: boolean, isCorrectOption: boolean): OptionState => {
  if (!isSubmitted) {
    return isSelected ? 'selected' : 'default';
  }

  if (isSelected) {
    return isCorrectOption ? 'selected-correct' : 'selected-incorrect';
  }

  return isCorrectOption ? 'unselected-correct' : 'unselected-incorrect';
};

type OptionPresentation = {
  marker: '✓' | '✗' | null;
  style: string;
  markerClass: string;
};

const optionPresentation: Record<OptionState, OptionPresentation> = {
  default: {
    marker: null,
    style: 'bg-transparent border-border hover:border-foreground/40',
    markerClass: '',
  },
  selected: {
    marker: null,
    style: 'bg-primary/20 border-primary',
    markerClass: '',
  },
  'selected-correct': {
    marker: '✓',
    style: 'bg-accent/20 border-accent',
    markerClass: 'text-accent-foreground',
  },
  'selected-incorrect': {
    marker: '✗',
    style: 'bg-destructive/20 border-destructive',
    markerClass: 'text-destructive',
  },
  'unselected-correct': {
    marker: '✓',
    style: 'bg-transparent border-border hover:border-foreground/40',
    markerClass: 'text-accent-foreground',
  },
  'unselected-incorrect': {
    marker: null,
    style: 'bg-transparent border-border hover:border-foreground/40',
    markerClass: '',
  },
};

interface StudyPanelStudyViewProps {
  renderedCard: RenderableCard;
  isFlashcard: boolean;
  isChoiceQuestion: boolean;
  isSingleChoice: boolean;
  isMultiChoice: boolean;
  selectedAnswers: string[];
  isAnswerSubmitted: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  sm2State: SM2Data | null;
  activeCard: Card | null;
  topicSystemPrompt: string;
  resolvedTopic: string;
  onSelectAnswer: (answer: string) => void;
  onChoiceSubmit: () => void;
  onChoiceContinue: () => void;
  onCoarseRate: (choice: CoarseChoice) => void;
  onHintUsed: () => void;
  llmExplain: StudyPanelLlmExplainProps;
  llmFormulaExplain: StudyPanelFormulaExplainProps;
  explainReasoningEnabled: boolean;
  explainReasoningToggleDisabled: boolean;
  formulaReasoningEnabled: boolean;
  formulaReasoningToggleDisabled: boolean;
  onToggleExplainReasoning: () => void;
  onToggleFormulaReasoning: () => void;
  explainTtsEnabled: boolean;
  formulaTtsEnabled: boolean;
  onToggleExplainTts: () => void;
  onToggleFormulaTts: () => void;
}

const QUESTION_EXPLAIN_DESCRIPTION = 'AI explanation for the current card question.';

/** Delay before the Hint control is shown (viewport-fixed; resets when the card changes). */
export const STUDY_HINT_BUTTON_REVEAL_DELAY_MS = 15_000;

/** Inline LaTeX as remark-math; escapes `$` inside the expression. */
function formulaDescriptionMarkdown(latex: string | null): string {
  if (!latex) {
    return 'The expression you tapped in the question or answer.';
  }
  const truncated = latex.length > 120 ? `${latex.slice(0, 117)}…` : latex;
  const escaped = truncated.replace(/\$/g, '\\$');
  return `$${escaped}$`;
}

export function StudyPanelStudyView({
  renderedCard,
  isFlashcard,
  isChoiceQuestion,
  isAnswerSubmitted,
  isRevealed,
  selectedAnswers,
  activeCard,
  topicSystemPrompt,
  resolvedTopic,
  onSelectAnswer,
  onChoiceSubmit,
  onChoiceContinue,
  onCoarseRate,
  onHintUsed,
  llmExplain,
  llmFormulaExplain,
  explainReasoningEnabled,
  explainReasoningToggleDisabled,
  formulaReasoningEnabled,
  formulaReasoningToggleDisabled,
  onToggleExplainReasoning,
  onToggleFormulaReasoning,
  explainTtsEnabled,
  formulaTtsEnabled,
  onToggleExplainTts,
  onToggleFormulaTts,
}: StudyPanelStudyViewProps) {
  void activeCard;
  const [hintButtonVisible, setHintButtonVisible] = useState(false);
  useEffect(() => {
    setHintButtonVisible(false);
    const timerId = window.setTimeout(() => {
      setHintButtonVisible(true);
    }, STUDY_HINT_BUTTON_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timerId);
  }, [renderedCard.id]);

  const isDesktop = useMediaQuery('(min-width: 768px)');
  const {
    explainOpen,
    formulaOpen,
    activeFormulaLatex,
    openFormulaExplain,
    handleExplainOpenChange,
    handleFormulaOpenChange,
    dismissExplainInference,
    dismissFormulaInference,
  } = useStudyPanelLlmSurfaces({
    llmExplain,
    llmFormulaExplain,
    explainReasoningEnabled,
    formulaReasoningEnabled,
    isAnswerSubmitted,
    onHintUsed,
  });

  const explainAssistantSpeech = useLlmAssistantSpeech({
    isSurfaceOpen: explainOpen,
    ttsEnabled: explainTtsEnabled,
    assistantText: llmExplain.assistantText,
    isPending: llmExplain.isPending,
  });
  const formulaAssistantSpeech = useLlmAssistantSpeech({
    isSurfaceOpen: formulaOpen,
    ttsEnabled: formulaTtsEnabled,
    assistantText: llmFormulaExplain.assistantText,
    isPending: llmFormulaExplain.isPending,
  });

  const trimmedSystemPrompt = topicSystemPrompt.trim();
  const hasSystemPrompt = trimmedSystemPrompt.length > 0;

  const questionExplainBody = (
    <div className="flex flex-col gap-2">
      {!hasSystemPrompt && (
        <p className="text-muted-foreground text-xs italic" data-testid="study-card-llm-explain-prompt-helper">
          No topic prompt yet, so the search and diagram shortcuts are disabled.
        </p>
      )}
      <LlmStreamBlock
        isPending={llmExplain.isPending}
        errorMessage={llmExplain.errorMessage}
        assistantText={llmExplain.assistantText}
        reasoningText={llmExplain.reasoningText}
        contentTestId="study-card-llm-explain-content"
        errorTestId="study-card-llm-explain-error"
        loadingTestId="study-card-llm-explain-loading"
      />
    </div>
  );

  const formulaExplainBody = (
    <LlmStreamBlock
      isPending={llmFormulaExplain.isPending}
      errorMessage={llmFormulaExplain.errorMessage}
      assistantText={llmFormulaExplain.assistantText}
      reasoningText={llmFormulaExplain.reasoningText}
      contentTestId="study-card-formula-llm-content"
      errorTestId="study-card-formula-llm-error"
      loadingTestId="study-card-formula-llm-loading"
    />
  );

  const formulaDescSource = formulaDescriptionMarkdown(activeFormulaLatex);
  const questionExplainDescription: ResponsiveLlmInferenceDescription = {
    kind: 'srOnly',
    text: QUESTION_EXPLAIN_DESCRIPTION,
  };
  const formulaExplainDescription: ResponsiveLlmInferenceDescription = {
    kind: 'markdown',
    source: formulaDescSource,
  };

  const hintOpenHandler = () => handleExplainOpenChange(true);
  const hintTriggerWrapperClassName =
    'pointer-events-none fixed left-0 top-0 z-[200] flex p-3 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))]';

  return (
    <div className="w-full relative" data-testid="study-panel-card-root">
      {hintButtonVisible ? (
        <div className={hintTriggerWrapperClassName}>
          {/* pointer-events-none on the wrapper keeps taps from blocking the scene; the button re-enables hits. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-events-auto gap-1 min-h-8 rounded-full"
            aria-label="Hint: Explain question with AI"
            title="Hint: Explain question with AI"
            data-testid="study-card-llm-explain-trigger"
            onClick={hintOpenHandler}
          >
            <Lightbulb aria-hidden />
            Hint
          </Button>
        </div>
      ) : null}

      <div className="bg-card p-5 min-h-[100px] flex flex-col justify-center">
        <div className="mb-2" data-testid="study-card-question">
          <StudyKatexInteractive
            className="study-katex-interactive study-markdown-primary"
            onFormulaPress={(latex, el) => openFormulaExplain(latex, 'question', el)}
          >
            <MathMarkdownRenderer
              source={renderedCard.question}
              className="text-foreground text-lg markdown-body markdown-body--block"
            />
          </StudyKatexInteractive>
        </div>

        {/* Flashcard Answer */}
        {isFlashcard && isRevealed && renderedCard.answer && (
          <div className="mt-4 pt-4 border-t border-border" data-testid="study-card-answer-section">
            <div className="mb-2">
              <Badge variant="outline">Answer &amp; explanation</Badge>
            </div>
            <StudyKatexInteractive
              className="study-katex-interactive study-markdown-primary"
              onFormulaPress={(latex, el) => openFormulaExplain(latex, 'answer', el)}
            >
              <MathMarkdownRenderer
                source={renderedCard.answer}
                className="text-foreground text-lg markdown-body markdown-body--block"
              />
            </StudyKatexInteractive>
          </div>
        )}

        {/* Choice Options */}
        {!isFlashcard && renderedCard.options && (
          <div className="mt-4 flex flex-col gap-2 study-markdown-secondary" data-testid="study-card-choice-options">
            {renderedCard.options.map((option, index) => {
              const isSelected = selectedAnswers.includes(option);
              const isCorrectOption = Boolean(renderedCard.correctAnswers?.includes(option));
              const optionState = optionStateByAnswer(isAnswerSubmitted, isSelected, isCorrectOption);
              const optionStyle = optionPresentation[optionState].style;
              const optionMarker = optionPresentation[optionState].marker;
              const optionMarkerClass = optionPresentation[optionState].markerClass;

            return (
                <Button
                  key={index}
                  onClick={() => onSelectAnswer(option)}
                  disabled={isAnswerSubmitted}
                  variant="ghost"
                  multiline
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${optionStyle}`}
                  data-testid={`study-card-choice-option-${index}`}
                  aria-label={`${option} ${isAnswerSubmitted ? optionState : 'not submitted'}`}
                >
                  <span className="flex w-full items-start gap-2 min-w-0">
                    {isAnswerSubmitted && optionMarker && (
                      <span className={`inline-flex shrink-0 items-center justify-center w-4 leading-none text-lg ${optionMarkerClass}`}>
                        {optionMarker}
                      </span>
                    )}
                    <MathMarkdownRenderer
                      source={option}
                      className="text-muted-foreground markdown-body markdown-body--inline min-w-0 flex-1 break-words"
                    />
                  </span>
                  <span className="sr-only">{isAnswerSubmitted && optionMarker ? optionMarker : ''}</span>
                </Button>
              );
            })}
          </div>
        )}

        {/* Context - shown after answering */}
        {((isFlashcard && isRevealed) || (isChoiceQuestion && isAnswerSubmitted)) && renderedCard.context && (
          <div className="mt-4 pt-4 border-t border-border study-markdown-secondary">
            <div className="mb-2">
              <Badge variant="outline">💡 Explanation</Badge>
            </div>
            <MathMarkdownRenderer
              source={renderedCard.context}
              className="text-foreground text-sm italic markdown-body markdown-body--block"
            />
          </div>
        )}
      </div>

      {/* Inference surfaces: see ResponsiveLlmInferenceSurface (non-modal nested Radix). */}
      <ResponsiveLlmInferenceSurface
        open={explainOpen}
        onOpenChange={handleExplainOpenChange}
        isDesktop={isDesktop}
        title="Explain question"
        description={questionExplainDescription}
        onDismissOutside={dismissExplainInference}
        desktopContentClassName="sm:max-w-md"
        sheetMaxHeightClassName="data-[side=bottom]:max-h-[70vh]"
        sheetBodyScrollClassName="max-h-[min(40vh,32rem)]"
        headerAction={
          <div className="flex items-center gap-1">
            <StudyPromptExternalActions
              topicSystemPrompt={topicSystemPrompt}
              resolvedTopic={resolvedTopic}
            />
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <LlmReasoningToggle
              enabled={explainReasoningEnabled}
              disabled={explainReasoningToggleDisabled}
              onToggle={onToggleExplainReasoning}
            />
            <LlmTtsToggle
              enabled={explainTtsEnabled}
              onToggle={onToggleExplainTts}
              speaking={explainAssistantSpeech.isSpeaking}
            />
          </div>
        }
      >
        {questionExplainBody}
      </ResponsiveLlmInferenceSurface>

      <ResponsiveLlmInferenceSurface
        open={formulaOpen}
        onOpenChange={handleFormulaOpenChange}
        isDesktop={isDesktop}
        title="Formula explanation"
        description={formulaExplainDescription}
        onDismissOutside={dismissFormulaInference}
        desktopContentClassName="sm:max-w-md"
        sheetMaxHeightClassName="data-[side=bottom]:max-h-[70vh]"
        sheetBodyScrollClassName="max-h-[min(40vh,32rem)]"
        headerAction={
          <div className="flex items-center gap-1">
            <LlmReasoningToggle
              enabled={formulaReasoningEnabled}
              disabled={formulaReasoningToggleDisabled}
              onToggle={onToggleFormulaReasoning}
            />
            <LlmTtsToggle
              enabled={formulaTtsEnabled}
              onToggle={onToggleFormulaTts}
              speaking={formulaAssistantSpeech.isSpeaking}
            />
          </div>
        }
      >
        {formulaExplainBody}
      </ResponsiveLlmInferenceSurface>

      {/* Actions */}
      <div className="mt-4 text-center sticky bottom-0 z-10 bg-card pt-3">

        {/* Flashcard Actions */}
        {isFlashcard && !isAnswerSubmitted && (
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => onCoarseRate('forgot')}
                variant="destructive"
                className="w-full py-3"
                data-testid="study-card-coarse-forgot"
              >
                Forgot
              </Button>
              <Button
                onClick={() => onCoarseRate('recalled')}
                variant="default"
                className="w-full py-3"
                data-testid="study-card-coarse-recalled"
              >
                Got it
              </Button>
            </div>
          </div>
        )}

        {isFlashcard && isRevealed && isAnswerSubmitted && (
          <Button
            onClick={onChoiceContinue}
            className="w-full"
            data-testid="study-card-continue"
          >
            Continue
          </Button>
        )}

        {/* Choice Question Actions */}
        {isChoiceQuestion && !isAnswerSubmitted && (
          <Button
            onClick={onChoiceSubmit}
            disabled={selectedAnswers.length === 0}
            className="w-full"
            data-testid="study-card-submit-answer"
          >
            Submit Answer
          </Button>
        )}

        {isChoiceQuestion && isAnswerSubmitted && (
          <Button
            onClick={onChoiceContinue}
            className="w-full"
            data-testid="study-card-continue"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
