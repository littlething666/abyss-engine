import type { ChatMessage } from '../../types/llm';
import curriculumGraphPromptTemplate from '../../prompts/ascent-weaver-curriculum-graph.prompt';
import { interpolateAscentWeaverTemplate } from './interpolateAscentWeaverTemplate';

export interface CurriculumGraphPromptParams {
  subjectId: string;
  themeId: string;
  subjectTitle: string;
  audience: string;
  domainDescription: string;
  topicCount: number;
  maxTier: number;
  topicsPerTier: number;
  additionalNotes?: string;
}

export function buildCurriculumGraphMessages(params: CurriculumGraphPromptParams): ChatMessage[] {
  const {
    subjectId,
    themeId,
    subjectTitle,
    audience,
    domainDescription,
    topicCount,
    maxTier,
    topicsPerTier,
    additionalNotes,
  } = params;

  const systemContent = interpolateAscentWeaverTemplate(curriculumGraphPromptTemplate, {
    subjectId,
    themeId,
    subjectTitle,
    audience,
    domainDescription,
    topicCount: String(topicCount),
    maxTier: String(maxTier),
    topicsPerTier: String(topicsPerTier),
  });

  const notes = additionalNotes?.trim();
  const userContent =
    notes && notes.length > 0
      ? `Additional constraints or emphasis from the author:\n${notes}`
      : 'Generate the curriculum graph now.';

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}
