'use client';

import React from 'react';
import type { CrystalTrialScenarioQuestion, TrialQuestionCategory } from '@/types/crystalTrial';

const CATEGORY_ICONS: Record<TrialQuestionCategory, string> = {
  interview: '🎤',
  troubleshooting: '🔧',
  architecture: '🏗️',
};

interface TrialQuestionCardProps {
  question: CrystalTrialScenarioQuestion;
  questionIndex: number;
  totalQuestions: number;
  selectedAnswer: string | null;
  onSelectAnswer: (answer: string) => void;
  isSubmitted: boolean;
}

export function TrialQuestionCard({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  onSelectAnswer,
  isSubmitted,
}: TrialQuestionCardProps) {
  const category = question.category ?? 'interview';
  const icon = CATEGORY_ICONS[category] ?? '✨';

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {icon} Question {questionIndex + 1} / {totalQuestions}
        </span>
        <span className="capitalize text-xs bg-secondary px-2 py-0.5 rounded">
          {category}
        </span>
      </div>

      {/* Scenario */}
      <div className="bg-muted/60 border border-border rounded-lg p-4">
        <p className="text-foreground text-sm leading-relaxed">
          {question.scenario}
        </p>
      </div>

      {/* Question */}
      <h3 className="text-base font-medium text-foreground">
        {question.question}
      </h3>

      {/* Options */}
      <div className="flex flex-col gap-2">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer === option;
          const isCorrect = isSubmitted && option.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
          const isWrong = isSubmitted && isSelected && !isCorrect;

          let borderColor = 'border-border';
          let bgColor = 'bg-muted/30';
          if (isSubmitted && isCorrect) {
            borderColor = 'border-emerald-500/60';
            bgColor = 'bg-emerald-950/30';
          } else if (isWrong) {
            borderColor = 'border-red-500/60';
            bgColor = 'bg-red-950/30';
          } else if (isSelected && !isSubmitted) {
            borderColor = 'border-violet-500/60';
            bgColor = 'bg-violet-950/20';
          }

          return (
            <button
              key={i}
              type="button"
              disabled={isSubmitted}
              onClick={() => onSelectAnswer(option)}
              className={`text-left px-4 py-3 rounded-lg border transition-colors ${borderColor} ${bgColor} ${isSubmitted ? 'cursor-default' : 'hover:border-muted-foreground cursor-pointer'}`}
            >
              <span className="text-sm text-foreground">
                {String.fromCharCode(65 + i)}. {option}
              </span>
            </button>
          );
        })}
      </div>

      {/* Explanation (shown after submission) */}
      {isSubmitted && (
        <div className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground mb-1 font-medium">Explanation</p>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {question.explanation}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {question.sourceCardSummaries.map((summary, j) => (
              <span
                key={j}
                className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded"
              >
                {summary}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
