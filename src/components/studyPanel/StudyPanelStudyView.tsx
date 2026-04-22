'use client';

import React from 'react';
import MathMarkdownRenderer from '../MathMarkdownRenderer';
import { RenderableCard } from '../../features/studyPanel/cardPresenter';
import {
  type StudyPanelFormulaExplainProps,
  type StudyPanelLlmExplainProps,
  type StudyPanelMermaidDiagramProps,
} from '../../features/studyPanel/studyPanelLlmSurfaceProps';
import { Rating } from '../../types';
import { Card } from '../../types/core';
import { SM2Data } from '../../features/progression/sm2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveLlmInferenceSurface,
  type ResponsiveLlmInferenceDescription,
} from '../ResponsiveLlmInferenceSurface';
import { LlmReasoningBlock } from '../LlmReasoningBlock';
import { LlmReasoningToggle } from '../LlmReasoningToggle';
import { LlmTtsToggle } from '../LlmTtsToggle';
import { Network, Redo2, Sparkles, Undo2 } from 'lucide-react';
import { StudyKatexInteractive } from './StudyKatexInteractive';
import { StudyQuestionMermaidLlmBody } from './StudyQuestionMermaidLlmBody';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useLlmAssistantSpeech } from '@/hooks/useLlmAssistantSpeech';
import { useStudyPanelLlmSurfaces } from '@/hooks/useStudyPanelLlmSurfaces';

export type { StudyPanelFormulaExplainProps, StudyPanelLlmExplainProps, StudyPanelMermaidDiagramProps };

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
  onSelectAnswer: (answer: string) => void;
  onChoiceSubmit: () => void;
  onChoiceContinue: () => void;
  onRate: (rating: Rating) => void;
  getRatingLabel: (rating: Rating) => string;
  getRatingColor: (rating: Rating) => string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  llmExplain: StudyPanelLlmExplainProps;
  llmFormulaExplain: StudyPanelFormulaExplainProps;
  llmMermaidDiagram: StudyPanelMermaidDiagramProps;
  explainReasoningEnabled: boolean;
  explainReasoningToggleDisabled: boolean;
  formulaReasoningEnabled: boolean;
  formulaReasoningToggleDisabled: boolean;
  mermaidReasoningEnabled: boolean;
  mermaidReasoningToggleDisabled: boolean;
  onToggleExplainReasoning: () => void;
  onToggleFormulaReasoning: () => void;
  onToggleMermaidReasoning: () => void;
  explainTtsEnabled: boolean;
  formulaTtsEnabled: boolean;
  mermaidTtsEnabled: boolean;
  onToggleExplainTts: () => void;
  onToggleFormulaTts: () => void;
  onToggleMermaidTts: () => void;
}

const QUESTION_EXPLAIN_DESCRIPTION = 'AI explanation for the current card question.';

