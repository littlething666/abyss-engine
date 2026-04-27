'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { StudyFormulaExplainContext } from '../features/studyPanel/formulaExplainLlmMessages';
import { shouldAutoRequestStudyLlmStream } from '../features/studyPanel/shouldAutoRequestStudyLlmStream';
import type {
  StudyPanelFormulaExplainProps,
  StudyPanelLlmExplainProps,
} from '../features/studyPanel/studyPanelLlmSurfaceProps';

export type UseStudyPanelLlmSurfacesParams = {
  llmExplain: StudyPanelLlmExplainProps;
  llmFormulaExplain: StudyPanelFormulaExplainProps;
  explainReasoningEnabled: boolean;
  formulaReasoningEnabled: boolean;
  isAnswerSubmitted: boolean;
  onHintUsed?: () => void;
};

export function useStudyPanelLlmSurfaces({
  llmExplain,
  llmFormulaExplain,
  explainReasoningEnabled,
  formulaReasoningEnabled,
  isAnswerSubmitted,
  onHintUsed,
}: UseStudyPanelLlmSurfacesParams) {
  const [explainOpen, setExplainOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [activeFormulaLatex, setActiveFormulaLatex] = useState<string | null>(null);
  const [activeFormulaContext, setActiveFormulaContext] = useState<StudyFormulaExplainContext | null>(null);
  const prevReasoningEnabled = useRef({
    explain: explainReasoningEnabled,
    formula: formulaReasoningEnabled,
  });

  const closeFormulaExplain = useCallback(() => {
    llmFormulaExplain.cancelInflight();
    setFormulaOpen(false);
    setActiveFormulaLatex(null);
    setActiveFormulaContext(null);
  }, [llmFormulaExplain]);

  const fireHint = useCallback(() => {
    if (isAnswerSubmitted) {
      return;
    }
    onHintUsed?.();
  }, [isAnswerSubmitted, onHintUsed]);

  const requestFormulaExplain = llmFormulaExplain.requestExplain;
  const openFormulaExplain = useCallback(
    (latex: string, context: StudyFormulaExplainContext, _anchorElement: HTMLElement) => {
      llmExplain.cancelInflight();
      setExplainOpen(false);
      fireHint();
      setActiveFormulaLatex(latex);
      setActiveFormulaContext(context);
      setFormulaOpen(true);
      requestFormulaExplain(latex, context);
    },
    [fireHint, llmExplain, requestFormulaExplain],
  );

  const handleFormulaOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setFormulaOpen(false);
        llmFormulaExplain.cancelInflight();
        setActiveFormulaLatex(null);
        setActiveFormulaContext(null);
        return;
      }
      fireHint();
      setFormulaOpen(true);
    },
    [fireHint, llmFormulaExplain],
  );

  useEffect(() => {
    if (prevReasoningEnabled.current.explain !== explainReasoningEnabled) {
      llmExplain.clearSessionCache();
      if (explainOpen) {
        llmExplain.cancelInflight();
        llmExplain.requestExplain();
      }
      prevReasoningEnabled.current.explain = explainReasoningEnabled;
    }

    if (prevReasoningEnabled.current.formula !== formulaReasoningEnabled) {
      llmFormulaExplain.clearSessionCache();
      if (formulaOpen && activeFormulaLatex !== null && activeFormulaContext !== null) {
        llmFormulaExplain.cancelInflight();
        llmFormulaExplain.requestExplain(activeFormulaLatex, activeFormulaContext);
      }
      prevReasoningEnabled.current.formula = formulaReasoningEnabled;
    }
  }, [
    activeFormulaContext,
    activeFormulaLatex,
    explainOpen,
    explainReasoningEnabled,
    formulaOpen,
    formulaReasoningEnabled,
    llmExplain,
    llmFormulaExplain,
  ]);

  const handleExplainOpenChange = useCallback(
    (open: boolean) => {
      setExplainOpen(open);
      if (!open) {
        llmExplain.cancelInflight();
        return;
      }
      fireHint();
      closeFormulaExplain();
      if (
        shouldAutoRequestStudyLlmStream({
          isPending: llmExplain.isPending,
          assistantText: llmExplain.assistantText,
          errorMessage: llmExplain.errorMessage,
        })
      ) {
        llmExplain.requestExplain();
      }
    },
    [closeFormulaExplain, fireHint, llmExplain],
  );

  const dismissExplainInference = useCallback(() => {
    handleExplainOpenChange(false);
  }, [handleExplainOpenChange]);

  const dismissFormulaInference = useCallback(() => {
    handleFormulaOpenChange(false);
  }, [handleFormulaOpenChange]);

  return {
    explainOpen,
    formulaOpen,
    activeFormulaLatex,
    activeFormulaContext,
    openFormulaExplain,
    handleExplainOpenChange,
    handleFormulaOpenChange,
    dismissExplainInference,
    dismissFormulaInference,
  };
}
