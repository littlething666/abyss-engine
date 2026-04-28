import type { SubjectGraph } from './core';
import type { StudyChecklist } from './studyChecklist';

export interface SubjectGenerationRequest {
  subjectId: string;
  checklist: StudyChecklist;
}

export type SubjectGenerationResult =
  | { ok: true; subjectId: string; graph: SubjectGraph }
  | {
      ok: false;
      error: string;
      pipelineId: string;
      stage: 'topics' | 'edges';
    };
