import type { ChatMessage } from '@/types/llm';
import incrementalSubjectCurriculumTemplate from '@/prompts/incremental-subject-curriculum.prompt';
import { interpolateAscentWeaverTemplate } from '../ascentWeaver/interpolateAscentWeaverTemplate';

export interface IncrementalSubjectPromptParams {
  subjectId: string;
  themeId: string;
  learningPrompt: string;
}

export function buildIncrementalSubjectMessages(params: IncrementalSubjectPromptParams): ChatMessage[] {
  const { subjectId, themeId, learningPrompt } = params;

  const systemContent = interpolateAscentWeaverTemplate(incrementalSubjectCurriculumTemplate, {
    subjectId,
    themeId,
    learningPrompt: learningPrompt.trim(),
  });

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Generate the subject metadata and two-tier curriculum graph now as JSON.' },
  ];
}
