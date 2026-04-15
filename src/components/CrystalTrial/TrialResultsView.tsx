'use client';

import React from 'react';
import type { CrystalTrialResult } from '@/types/crystalTrial';
import { Button } from '@/components/ui/button';

interface TrialResultsViewProps {
  result: CrystalTrialResult;
  targetLevel: number;
  onLevelUp: () => void;
  onClose: () => void;
}

export function TrialResultsView({
  result,
  targetLevel,
  onLevelUp,
  onClose,
}: TrialResultsViewProps) {
  const scorePercent = Math.round(result.score * 100);

  return (
    <div className="flex flex-col gap-6">
      {/* Score header */}
      <div className="text-center">
        <div
          className={`text-5xl font-bold mb-2 ${
            result.passed ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {result.correctCount}/{result.totalQuestions}
        </div>
        <p
          className={`text-lg font-medium ${
            result.passed ? 'text-emerald-300' : 'text-red-300'
          }`}
        >
          {result.passed
            ? '✨ Crystal Resonance Achieved!'
            : '🔮 Crystal Unstable'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {scorePercent}% accuracy —{' '}
          {result.passed
            ? `Ready for Level ${targetLevel}`
            : 'Review the concepts below and try again after cooldown'}
        </p>
      </div>

      {/* Per-question breakdown */}
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium text-foreground/80">Question Breakdown</h4>
        {result.breakdown.map((item, i) => (
          <div
            key={item.questionId}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              item.isCorrect
                ? 'border-emerald-800/40 bg-emerald-950/20'
                : 'border-red-800/40 bg-red-950/20'
            }`}
          >
            <span className="text-lg mt-0.5">
              {item.isCorrect ? '✅' : '❌'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">Q{i + 1}</p>
              {!item.isCorrect && (
                <>
                  <p className="text-xs text-red-400 mt-1">
                    Your answer: {item.playerAnswer || '(no answer)'}
                  </p>
                  <p className="text-xs text-emerald-400 mt-0.5">
                    Correct: {item.correctAnswer}
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {item.explanation}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Action button */}
      <div className="flex justify-center">
        {result.passed ? (
          <Button
            onClick={onLevelUp}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            size="lg"
          >
            ✨ Level Up to L{targetLevel}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onClose} size="lg">
            Return to Study
          </Button>
        )}
      </div>
    </div>
  );
}
