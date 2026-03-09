'use client';

import React, { useEffect, useRef, useState } from 'react';

import { Rating } from '../types';
import {
  getRatingColor,
  getRatingLabel,
  useProgressionStore as useStudyStore,
} from '../features/progression';
import { evaluateAnswer as evaluateChoiceAnswer } from '../features/content';
import { ModalWrapper } from './ui/modal-wrapper';
import { TARGET_AUDIENCE_OPTIONS, useStudySettingsStore } from '../store/studySettingsStore';
import { StudyPanelHeader, StudyPanelTab } from './studyPanel/StudyPanelHeader';
import { StudyPanelStateViews } from './studyPanel/StudyPanelStateViews';
import { StudyPanelStudyView } from './studyPanel/StudyPanelStudyView';
import { useStudyPanelModel } from '../hooks/useStudyPanelModel';

interface StudyPanelModalProps {
  isOpen: boolean;
  currentCardId: string | null;
  currentTopicId: string | null;
  isCardFlipped: boolean;
  totalCards: number;
  feedbackMessage?: string | null;
  levelUpMessage?: string | null;
  onClose: () => void;
  onFlip: () => void;
  onSubmitResult: (cardId: string, isCorrect?: boolean, rating?: Rating) => void;
}

export function StudyPanelModal({
  isOpen,
  currentCardId,
  currentTopicId,
  isCardFlipped,
  totalCards,
  feedbackMessage,
  levelUpMessage,
  onClose,
  onFlip,
  onSubmitResult,
}: StudyPanelModalProps) {
  const [activeTab, setActiveTab] = useState<StudyPanelTab>('study');
  const targetAudience = useStudySettingsStore((state) => state.targetAudience);
  const setTargetAudience = useStudySettingsStore((state) => state.setTargetAudience);
  const currentSession = useStudyStore((state) => state.currentSession);

  const model = useStudyPanelModel({
    currentCardId,
    currentTopicId,
    totalCards,
  });

  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const systemPromptRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  return (
    <ModalWrapper onClose={onClose} panelClassName="w-[min(95%,60rem)]">
      <div data-testid="study-panel-modal-content">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-transparent border-none text-slate-400 text-2xl cursor-pointer leading-none p-1 hover:text-slate-200 transition-colors z-30"
          aria-label="Close modal"
        >
          ×
        </button>

        <StudyPanelHeader
          activeTab={activeTab}
          hasTheory={model.hasTheory}
          resolvedTopicId={model.resolvedTopicId}
          onTabChange={setActiveTab}
        />

        <StudyPanelStateViews
          levelUpMessage={levelUpMessage}
          activeTab={activeTab}
          hasTheory={model.hasTheory}
          isEmptyDeck={model.isEmptyDeck}
          isLoadingCards={model.isLoadingCards}
          isCardsLoadError={model.isCardsLoadError}
          hasActiveCard={model.hasActiveCard}
          isCompleted={model.isCompleted}
          resolvedTopicTheory={model.resolvedTopicTheory}
          topicSystemPrompt={model.topicSystemPrompt}
          targetAudience={targetAudience}
          targetAudienceOptions={TARGET_AUDIENCE_OPTIONS}
          onClose={onClose}
          onSetTargetAudience={setTargetAudience}
          onSystemPromptSelect={handleSelectSystemPrompt}
          systemPromptRef={systemPromptRef}
        />

        {model.renderedCard && activeTab === 'study' && (
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
            feedbackMessage={feedbackMessage}
            sm2State={model.sm2State}
            activeCard={model.activeCard}
            onSelectAnswer={handleAnswerSelect}
            onChoiceSubmit={handleChoiceSubmit}
            onChoiceContinue={handleChoiceContinue}
            onFlip={onFlip}
            onRate={handleRating}
            getRatingLabel={getRatingLabel}
            getRatingColor={getRatingColor}
          />
        )}
      </div>
    </ModalWrapper>
  );
}

export default StudyPanelModal;
