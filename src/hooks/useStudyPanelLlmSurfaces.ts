'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { StudyFormulaExplainContext } from '../features/studyPanel/formulaExplainLlmMessages';
import { shouldAutoRequestStudyLlmStream } from '../features/studyPanel/shouldAutoRequestStudyLlmStream';
import type {
  StudyPanelFormulaExplainProps,
  StudyPanelLlmExplainProps,
  StudyPanelMermaidDiagramProps,
} from '../features/studyPanel/studyPanelLlmSurfaceProps';

export type UseStudyPanelLlmSurfacesParams = {
  llmExplain: StudyPanelLlmExplainProps;
  llmFormulaExplain: StudyPanelFormulaExplainProps;
  llmMermaidDiagram: StudyPanelMermaidDiagramProps;
  explainReasoningEnabled: boolean;
  formulaReasoningEnabled: boolean;
  mermaidReasoningEnabled: boolean;
};

export function useStudyPanelLlmSurfaces({
  llmExplain,
  llmFormulaExplain,
  llmMermaidDiagram,
  explainReasoningEnabled,
  formulaReasoningEnabled,
  mermaidReasoningEnabled,
}: UseStudyPanelLlmSurfacesParams) {
  const [explainOpen, setExplainOpen] = useState(false);
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [activeFormulaLatex, setActiveFormulaLatex] = useState<string | null>(null);
  const [activeFormulaContext, setActiveFormulaContext] = useState<StudyFormulaExplainContext | null>(null);
  const prevReasoningEnabled = useRef({
    explain: explainReasoningEnabled,
    formula: formulaReasoningEnabled,
    mermaid: mermaidReasoningEnabled,
  });

  const closeMermaidDiagram = useCallback(() => {
    llmMermaidDiagram.cancelInflight();
    setMermaidOpen(false);
  }, [llmMermaidDiagram]);

  const closeFormulaExplain = useCallback(() => {
    llmFormulaExplain.cancelInflight();
    setFormulaOpen(false);
    setActiveFormulaLatex(null);
    setActiveFormulaContext(null);
  }, [llmFormulaExplain]);

  const requestFormulaExplain = llmFormulaExplain.requestExplain;
  const openFormulaExplain = useCallback(
    (latex: string, context: StudyFormulaExplainContext, _anchorElement: HTMLElement) => {
      llmExplain.cancelInflight();
      setExplainOpen(false);
      closeMermaidDiagram();
      setActiveFormulaLatex(latex);
      setActiveFormulaContext(context);
      setFormulaOpen(true);
      requestFormulaExplain(latex, context);
    },
    [llmExplain, requestFormulaExplain, closeMermaidDiagram],
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
      setFormulaOpen(true);
    },
    [llmFormulaExplain],
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

    if (prevReasoningEnabled.current.mermaid !== mermaidReasoningEnabled) {
      llmMermaidDiagram.clearSessionCache();
      if (mermaidOpen) {
        llmMermaidDiagram.cancelInflight();
        llmMermaidDiagram.requestDiagram();
      }
      prevReasoningEnabled.current.mermaid = mermaidReasoningEnabled;
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
    llmMermaidDiagram,
    mermaidOpen,
    mermaidReasoningEnabled,
  ]);

  const handleExplainOpenChange = useCallback(
    (open: boolean) => {
      setExplainOpen(open);
      if (!open) {
        llmExplain.cancelInflight();
        return;
      }
      closeFormulaExplain();
      closeMermaidDiagram();
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
    [llmExplain, closeFormulaExplain, closeMermaidDiagram],
  );

  const handleMermaidOpenChange = useCallback(
    (open: boolean) => {
      setMermaidOpen(open);
      if (!open) {
        llmMermaidDiagram.cancelInflight();
        return;
      }
      llmExplain.cancelInflight();
      setExplainOpen(false);
      closeFormulaExplain();
      if (
        shouldAutoRequestStudyLlmStream({
          isPending: llmMermaidDiagram.isPending,
          assistantText: llmMermaidDiagram.assistantText,
          errorMessage: llmMermaidDiagram.errorMessage,
        })
      ) {
        llmMermaidDiagram.requestDiagram();
      }
    },
    [llmExplain, llmMermaidDiagram, closeFormulaExplain],
  );

  const dismissExplainInference = useCallback(() => {
    handleExplainOpenChange(false);
  }, [handleExplainOpenChange]);

  const dismissFormulaInference = useCallback(() => {
    handleFormulaOpenChange(false);
  }, [handleFormulaOpenChange]);

  const dismissMermaidInference = useCallback(() => {
    handleMermaidOpenChange(false);
  }, [handleMermaidOpenChange]);

  return {
    explainOpen,
    mermaidOpen,
    formulaOpen,
    activeFormulaLatex,
    activeFormulaContext,
    openFormulaExplain,
    handleExplainOpenChange,
    handleMermaidOpenChange,
    handleFormulaOpenChange,
    dismissExplainInference,
    dismissFormulaInference,
    dismissMermaidInference,
  };
}
