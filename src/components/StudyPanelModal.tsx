'use client';

import React, { useEffect, useRef, useState } from 'react';

import { Rating } from '../types';
import { getRatingColor, getRatingLabel, useProgressionStore as useStudyStore } from '../features/progression';
import { evaluateAnswer as evaluateChoiceAnswer } from '../features/content';
import { telemetry } from '../features/telemetry';
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  AGENT_PERSONALITY_OPTIONS,
  OPENAI_COMPATIBLE_MODEL_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  useStudySettingsStore,
} from '../store/studySettingsStore';
import { StudyPanelStateViews } from './studyPanel/StudyPanelStateViews';
import { StudyPanelStudyView } from './studyPanel/StudyPanelStudyView';
import { useStudyPanelModel } from '../hooks/useStudyPanelModel';
import { useStudyKeyboardShortcuts } from '../hooks/useStudyKeyboardShortcuts';
import { useStudyFormulaLlmExplain } from '../hooks/useStudyFormulaLlmExplain';
import { useStudyQuestionMermaidDiagram } from '../hooks/useStudyQuestionMermaidDiagram';
import { useStudyQuestionLlmExplain } from '../hooks/useStudyQuestionLlmExplain';
import { useInferenceTtsToggle } from '../hooks/useInferenceTtsToggle';
import { useThinkingToggle } from '../hooks/useThinkingToggle';
import { StudyPanelTab } from './studyPanel/types';
import { MiniGameView } from './miniGames/MiniGameView';
import type { MiniGameContent } from '../types/core';

