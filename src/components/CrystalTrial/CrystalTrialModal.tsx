'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { PASS_THRESHOLD, useCrystalTrialStore } from '@/features/crystalTrial';
import { useUIStore } from '@/store/uiStore';
import { useProgressionStore } from '@/features/progression/progressionStore';
import { appEventBus } from '@/infrastructure/eventBus';
import {
  CRYSTAL_XP_PER_LEVEL,
  getXpToNextBandThreshold,
  isXpMaxedForCurrentLevel,
} from '@/features/progression/progressionUtils';
import type { CrystalTrialResult, CrystalTrialScenarioQuestion } from '@/types/crystalTrial';
import { evaluateTrial } from '@/features/crystalTrial/evaluateTrial';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TrialQuestionCard } from './TrialQuestionCard';
import { TrialResultsView } from './TrialResultsView';

export function CrystalTrialModal() {
  const isOpen = useUIStore((s) => s.isCrystalTrialOpen);
  const selectedTopic = useUIStore((s) => s.selectedTopic);
  const closeCrystalTrial = useUIStore((s) => s.closeCrystalTrial);

  const trial = useCrystalTrialStore((s) => {
    if (!selectedTopic) return null;
    return s.getCurrentTrial(selectedTopic);
  });
  const selectedCrystal = useProgressionStore((state) => {
    if (!selectedTopic) return null;
    return (
      state.activeCrystals.find(
        (item) => item.subjectId === selectedTopic.subjectId && item.topicId === selectedTopic.topicId,
      ) ?? null
    );
  });
  const xpUntilTrialReady = selectedCrystal ? getXpToNextBandThreshold(selectedCrystal.xp) : 0;
  const canStartTrial = isXpMaxedForCurrentLevel(selectedCrystal?.xp ?? 0);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [result, setResult] = useState<CrystalTrialResult | null>(null);

  const questions: CrystalTrialScenarioQuestion[] = trial?.questions ?? [];
  const answers = trial?.answers ?? {};
  const currentQuestion = questions[currentQuestionIndex] ?? null;
  const trialStatus = trial?.status;
  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]);
  const isSubmitted = result !== null;
  const completedResult = isSubmitted
    ? result
    : trialStatus === 'passed'
      ? evaluateTrial(questions, answers, trial?.passThreshold ?? PASS_THRESHOLD)
      : null;
  const isReviewResult = isSubmitted || (trialStatus === 'passed' && completedResult?.passed === true);

  useEffect(() => {
    if (!isReviewResult || trialStatus !== 'passed' || questions.length === 0) {
      return;
    }
    setCurrentQuestionIndex(questions.length - 1);
  }, [isReviewResult, questions.length, trialStatus]);

  const handleSelectAnswer = useCallback(
    (answer: string) => {
      if (!selectedTopic || !currentQuestion || isReviewResult) return;
      useCrystalTrialStore
        .getState()
        .answerQuestion(selectedTopic, currentQuestion.id, answer);
    },
    [selectedTopic, currentQuestion, isReviewResult],
  );

  const handleNext = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((i) => i + 1);
    }
  }, [currentQuestionIndex, questions.length]);

  const handlePrev = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((i) => i - 1);
    }
  }, [currentQuestionIndex]);

  const handleStartTrial = useCallback(() => {
    if (!selectedTopic || !canStartTrial) return;
    if (trialStatus !== 'awaiting_player') return;
    useCrystalTrialStore.getState().startTrial(selectedTopic);
    setCurrentQuestionIndex(0);
    setResult(null);
  }, [selectedTopic, canStartTrial, trialStatus]);

  const handleSubmit = useCallback(() => {
    if (!selectedTopic || !allAnswered) return;
    const trialResult = useCrystalTrialStore.getState().submitTrial(selectedTopic);
    if (trialResult) {
      setResult(trialResult);
      const t = useCrystalTrialStore.getState().getCurrentTrial(selectedTopic);
      appEventBus.emit('crystal:trial-completed', {
        subjectId: selectedTopic.subjectId,
        topicId: selectedTopic.topicId,
        targetLevel: t?.targetLevel ?? 0,
        passed: trialResult.passed,
        score: trialResult.score,
        trialId: t?.trialId ?? '',
      });
    }
  }, [selectedTopic, allAnswered]);

  const handleLevelUp = useCallback(() => {
    if (!selectedTopic) return;
    const { activeCrystals, addXP } = useProgressionStore.getState();
    const crystal = activeCrystals.find(
      (item) => item.subjectId === selectedTopic.subjectId && item.topicId === selectedTopic.topicId,
    );
    if (!trial || !crystal) {
      closeCrystalTrial();
      return;
    }

    const targetXp = trial.targetLevel * CRYSTAL_XP_PER_LEVEL;
    const xpToLevel = Math.max(0, targetXp - crystal.xp);
    if (xpToLevel === 0) {
      useCrystalTrialStore.getState().clearTrial(selectedTopic);
      setResult(null);
      setCurrentQuestionIndex(0);
      closeCrystalTrial();
      return;
    }

    addXP(selectedTopic, xpToLevel);

    useCrystalTrialStore.getState().clearTrial(selectedTopic);

    setResult(null);
    setCurrentQuestionIndex(0);
    closeCrystalTrial();
  }, [selectedTopic, closeCrystalTrial, trial]);

  const handleClose = useCallback(() => {
    setResult(null);
    setCurrentQuestionIndex(0);
    closeCrystalTrial();
  }, [closeCrystalTrial]);

  return (
    <Dialog
      open={isOpen && !!trial}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>⚔️ Crystal Trial — Level {trial?.targetLevel}</DialogTitle>
          <DialogDescription>{trial?.topicId}</DialogDescription>
        </DialogHeader>

        <div className="-mx-4 max-h-full overflow-y-auto px-4">
          {trialStatus === 'awaiting_player' && !isSubmitted && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="text-6xl">🔮</div>
              <div className="text-center">
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Crystal Trial Ready
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Answer {questions.length} scenario-based questions to prove
                  you can apply your knowledge. You need 80% to pass.
                </p>
                {!canStartTrial && xpUntilTrialReady > 0 ? (
                  <p className="text-xs text-muted-foreground">{xpUntilTrialReady} XP left</p>
                ) : null}
              </div>
              <Button onClick={handleStartTrial} size="lg" disabled={!canStartTrial}>
                Begin Trial
              </Button>
            </div>
          )}

          {(trialStatus === 'in_progress' || trialStatus === 'passed' || isSubmitted) && currentQuestion && (
            <TrialQuestionCard
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={questions.length}
              selectedAnswer={answers[currentQuestion.id] ?? null}
              onSelectAnswer={handleSelectAnswer}
              isSubmitted={isReviewResult}
            />
          )}

          {completedResult && completedResult.passed && currentQuestionIndex === questions.length - 1 && (
            <div className="mt-6 pt-6 border-t border-border">
              <TrialResultsView
                result={completedResult}
                targetLevel={trial?.targetLevel ?? 0}
                onLevelUp={handleLevelUp}
                onClose={handleClose}
              />
            </div>
          )}

          {trialStatus === 'pregeneration' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="animate-pulse text-4xl">🔮</div>
              <p className="text-sm text-muted-foreground">Generating trial questions...</p>
            </div>
          )}

          {trialStatus === 'failed' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="text-4xl">⚠️</div>
              <p className="text-sm text-muted-foreground">Failed to generate trial. Please try again.</p>
            </div>
          )}
        </div>

        {trialStatus === 'in_progress' && !isSubmitted && (
          <DialogFooter className="flex-row items-center justify-between sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={currentQuestionIndex === 0}
              onClick={handlePrev}
            >
              ← Previous
            </Button>

            <div className="flex gap-1.5">
              {questions.map((q: CrystalTrialScenarioQuestion, i: number) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentQuestionIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    i === currentQuestionIndex
                      ? 'bg-violet-500'
                      : answers[q.id]
                        ? 'bg-muted-foreground'
                        : 'bg-muted'
                  }`}
                />
              ))}
            </div>

            {currentQuestionIndex < questions.length - 1 ? (
              <Button variant="outline" size="sm" onClick={handleNext}>
                Next →
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!allAnswered}
                onClick={handleSubmit}
              >
                Submit Trial
              </Button>
            )}
          </DialogFooter>
        )}

        {completedResult && completedResult.passed && (
          <DialogFooter className="flex-row items-center justify-between sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={currentQuestionIndex === 0}
              onClick={handlePrev}
            >
              ← Previous
            </Button>

            <div className="flex gap-1.5">
              {questions.map((q: CrystalTrialScenarioQuestion, i: number) => {
                const b = completedResult?.breakdown.find(
                  (x: CrystalTrialResult['breakdown'][number]) => x.questionId === q.id,
                );
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentQuestionIndex(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      i === currentQuestionIndex
                        ? 'bg-violet-500'
                        : b?.isCorrect
                          ? 'bg-emerald-500'
                          : 'bg-red-500'
                    }`}
                  />
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={currentQuestionIndex === questions.length - 1}
              onClick={handleNext}
            >
                Next →
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
