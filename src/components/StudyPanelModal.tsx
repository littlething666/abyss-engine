'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { CoarseChoice, Rating, type CoarseRatingResult } from '../types';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { evaluateAnswer as evaluateChoiceAnswer } from '../features/content';
import { telemetry } from '../features/telemetry';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StudyPanelStateViews } from './studyPanel/StudyPanelStateViews';
import { StudyPanelStudyView } from './studyPanel/StudyPanelStudyView';
import { useStudyPanelModel } from '../hooks/useStudyPanelModel';
import { useStudyKeyboardShortcuts } from '../hooks/useStudyKeyboardShortcuts';
import { useStudyFormulaLlmExplain } from '../hooks/useStudyFormulaLlmExplain';
import { useStudyQuestionLlmExplain } from '../hooks/useStudyQuestionLlmExplain';
import { useInferenceTtsToggle } from '../hooks/useInferenceTtsToggle';
import { useReasoningToggle } from '../hooks/useReasoningToggle';
import { MiniGameView } from './miniGames/MiniGameView';
import type { MiniGameContent } from '../types/core';
import { cardRefKey } from '@/lib/topicRef';
import { RatingFeedbackCanvas, type RatingFeedbackCanvasHandle } from './studyPanel/RatingFeedbackCanvas';
import { useRatingFeedback } from '@/hooks/useRatingFeedback';
import { makeOpenRouterProviderSelector } from '../infrastructure/llmInferenceSurfaceProviders';
import { useStudySettingsStore } from '@/store/studySettingsStore';

