import type { StudyLlmRequestKind } from './studyLlmTypes';

export type StudyLlmPolicy = {
  kind: StudyLlmRequestKind;
  modelId: string;
  temperature: number;
  requestReasoning: boolean;
  streamReasoningToClient: boolean;
  promptVersion: string;
};

const STUDY_LLM_MODEL_ID = 'google/gemini-3.1-flash-lite-preview';

const POLICY_BY_KIND: Record<StudyLlmRequestKind, StudyLlmPolicy> = {
  'study-question-explain': {
    kind: 'study-question-explain',
    modelId: STUDY_LLM_MODEL_ID,
    temperature: 0.25,
    requestReasoning: true,
    streamReasoningToClient: true,
    promptVersion: 'study-question-explain.v1',
  },
  'study-formula-explain': {
    kind: 'study-formula-explain',
    modelId: STUDY_LLM_MODEL_ID,
    temperature: 0.2,
    requestReasoning: true,
    streamReasoningToClient: true,
    promptVersion: 'study-formula-explain.v1',
  },
};

export function resolveStudyLlmPolicy(kind: StudyLlmRequestKind): StudyLlmPolicy {
  return POLICY_BY_KIND[kind];
}
