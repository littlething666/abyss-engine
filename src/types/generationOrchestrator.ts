import type { SubjectGraph } from './core';
import type { StudyChecklist } from './studyChecklist';
import type { TopicLattice } from './topicLattice';

export interface SubjectGenerationRequest {
  subjectId: string;
  checklist: StudyChecklist;
}

export type SubjectGenerationResult =
  | { ok: true; subjectId: string; graph: SubjectGraph; lattice: TopicLattice }
  | {
      ok: false;
      error: string;
      pipelineId: string;
      stage: 'topics' | 'edges';
    };