interface StudyPanelModalProps {
  isOpen: boolean;
  currentCardId: string | null;
  currentTopicId: string | null;
  currentSubjectId: string | null;
  totalCards: number;
  onClose: () => void;
  onSubmitResult: (cardId: string, isCorrect?: boolean, rating?: Rating) => void;
  onSubmitCoarseResult: (cardId: string, coarseChoice: CoarseChoice) => CoarseRatingResult | null;
  onAdvance: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function StudyPanelModal({
  isOpen,
  currentCardId,
  currentTopicId,
  currentSubjectId,
  totalCards,
  onClose,
  onSubmitResult,
  onSubmitCoarseResult,
  onAdvance,
  onUndo,
  onRedo,
}: StudyPanelModalProps) {
  const currentSession = useStudyStore((state) => state.currentSession);

  const model = useStudyPanelModel({ currentCardId, currentTopicId, currentSubjectId, totalCards });
  const explainReasoning = useReasoningToggle('studyQuestionExplain');
  const formulaReasoning = useReasoningToggle('studyFormulaExplain');
  const explainReasoningSupported = useStudySettingsStore(
    makeOpenRouterProviderSelector('studyQuestionExplain'),
  );
  const formulaReasoningSupported = useStudySettingsStore(
    makeOpenRouterProviderSelector('studyFormulaExplain'),
  );
  const ttsEnabled = useInferenceTtsToggle();
  const showStudyHistoryControls = useStudySettingsStore((s) => s.showStudyHistoryControls);
  const llmExplain = useStudyQuestionLlmExplain({
    topicLabel: model.resolvedTopic,
    questionText: model.currentQuestion,
    cardId: model.activeCard?.id ?? null,
    reasoningFromUserToggle: explainReasoning.enableReasoning,
  });
  const llmFormulaExplain = useStudyFormulaLlmExplain({
    topicLabel: model.resolvedTopic,
    cardQuestionText: model.currentQuestion,
    cardId: model.activeCard?.id ?? null,
    reasoningFromUserToggle: formulaReasoning.enableReasoning,
  });

  useEffect(() => {
    if (!isOpen || !model.renderedCard) {
      llmExplain.cancelInflight();
      llmFormulaExplain.cancelInflight();
    }
  }, [isOpen, model.renderedCard, llmExplain.cancelInflight, llmFormulaExplain.cancelInflight]);

  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const feedbackCanvasRef = useRef<RatingFeedbackCanvasHandle>(null);
  const studyCardContainerRef = useRef<HTMLDivElement>(null);
  const { triggerForRating, triggerForChoice } = useRatingFeedback({
    canvasRef: feedbackCanvasRef,
    cardRef: studyCardContainerRef,
  });

  const handleClose = useCallback(() => {
    const session = useStudyStore.getState().currentSession;
    if (session) {
      const attemptsCompleted = session.attempts?.length ?? 0;
      const sessionTotalCards = session.totalCards ?? 0;
      const isAbandoned = attemptsCompleted > 0 && attemptsCompleted < sessionTotalCards;
      if (isAbandoned) {
        const startedAt = session.startedAt ?? Date.now();
        telemetry.log(
          'study-session:abandoned',
          {
            sessionId: session.sessionId,
            subjectId: session.subjectId,
            topicId: session.topicId,
            attemptsCompleted,
            totalCards: sessionTotalCards,
            sessionDurationMs: Math.max(0, Date.now() - startedAt),
          },
          {
            sessionId: session.sessionId,
            subjectId: session.subjectId,
            topicId: session.topicId,
          },
        );
      }
    }
    onClose();
  }, [onClose]);

  const applySubmissionStateFromSession = () => {
    const currentCardKey = currentSession?.currentCardId;
    const attempts = currentSession?.attempts ?? [];
    const hasSubmittedCurrentCard = attempts.some((a) => a.cardId === currentCardKey);
    setIsAnswerSubmitted(hasSubmittedCurrentCard);
    setIsRevealed(hasSubmittedCurrentCard);
    setIsCorrect(false);
  };

  const handleUndo = () => { onUndo(); applySubmissionStateFromSession(); };
  const handleRedo = () => { onRedo(); applySubmissionStateFromSession(); };

  // Visual undo/redo affordances were removed as part of the visual-clutter cleanup;
  // the keyboard shortcut path is the only undo/redo entry point and is gated behind
  // the optional `showStudyHistoryControls` setting (Global Settings -> Preferences).
  useStudyKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo: model.canUndo,
    canRedo: model.canRedo,
    enabled: isOpen && showStudyHistoryControls,
  });

  useEffect(() => {
    setSelectedAnswers([]); setIsAnswerSubmitted(false); setIsCorrect(false); setIsRevealed(false);
  }, [model.activeCard?.id]);

  useEffect(() => { applySubmissionStateFromSession(); }, [currentSession?.attempts?.length, currentSession?.currentCardId]);
  useEffect(() => { if (!isOpen) { setSelectedAnswers([]); setIsAnswerSubmitted(false); setIsCorrect(false); setIsRevealed(false); } }, [isOpen]);

  const handleAnswerSelect = (answer: string) => {
    if (isAnswerSubmitted || !model.renderedCard) return;
    if (model.isSingleChoice) { setSelectedAnswers([answer]); return; }
    if (model.isMultiChoice) {
      setSelectedAnswers((prev) => prev.includes(answer) ? prev.filter((a) => a !== answer) : [...prev, answer]);
    }
  };

  const resolveSubmitCardKey = (): string | null => {
    if (currentSession?.currentCardId) return currentSession.currentCardId;
    if (currentCardId) return currentCardId;
    const subjectId = currentSubjectId ?? currentSession?.subjectId ?? null;
    const topicId = currentTopicId ?? currentSession?.topicId ?? null;
    const rawId = model.activeCard?.id;
    if (subjectId && topicId && rawId) return cardRefKey({ subjectId, topicId, cardId: rawId });
    return null;
  };

  const submitResultWithFeedback = (cardKey: string, rating?: Rating, ic?: boolean) => {
    if (typeof rating === 'number') triggerForRating(rating);
    else if (typeof ic === 'boolean') triggerForChoice(ic);
    onSubmitResult(cardKey, ic, rating);
  };

  const handleHintUsed = () => {
    const cardKey = resolveSubmitCardKey();
    if (!cardKey) return;
    useStudyStore.getState().markHintUsed(cardKey);
  };

  const handleChoiceSubmit = () => {
    const activeCard = model.activeCard;
    if (!activeCard) return;
    const nextIsCorrect = evaluateChoiceAnswer(activeCard, selectedAnswers);
    const cardKey = resolveSubmitCardKey();
    if (!cardKey) return;
    setIsCorrect(nextIsCorrect);
    setIsAnswerSubmitted(true);
    submitResultWithFeedback(cardKey, undefined, nextIsCorrect);
    setIsRevealed(true);
  };

  const handleChoiceContinue = () => {
    setSelectedAnswers([]); setIsAnswerSubmitted(false); setIsCorrect(false); setIsRevealed(false);
    onAdvance();
  };

  const handleCoarseRate = (coarseChoice: CoarseChoice) => {
    const cardKey = resolveSubmitCardKey();
    if (!cardKey) return;
    const result = onSubmitCoarseResult(cardKey, coarseChoice);
    if (!result) return;
    triggerForRating(result.rating);
    setIsCorrect(result.rating >= 3);
    setIsAnswerSubmitted(true);
    setIsRevealed(true);
  };

  const handleMiniGameComplete = (ic: boolean) => {
    setIsCorrect(ic);
    const cardKey = resolveSubmitCardKey();
    if (!cardKey) return;
    submitResultWithFeedback(cardKey, undefined, ic);
    setIsRevealed(true);
  };
  const handleMiniGameContinue = () => { setIsRevealed(false); setIsCorrect(false); onAdvance(); };

  if (!isOpen) return null;

  return (
    <Dialog
      modal={false}
      open={isOpen}
      onOpenChange={(open) => { if (!open) handleClose(); }}
    >
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden rounded-none sm:h-[95dvh] sm:max-h-[95dvh] sm:rounded-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="sr-only" data-testid="study-session-title">📚 Study Session</DialogTitle>
          <DialogDescription className="sr-only">
            Review cards, answer prompts, and track your study session progress.
          </DialogDescription>
        </DialogHeader>
        <div data-testid="study-panel-modal-content" className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <StudyPanelStateViews
            isEmptyDeck={model.isEmptyDeck}
            isLoadingCards={model.isLoadingCards}
            isCardsLoadError={model.isCardsLoadError}
            hasActiveCard={model.hasActiveCard}
            isCompleted={model.isCompleted}
            onClose={handleClose}
          />

          {model.renderedCard && (
            <div ref={studyCardContainerRef} className="relative">
              <RatingFeedbackCanvas ref={feedbackCanvasRef} containerRef={studyCardContainerRef} />
              {model.isMiniGame && model.renderedCard.miniGame ? (
                <MiniGameView
                  key={currentSession?.currentCardId ?? 'none'}
                  content={model.renderedCard.miniGame as MiniGameContent}
                  isRevealed={isRevealed}
                  onSubmit={handleMiniGameComplete}
                  onContinue={handleMiniGameContinue}
                />
              ) : (
                <StudyPanelStudyView
                  renderedCard={model.renderedCard}
                  isFlashcard={model.isFlashcard}
                  isSingleChoice={model.isSingleChoice}
                  isMultiChoice={model.isMultiChoice}
                  isChoiceQuestion={model.isChoiceQuestion}
                  selectedAnswers={selectedAnswers}
                  isAnswerSubmitted={isAnswerSubmitted}
                  isCorrect={isCorrect}
                  isRevealed={isRevealed}
                  sm2State={model.sm2State}
                  activeCard={model.activeCard}
                  topicSystemPrompt={model.topicSystemPrompt}
                  resolvedTopic={model.resolvedTopic}
                  onSelectAnswer={handleAnswerSelect}
                  onChoiceSubmit={handleChoiceSubmit}
                  onChoiceContinue={handleChoiceContinue}
                  onCoarseRate={handleCoarseRate}
                  onHintUsed={handleHintUsed}
                  llmExplain={llmExplain}
                  llmFormulaExplain={llmFormulaExplain}
                  explainReasoningEnabled={explainReasoning.enableReasoning}
                  explainReasoningToggleDisabled={!explainReasoningSupported}
                  formulaReasoningEnabled={formulaReasoning.enableReasoning}
                  formulaReasoningToggleDisabled={!formulaReasoningSupported}
                  onToggleExplainReasoning={explainReasoning.toggleReasoning}
                  onToggleFormulaReasoning={formulaReasoning.toggleReasoning}
                  explainTtsEnabled={ttsEnabled.enableTts}
                  formulaTtsEnabled={ttsEnabled.enableTts}
                  onToggleExplainTts={ttsEnabled.toggleTts}
                  onToggleFormulaTts={ttsEnabled.toggleTts}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudyPanelModal;
