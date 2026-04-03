import type { StudyFormulaExplainContext } from './formulaExplainLlmMessages';

export type StudyPanelLlmExplainProps = {
  isPending: boolean;
  errorMessage: string | null;
  assistantText: string | null;
  reasoningText: string | null;
  requestExplain: () => void;
  cancelInflight: () => void;
};

export type StudyPanelFormulaExplainProps = {
  isPending: boolean;
  errorMessage: string | null;
  assistantText: string | null;
  reasoningText: string | null;
  requestExplain: (latex: string, context: StudyFormulaExplainContext) => void;
  cancelInflight: () => void;
};

export type StudyPanelMermaidDiagramProps = {
  isPending: boolean;
  errorMessage: string | null;
  assistantText: string | null;
  reasoningText: string | null;
  requestDiagram: () => void;
  cancelInflight: () => void;
};