const QUESTION_MERMAID_DESCRIPTION = 'AI-generated Mermaid diagram for the current card question.';

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
  isSingleChoice,
  isMultiChoice,
  selectedAnswers,
  isAnswerSubmitted,
  isCorrect,
  isRevealed,
  sm2State,
  activeCard,
  onSelectAnswer,
  onChoiceSubmit,
  onChoiceContinue,
  onRate,
  getRatingLabel,
  getRatingColor,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  llmExplain,
  llmFormulaExplain,
  llmMermaidDiagram,
  explainReasoningEnabled,
  explainReasoningToggleDisabled,
  formulaReasoningEnabled,
  formulaReasoningToggleDisabled,
  mermaidReasoningEnabled,
  mermaidReasoningToggleDisabled,
  onToggleExplainReasoning,
  onToggleFormulaReasoning,
  onToggleMermaidReasoning,
  explainTtsEnabled,
  formulaTtsEnabled,
  mermaidTtsEnabled,
  onToggleExplainTts,
  onToggleFormulaTts,
  onToggleMermaidTts,
}: StudyPanelStudyViewProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const {
    explainOpen,
    mermaidOpen,
    formulaOpen,
    activeFormulaLatex,
    openFormulaExplain,
    handleExplainOpenChange,
    handleMermaidOpenChange,
    handleFormulaOpenChange,
    dismissExplainInference,
    dismissFormulaInference,
    dismissMermaidInference,
  } = useStudyPanelLlmSurfaces({
    llmExplain,
    llmFormulaExplain,
    llmMermaidDiagram,
    explainReasoningEnabled,
    formulaReasoningEnabled,
    mermaidReasoningEnabled,
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
  const mermaidAssistantSpeech = useLlmAssistantSpeech({
    isSurfaceOpen: mermaidOpen,
    ttsEnabled: mermaidTtsEnabled,
    assistantText: llmMermaidDiagram.assistantText,
    isPending: llmMermaidDiagram.isPending,
  });

  const formatTestId = isFlashcard
    ? 'study-card-format-flashcard'
    : isSingleChoice
      ? 'study-card-format-single-choice'
      : isMultiChoice
        ? 'study-card-format-multi-choice'
        : 'study-card-format-unknown';
  const formatBadgeVariant = isFlashcard ? 'secondary' : isSingleChoice ? 'outline' : 'default';
  const formatLabel = isFlashcard
    ? '📝 Flashcard'
    : isSingleChoice
      ? '⭕ Single Choice'
      : '☑️ Multiple Choice';

  const questionExplainBody = (
    <LlmStreamBlock
      isPending={llmExplain.isPending}
      errorMessage={llmExplain.errorMessage}
      assistantText={llmExplain.assistantText}
      reasoningText={llmExplain.reasoningText}
      contentTestId="study-card-llm-explain-content"
      errorTestId="study-card-llm-explain-error"
      loadingTestId="study-card-llm-explain-loading"
    />
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
  const questionMermaidDescription: ResponsiveLlmInferenceDescription = {
    kind: 'srOnly',
    text: QUESTION_MERMAID_DESCRIPTION,
  };
  const formulaExplainDescription: ResponsiveLlmInferenceDescription = {
    kind: 'markdown',
    source: formulaDescSource,
  };
  return (
    <div className="w-full relative" data-testid="study-panel-card-root">
      <div className="bg-card rounded-[15px] p-5 min-h-[150px] flex flex-col justify-center">
        {/* Format Type Badge */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <Badge
            variant={formatBadgeVariant}
            data-testid={formatTestId}
          >
            {formatLabel}
          </Badge>
          <div className="flex items-center gap-1" data-testid="study-card-history-actions">
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              aria-label="Explain question with AI"
              title="Explain question with AI"
              data-testid="study-card-llm-explain-trigger"
              onClick={() => handleExplainOpenChange(true)}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Explain question with AI</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              aria-label="Draw diagram with AI"
              title="Draw diagram with AI"
              data-testid="study-card-llm-mermaid-trigger"
              onClick={() => handleMermaidOpenChange(true)}
            >
              <Network className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Draw diagram with AI</span>
            </Button>
            <Button
              onClick={onUndo}
              disabled={!canUndo}
              variant="outline"
              size="icon-xs"
              aria-label={`Undo (${undoCount})`}
              title={`Undo (${undoCount})`}
              data-testid="study-card-undo"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="sr-only">{`Undo (${undoCount})`}</span>
            </Button>
            <Button
              onClick={onRedo}
              disabled={!canRedo}
              variant="outline"
              size="icon-xs"
              aria-label={`Redo (${redoCount})`}
              title={`Redo (${redoCount})`}
              data-testid="study-card-redo"
            >
              <Redo2 className="h-3.5 w-3.5" />
              <span className="sr-only">{`Redo (${redoCount})`}</span>
            </Button>
          </div>
        </div>

        <div className="mb-2" data-testid="study-card-question">
          <StudyKatexInteractive
            className="study-katex-interactive"
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
              <Badge variant="outline">Answer & explanation</Badge>
            </div>
            <StudyKatexInteractive
              className="study-katex-interactive"
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
          <div className="mt-4 space-y-2" data-testid="study-card-choice-options">
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
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${optionStyle} ${
                    isAnswerSubmitted ? 'cursor-default' : 'cursor-pointer'
                  }`}
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
          <div className="mt-4 pt-4 border-t border-border">
            <div className="mb-2">
              <Badge variant="outline">💡 Explanation</Badge>
            </div>
            <MathMarkdownRenderer
              source={renderedCard.context}
              className="text-foreground text-sm italic markdown-body markdown-body--block"
            />
          </div>
        )}

        {/* Card Metadata */}
        <div className="flex gap-2 flex-wrap text-xs text-muted-foreground border-t border-border pt-3 mt-4">
          <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
            ID {renderedCard.id.slice(0, 8)}
          </Badge>
          {activeCard && (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5">
              Difficulty {activeCard.difficulty}
            </Badge>
          )}
          {sm2State && (
            <>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                Interval {sm2State.interval} days
              </Badge>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                Reps {sm2State.repetitions}
              </Badge>
            </>
          )}
        </div>
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
        open={mermaidOpen}
        onOpenChange={handleMermaidOpenChange}
        isDesktop={isDesktop}
        title="Question diagram"
        description={questionMermaidDescription}
        onDismissOutside={dismissMermaidInference}
        desktopContentClassName="sm:max-w-xl"
        sheetMaxHeightClassName="data-[side=bottom]:max-h-[80vh]"
        sheetBodyScrollClassName="max-h-[min(55vh,36rem)]"
        headerAction={
          <div className="flex items-center gap-1">
            <LlmReasoningToggle
              enabled={mermaidReasoningEnabled}
              disabled={mermaidReasoningToggleDisabled}
              onToggle={onToggleMermaidReasoning}
            />
            <LlmTtsToggle
              enabled={mermaidTtsEnabled}
              onToggle={onToggleMermaidTts}
              speaking={mermaidAssistantSpeech.isSpeaking}
            />
          </div>
        }
      >
        <StudyQuestionMermaidLlmBody {...llmMermaidDiagram} />
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
          <div className="grid grid-cols-4 gap-2">
            <span className="col-span-4 text-muted-foreground text-sm mb-2">Rate your recall:</span>
            {([1, 2, 3, 4] as Rating[]).map((rating) => {
              const label = getRatingLabel(rating);
              const color = getRatingColor(rating);
              const BUTTON_STYLE: React.CSSProperties = {
                backgroundColor: color,
              };
              return (
                <Button
                  key={rating}
                  style={BUTTON_STYLE}
                  onClick={() => {
                    onRate(rating);
                  }}
                  className="flex-1 py-3 rounded-md text-sm font-bold cursor-pointer hover:opacity-90"
                  data-testid={`study-card-rating-${rating}`}
                >
                  {label}
                </Button>
              );
            })}
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
            className={`w-full ${
              selectedAnswers.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/90'
            }`}
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