interface StudyPanelModalProps {
  isOpen: boolean;
  currentCardId: string | null;
  currentTopicId: string | null;
  isCardFlipped: boolean;
  totalCards: number;
  onClose: () => void;
  onFlip: () => void;
  onSubmitResult: (cardId: string, isCorrect?: boolean, rating?: Rating) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function StudyPanelModal({
  isOpen,
  currentCardId,
  currentTopicId,
  isCardFlipped,
  totalCards,
  onClose,
  onFlip,
  onSubmitResult,
  onUndo,
  onRedo,
}: StudyPanelModalProps) {
  const [activeTab, setActiveTab] = useState<StudyPanelTab>('study');
  const targetAudience = useStudySettingsStore((state) => state.targetAudience);
  const setTargetAudience = useStudySettingsStore((state) => state.setTargetAudience);
  const agentPersonality = useStudySettingsStore((state) => state.agentPersonality);
  const setAgentPersonality = useStudySettingsStore((state) => state.setAgentPersonality);
  const openAiCompatibleModelId = useStudySettingsStore((state) => state.openAiCompatibleModelId);
  const setOpenAiCompatibleModelId = useStudySettingsStore((state) => state.setOpenAiCompatibleModelId);
  const openAiCompatibleChatUrl = useStudySettingsStore((state) => state.openAiCompatibleChatUrl);
  const setOpenAiCompatibleChatUrl = useStudySettingsStore((state) => state.setOpenAiCompatibleChatUrl);
  const openAiCompatibleApiKey = useStudySettingsStore((state) => state.openAiCompatibleApiKey);
  const setOpenAiCompatibleApiKey = useStudySettingsStore((state) => state.setOpenAiCompatibleApiKey);
  const currentSession = useStudyStore((state) => state.currentSession);

  const model = useStudyPanelModel({
    currentCardId,
    currentTopicId,
    totalCards,
  });
  const explainThinking = useThinkingToggle('studyQuestionExplain');
  const formulaThinking = useThinkingToggle('studyFormulaExplain');
  const mermaidThinking = useThinkingToggle('studyQuestionMermaid');
  const explainTts = useInferenceTtsToggle('studyQuestionExplain');
  const formulaTts = useInferenceTtsToggle('studyFormulaExplain');
  const mermaidTts = useInferenceTtsToggle('studyQuestionMermaid');
  const llmExplain = useStudyQuestionLlmExplain({
    topicLabel: model.resolvedTopic,
    questionText: model.currentQuestion,
    cardId: model.activeCard?.id ?? null,
    enableThinking: explainThinking.enableThinking,
  });
  const llmFormulaExplain = useStudyFormulaLlmExplain({
    topicLabel: model.resolvedTopic,
    cardQuestionText: model.currentQuestion,
    cardId: model.activeCard?.id ?? null,
    enableThinking: formulaThinking.enableThinking,
  });
  const llmMermaidDiagram = useStudyQuestionMermaidDiagram({
    topicLabel: model.resolvedTopic,
    questionText: model.currentQuestion,
    cardId: model.activeCard?.id ?? null,
    enableThinking: mermaidThinking.enableThinking,
  });

  useEffect(() => {
    if (!isOpen || activeTab !== 'study' || !model.renderedCard) {
      llmExplain.cancelInflight();
      llmFormulaExplain.cancelInflight();
      llmMermaidDiagram.cancelInflight();
    }
  }, [
    isOpen,
    activeTab,
    model.renderedCard,
    llmExplain.cancelInflight,
    llmFormulaExplain.cancelInflight,
    llmMermaidDiagram.cancelInflight,
  ]);

  useStudyKeyboardShortcuts(onUndo, onRedo, model.canUndo, model.canRedo);

  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const systemPromptRef = useRef<HTMLPreElement>(null);
  const previousActiveTabRef = useRef<StudyPanelTab>('study');

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
    if (!model.resolvedTopicId || (activeTab === 'theory' && !model.hasTheory)) {
      setActiveTab('study');
    }
  }, [activeTab, model.hasTheory, model.resolvedTopicId]);

  useEffect(() => {
    setSelectedAnswers([]);
    setIsAnswerSubmitted(false);
    setIsCorrect(false);
  }, [model.activeCard?.id]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedAnswers([]);
      setIsAnswerSubmitted(false);
      setIsCorrect(false);
    }
  }, [isOpen]);

  const handleSelectSystemPrompt = () => {
    const promptElement = systemPromptRef.current;
    if (!promptElement) return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(promptElement);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleAnswerSelect = (answer: string) => {
    if (isAnswerSubmitted || !model.renderedCard) return;

    if (model.isSingleChoice) {
      setSelectedAnswers([answer]);
      return;
    }

    if (model.isMultiChoice) {
      setSelectedAnswers((previous) => {
        if (previous.includes(answer)) {
          return previous.filter((a) => a !== answer);
        }
        return [...previous, answer];
      });
    }
  };

  const handleChoiceSubmit = () => {
    const activeCard = model.activeCard;
    if (!activeCard) return;

    const nextIsCorrect = evaluateChoiceAnswer(activeCard, selectedAnswers);
    setIsCorrect(nextIsCorrect);
    setIsAnswerSubmitted(true);
  };

  const handleChoiceContinue = () => {
    const cardId = model.activeCard?.id || currentCardId || currentSession?.currentCardId || null;
    if (!cardId) return;

    onSubmitResult(cardId, isCorrect);
    setSelectedAnswers([]);
    setIsAnswerSubmitted(false);
    setIsCorrect(false);
  };

  const handleRating = (rating: Rating) => {
    const cardId = model.activeCard?.id || currentCardId || currentSession?.currentCardId || null;
    if (!cardId) return;

    onSubmitResult(cardId, undefined, rating);
  };

  const handleMiniGameComplete = (miniGameIsCorrect: boolean) => {
    setIsCorrect(miniGameIsCorrect);
  };

  const handleMiniGameContinue = () => {
    const cardId = model.activeCard?.id || currentCardId || currentSession?.currentCardId || null;
    if (!cardId) return;

    onSubmitResult(cardId, isCorrect);
  };

  if (!isOpen) return null;

  return (
    <AbyssDialog
      modal={false}
      lockScroll
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AbyssDialogContent
        className="max-h-[95vh] flex flex-col"
      >
      <DialogHeader>
        <DialogTitle className="sr-only" data-testid="study-session-title">
          📚 Study Session
        </DialogTitle>
        <DialogDescription className="sr-only">
          Review cards, answer prompts, and track your study session progress.
        </DialogDescription>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StudyPanelTab)}>
            <TabsList className="mx-auto">
              <TabsTrigger value="study" data-testid="study-tab-study">
                📖 Study
              </TabsTrigger>
              {model.hasTheory && (
                <TabsTrigger value="theory" data-testid="study-tab-theory">
                  💡 Theory
                </TabsTrigger>
              )}
              <TabsTrigger
                value="system_prompt"
                disabled={!model.resolvedTopicId}
                data-testid="study-tab-system-prompt"
              >
                🧠
              </TabsTrigger>
              <TabsTrigger value="settings" data-testid="study-tab-settings">
                ⚙️
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
            targetAudience={targetAudience}
            targetAudienceOptions={TARGET_AUDIENCE_OPTIONS}
            agentPersonality={agentPersonality}
            agentPersonalityOptions={AGENT_PERSONALITY_OPTIONS}
            onClose={onClose}
            onSetTargetAudience={setTargetAudience}
            onSetAgentPersonality={setAgentPersonality}
            openAiCompatibleModelId={openAiCompatibleModelId}
            openAiCompatibleModelOptions={OPENAI_COMPATIBLE_MODEL_OPTIONS}
            onSetOpenAiCompatibleModelId={setOpenAiCompatibleModelId}
            openAiCompatibleChatUrl={openAiCompatibleChatUrl}
            onSetOpenAiCompatibleChatUrl={setOpenAiCompatibleChatUrl}
            openAiCompatibleApiKey={openAiCompatibleApiKey}
            onSetOpenAiCompatibleApiKey={setOpenAiCompatibleApiKey}
            onSystemPromptSelect={handleSelectSystemPrompt}
            systemPromptRef={systemPromptRef}
          />

          {model.renderedCard && activeTab === 'study' && model.isMiniGame && model.renderedCard.miniGame && (
            <MiniGameView
              content={model.renderedCard.miniGame as MiniGameContent}
              onComplete={handleMiniGameComplete}
              onContinue={handleMiniGameContinue}
            />
          )}

          {model.renderedCard && activeTab === 'study' && !model.isMiniGame && (
            <StudyPanelStudyView
              renderedCard={model.renderedCard}
              isFlashcard={model.isFlashcard}
              isSingleChoice={model.isSingleChoice}
              isMultiChoice={model.isMultiChoice}
              isChoiceQuestion={model.isChoiceQuestion}
              selectedAnswers={selectedAnswers}
              isAnswerSubmitted={isAnswerSubmitted}
              isCorrect={isCorrect}
              isCardFlipped={isCardFlipped}
              sm2State={model.sm2State}
              activeCard={model.activeCard}
              onSelectAnswer={handleAnswerSelect}
              onChoiceSubmit={handleChoiceSubmit}
              onChoiceContinue={handleChoiceContinue}
              onFlip={onFlip}
              onRate={handleRating}
              getRatingLabel={getRatingLabel}
              getRatingColor={getRatingColor}
              onUndo={onUndo}
              onRedo={onRedo}
              canUndo={model.canUndo}
              canRedo={model.canRedo}
              undoCount={model.undoCount}
              redoCount={model.redoCount}
              llmExplain={llmExplain}
              llmFormulaExplain={llmFormulaExplain}
              llmMermaidDiagram={llmMermaidDiagram}
              explainThinkingEnabled={explainThinking.enableThinking}
              formulaThinkingEnabled={formulaThinking.enableThinking}
              mermaidThinkingEnabled={mermaidThinking.enableThinking}
              onToggleExplainThinking={explainThinking.toggleThinking}
              onToggleFormulaThinking={formulaThinking.toggleThinking}
              onToggleMermaidThinking={mermaidThinking.toggleThinking}
              explainTtsEnabled={explainTts.enableTts}
              formulaTtsEnabled={formulaTts.enableTts}
              mermaidTtsEnabled={mermaidTts.enableTts}
              onToggleExplainTts={explainTts.toggleTts}
              onToggleFormulaTts={formulaTts.toggleTts}
              onToggleMermaidTts={mermaidTts.toggleTts}
            />
          )}
      </div>
      </AbyssDialogContent>
    </AbyssDialog>
  );
}

export default StudyPanelModal;
