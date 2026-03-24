'use client';

import { useCallback, useState } from 'react';

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
};

export function useStudyPanelLlmSurfaces({
  llmExplain,
  llmFormulaExplain,
  llmMermaidDiagram,
}: UseStudyPanelLlmSurfacesParams) {
  const [explainOpen, setExplainOpen] = useState(false);
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [activeFormulaLatex, setActiveFormulaLatex] = useState<string | null>(null);

  const closeMermaidDiagram = useCallback(() => {
    llmMermaidDiagram.cancelInflight();
    setMermaidOpen(false);
  }, [llmMermaidDiagram]);

  const closeFormulaExplain = useCallback(() => {
    llmFormulaExplain.cancelInflight();
    setFormulaOpen(false);
    setActiveFormulaLatex(null);
  }, [llmFormulaExplain]);

  const requestFormulaExplain = llmFormulaExplain.requestExplain;
  const openFormulaExplain = useCallback(
    (latex: string, context: StudyFormulaExplainContext, _anchorElement: HTMLElement) => {
      llmExplain.cancelInflight();
      setExplainOpen(false);
      closeMermaidDiagram();
      setActiveFormulaLatex(latex);
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
        return;
      }
      setFormulaOpen(true);
    },
    [llmFormulaExplain],
  );

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
    openFormulaExplain,
    handleExplainOpenChange,
    handleMermaidOpenChange,
    handleFormulaOpenChange,
    dismissExplainInference,
    dismissFormulaInference,
    dismissMermaidInference,
  };
}
