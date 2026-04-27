'use client';

import React, { useEffect, useRef, useState } from 'react';

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
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { StudyPanelStateViews } from './studyPanel/StudyPanelStateViews';
import { StudyPanelStudyView } from './studyPanel/StudyPanelStudyView';
import { useStudyPanelModel } from '../hooks/useStudyPanelModel';
import { useStudyKeyboardShortcuts } from '../hooks/useStudyKeyboardShortcuts';
import { useStudyFormulaLlmExplain } from '../hooks/useStudyFormulaLlmExplain';
import { useStudyQuestionMermaidDiagram } from '../hooks/useStudyQuestionMermaidDiagram';
import { useStudyQuestionLlmExplain } from '../hooks/useStudyQuestionLlmExplain';
import { useInferenceTtsToggle } from '../hooks/useInferenceTtsToggle';
import { useReasoningToggle } from '../hooks/useReasoningToggle';
import { StudyPanelTab } from './studyPanel/types';
import { MiniGameView } from './miniGames/MiniGameView';
import type { MiniGameContent } from '../types/core';
import { cardRefKey } from '@/lib/topicRef';
import { RatingFeedbackCanvas, type RatingFeedbackCanvasHandle } from './studyPanel/RatingFeedbackCanvas';
import { useRatingFeedback } from '@/hooks/useRatingFeedback';
import { uiStore } from '@/store/uiStore';
import { makeOpenRouterProviderSelector } from '../infrastructure/llmInferenceSurfaceProviders';
import { Settings } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<StudyPanelTab>('study');
  const currentSession = useStudyStore((state) => state.currentSession);

  const model = useStudyPanelModel({ currentCardId, currentTopicId, currentSubjectId, totalCards });
  const explainReasoning = useReasoningToggle('studyQuestionExplain');
  const formulaReasoning = useReasoningToggle('studyFormulaExplain');
  const mermaidReasoning = useReasoningToggle('studyQuestionMermaid');
  const explainReasoningSupported = useStudySettingsStore(
    makeOpenRouterProviderSelector('studyQuestionExplain'),
  );
  const formulaReasoningSupported = useStudySettingsStore(
    makeOpenRouterProviderSelector('studyFormulaExplain'),
  );
  const mermaidReasoningSupported = useStudySettingsStore(
    makeOpenRouterProviderSelector('studyQuestionMermaid'),
  );
  const ttsEnabled = useInferenceTtsToggle();
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
  const llmMermaidDiagram = useStudyQuestionMermaidDiagram({
    topicLabel: model.resolvedTopic,
    questionText: model.currentQuestion,
    cardId: model.activeCard?.id ?? null,
    reasoningFromUserToggle: mermaidReasoning.enableReasoning,
  });

  useEffect(() => {
    if (!isOpen || activeTab !== 'study' || !model.renderedCard) {
      llmExplain.cancelInflight();
      llmFormulaExplain.cancelInflight();
      llmMermaidDiagram.cancelInflight();
    }
  }, [isOpen, activeTab, model.renderedCard, llmExplain.cancelInflight, llmFormulaExplain.cancelInflight, llmMermaidDiagram.cancelInflight]);

  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const systemPromptRef = useRef<HTMLPreElement>(null);
  const previousActiveTabRef = useRef<StudyPanelTab>('study');
  const feedbackCanvasRef = useRef<RatingFeedbackCanvasHandle>(null);
  const studyCardContainerRef = useRef<HTMLDivElement>(null);
  const { triggerForRating, triggerForChoice } = useRatingFeedback({
    canvasRef: feedbackCanvasRef,
    cardRef: studyCardContainerRef,
  });

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

  useStudyKeyboardShortcuts(handleUndo, handleRedo, model.canUndo, model.canRedo);

  useEffect(() => {
    if (previousActiveTabRef.current !== activeTab) {
      telemetry.log('study_panel_tab_switched', {
        topicId: currentSession?.topicId ?? currentTopicId,
        sessionId: currentSession?.sessionId ?? null,
        tab: activeTab,
        fromTab: previousActiveTabRef.current,
        toTab: activeTab,
      }, {
        topicId: currentSession?.topicId ?? currentTopicId,
        sessionId: currentSession?.sessionId ?? null,
      });
      previousActiveTabRef.current = activeTab;
    }
  }, [activeTab, currentSession?.sessionId, currentSession?.topicId, currentTopicId]);

  useEffect(() => {
    if (!model.resolvedTopicId || (activeTab === 'theory' && !model.hasTheory)) setActiveTab('study');
  }, [activeTab, model.hasTheory, model.resolvedTopicId]);

  useEffect(() => {
    setSelectedAnswers([]); setIsAnswerSubmitted(false); setIsCorrect(false); setIsRevealed(false);
  }, [model.activeCard?.id]);

  useEffect(() => { applySubmissionStateFromSession(); }, [currentSession?.attempts?.length, currentSession?.currentCardId]);
  useEffect(() => { if (!isOpen) { setSelectedAnswers([]); setIsAnswerSubmitted(false); setIsCorrect(false); setIsRevealed(false); } }, [isOpen]);

  const handleSelectSystemPrompt = () => {
    const el = systemPromptRef.current;
    if (!el) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  };

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
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <DialogContent className="max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="sr-only" data-testid="study-session-title">📚 Study Session</DialogTitle>
          <DialogDescription className="sr-only">
            Review cards, answer prompts, and track your study session progress.
          </DialogDescription>
          <div className="flex items-center justify-center gap-2">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StudyPanelTab)}>
              <TabsList className="mx-auto">
                <TabsTrigger value="study" data-testid="study-tab-study">📖 Study</TabsTrigger>
                {model.hasTheory && (
                  <TabsTrigger value="theory" data-testid="study-tab-theory">💡 Theory</TabsTrigger>
                )}
                <TabsTrigger
                  value="system_prompt"
                  disabled={!model.resolvedTopicId}
                  data-testid="study-tab-system-prompt"
                >🧠</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => uiStore.getState().openGlobalSettings()}
              aria-label="Open global settings"
              data-testid="study-tab-settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogHeader>
        <div data-testid="study-panel-modal-content" className="-mx-4 px-4 overflow-y-auto">
          <StudyPanelStateViews
            activeTab={activeTab}
            hasTheory={model.hasTheory}
            isEmptyDeck={model.isEmptyDeck}
            isLoadingCards={model.isLoadingCards}
            isCardsLoadError={model.isCardsLoadError}
            hasActiveCard={model.hasActiveCard}
            isCompleted={model.isCompleted}
            resolvedTopicTheory={model.resolvedTopicTheory}
            resolvedTopic={model.resolvedTopic}
            topicSystemPrompt={model.topicSystemPrompt}
            onClose={onClose}
            onSystemPromptSelect={handleSelectSystemPrompt}
            systemPromptRef={systemPromptRef}
          />

          {model.renderedCard && activeTab === 'study' && (
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
                  onSelectAnswer={handleAnswerSelect}
                  onChoiceSubmit={handleChoiceSubmit}
                  onChoiceContinue={handleChoiceContinue}
                  onCoarseRate={handleCoarseRate}
                  onHintUsed={handleHintUsed}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={model.canUndo}
                  canRedo={model.canRedo}
                  undoCount={model.undoCount}
                  redoCount={model.redoCount}
                  llmExplain={llmExplain}
                  llmFormulaExplain={llmFormulaExplain}
                  llmMermaidDiagram={llmMermaidDiagram}
                  explainReasoningEnabled={explainReasoning.enableReasoning}
                  explainReasoningToggleDisabled={!explainReasoningSupported}
                  formulaReasoningEnabled={formulaReasoning.enableReasoning}
                  formulaReasoningToggleDisabled={!formulaReasoningSupported}
                  mermaidReasoningEnabled={mermaidReasoning.enableReasoning}
                  mermaidReasoningToggleDisabled={!mermaidReasoningSupported}
                  onToggleExplainReasoning={explainReasoning.toggleReasoning}
                  onToggleFormulaReasoning={formulaReasoning.toggleReasoning}
                  onToggleMermaidReasoning={mermaidReasoning.toggleReasoning}
                  explainTtsEnabled={ttsEnabled.enableTts}
                  formulaTtsEnabled={ttsEnabled.enableTts}
                  mermaidTtsEnabled={ttsEnabled.enableTts}
                  onToggleExplainTts={ttsEnabled.toggleTts}
                  onToggleFormulaTts={ttsEnabled.toggleTts}
                  onToggleMermaidTts={ttsEnabled.toggleTts}
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
