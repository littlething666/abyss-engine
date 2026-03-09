import React from 'react';
import MathMarkdownRenderer from '../MathMarkdownRenderer';
import { RenderableCard } from '../../features/studyPanel/cardPresenter';
import { Rating } from '../../types';
import { Card } from '../../types/core';
import { SM2Data } from '../../features/progression/sm2';

interface StudyPanelStudyViewProps {
  renderedCard: RenderableCard;
  isFlashcard: boolean;
  isChoiceQuestion: boolean;
  isSingleChoice: boolean;
  isMultiChoice: boolean;
  selectedAnswers: string[];
  isAnswerSubmitted: boolean;
  isCorrect: boolean;
  isCardFlipped: boolean;
  feedbackMessage?: string | null;
  sm2State: SM2Data | null;
  activeCard: Card | null;
  onSelectAnswer: (answer: string) => void;
  onChoiceSubmit: () => void;
  onChoiceContinue: () => void;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  getRatingLabel: (rating: Rating) => string;
  getRatingColor: (rating: Rating) => string;
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
  isCardFlipped,
  feedbackMessage,
  sm2State,
  activeCard,
  onSelectAnswer,
  onChoiceSubmit,
  onChoiceContinue,
  onFlip,
  onRate,
  getRatingLabel,
  getRatingColor,
}: StudyPanelStudyViewProps) {
  const formatTestId = isFlashcard
    ? 'study-card-format-flashcard'
    : isSingleChoice
      ? 'study-card-format-single-choice'
      : isMultiChoice
        ? 'study-card-format-multi-choice'
        : 'study-card-format-unknown';

  return (
    <div className="w-full" data-testid="study-panel-card-root">
      <div className="bg-slate-900 rounded-[15px] p-5 min-h-[150px] flex flex-col justify-center">
        {/* Format Type Badge */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className="text-cyan-500 text-xs uppercase tracking-wider"
            data-testid={formatTestId}
          >
            {isFlashcard && '📝 Flashcard'}
            {!isFlashcard && isSingleChoice && '⭕ Single Choice'}
            {!isFlashcard && isMultiChoice && '☑️ Multiple Choice'}
          </span>
        </div>

        {/* Question */}
        <div
          className="text-cyan-500 text-xs uppercase tracking-wider mb-2"
          data-testid="study-card-question-label"
        >
          Question
        </div>
        <div data-testid="study-card-question">
          <MathMarkdownRenderer
            source={renderedCard.question}
            className="text-slate-200 text-lg markdown-body markdown-body--block"
          />
        </div>

        {/* Flashcard Answer */}
        {isFlashcard && isCardFlipped && renderedCard.answer && (
          <div className="mt-4 pt-4 border-t border-slate-700" data-testid="study-card-answer-section">
            <div className="text-green-500 text-xs uppercase tracking-wider mb-2">Answer</div>
            <MathMarkdownRenderer
              source={renderedCard.answer}
              className="text-slate-200 text-lg markdown-body markdown-body--block"
            />
          </div>
        )}

        {/* Single Choice Options */}
        {!isFlashcard && renderedCard.options && (
          <div className="mt-4 space-y-2" data-testid="study-card-choice-options">
            {renderedCard.options.map((option, index) => {
              const isSelected = selectedAnswers.includes(option);
              const isCorrectOption = renderedCard.correctAnswers?.includes(option);

              let optionClass = 'bg-slate-800 border-slate-600 hover:bg-slate-700';
              if (isAnswerSubmitted) {
                if (isCorrectOption) {
                  optionClass = 'bg-green-900/50 border-green-500';
                } else if (isSelected && !isCorrectOption) {
                  optionClass = 'bg-red-900/50 border-red-500';
                }
              } else if (isSelected) {
                optionClass = 'bg-cyan-900/50 border-cyan-500';
              }

              return (
                <button
                  key={index}
                  onClick={() => onSelectAnswer(option)}
                  disabled={isAnswerSubmitted}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${optionClass} ${
                    isAnswerSubmitted ? 'cursor-default' : 'cursor-pointer'
                  }`}
                  data-testid={`study-card-choice-option-${index}`}
                >
                  <MathMarkdownRenderer
                    source={option}
                    className="text-slate-300 markdown-body markdown-body--inline"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Context - shown after answering */}
        {((isFlashcard && isCardFlipped) || (isChoiceQuestion && isAnswerSubmitted)) && renderedCard.context && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="text-violet-400 text-xs uppercase tracking-wider mb-2">💡 Explanation</div>
            <MathMarkdownRenderer
              source={renderedCard.context}
              className="text-slate-300 text-sm italic markdown-body markdown-body--block"
            />
          </div>
        )}

        {/* Result Feedback for Choice Questions */}
        {isChoiceQuestion && isAnswerSubmitted && (
          <div
            className={`mt-4 p-3 rounded-lg text-center ${
            isCorrect
              ? 'bg-green-900/50 border border-green-500'
              : 'bg-red-900/50 border border-red-500'
          }`}
            data-testid="study-card-feedback"
          >
            <span className={isCorrect ? 'text-green-400' : 'text-red-400'}>
              {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </span>
          </div>
        )}

        {/* Card Metadata */}
        <div className="flex gap-4 text-xs text-slate-500 border-t border-slate-700 pt-3 mt-4">
          <span>ID: {renderedCard.id.slice(0, 8)}</span>
          {activeCard && <span>Difficulty: {activeCard.difficulty}</span>}
          {sm2State && <span>Interval: {sm2State.interval} days</span>}
          {sm2State && <span>Reps: {sm2State.repetitions}</span>}
        </div>
      </div>

      {/* Feedback Message */}
      {feedbackMessage && (
        <div
          className="mt-3 text-center text-amber-400 text-lg font-semibold animate-pulse"
          data-testid="study-panel-feedback-message"
        >
          {feedbackMessage}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 text-center sticky bottom-0 z-10 bg-slate-800 pt-3">
        {/* Flashcard Actions */}
        {isFlashcard && !isCardFlipped && (
          <button
            onClick={onFlip}
            className="bg-violet-600 text-white border-none py-3 px-8 rounded-lg text-base cursor-pointer w-full hover:bg-violet-500"
            data-testid="study-card-show-answer"
          >
            Show Answer
          </button>
        )}

        {isFlashcard && isCardFlipped && (
          <div className="grid grid-cols-4 gap-2">
            <span className="col-span-4 text-slate-400 text-sm mb-2">Rate your recall:</span>
            {([1, 2, 3, 4] as Rating[]).map((rating) => {
              const label = getRatingLabel(rating);
              const color = getRatingColor(rating);
              return (
                <button
                  key={rating}
                  onClick={() => onRate(rating)}
                  style={{ backgroundColor: color }}
                  className="text-white border-none py-3 rounded-md text-sm font-bold cursor-pointer hover:opacity-90"
                  data-testid={`study-card-rating-${rating}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Choice Question Actions */}
        {isChoiceQuestion && !isAnswerSubmitted && (
          <button
            onClick={onChoiceSubmit}
            disabled={selectedAnswers.length === 0}
            className={`bg-cyan-600 text-white border-none py-3 px-8 rounded-lg text-base cursor-pointer w-full ${
              selectedAnswers.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-cyan-500'
            }`}
            data-testid="study-card-submit-answer"
          >
            Submit Answer
          </button>
        )}

        {isChoiceQuestion && isAnswerSubmitted && (
          <button
            onClick={onChoiceContinue}
            className="bg-violet-600 text-white border-none py-3 px-8 rounded-lg text-base cursor-pointer w-full hover:bg-violet-500"
            data-testid="study-card-continue"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
