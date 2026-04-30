import type { ChatMessage } from '@/types/llm';
import type { GraphStrategy } from '@/types/generationStrategy';
import subjectGraphTopicsPrompt from '@/prompts/subject-graph-topics.prompt';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';

import { TOPIC_ICON_NAMES } from '../topicIcons/topicIconAllowlist';

const ICON_ALLOWLIST_STRING = TOPIC_ICON_NAMES.join(', ');

export function buildTopicLatticeMessages(
  subjectId: string,
  strategy: GraphStrategy,
): ChatMessage[] {
  const topicCount = strategy.totalTiers * strategy.topicsPerTier;
  const systemContent = interpolatePromptTemplate(subjectGraphTopicsPrompt, {
    subjectId,
    themeId: subjectId,
    subjectTitle: strategy.domainBrief,
    topicCount: String(topicCount),
    maxTier: String(strategy.totalTiers),
    topicsPerTier: String(strategy.topicsPerTier),
    audience: strategy.audienceBrief,
    domainDescription: strategy.domainBrief,
    iconAllowlist: ICON_ALLOWLIST_STRING,
  });

  const userContent = strategy.focusConstraints.trim()
    ? `Additional constraints from the learner:\n${strategy.focusConstraints}`
    : 'Generate the topic lattice now.';

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}
