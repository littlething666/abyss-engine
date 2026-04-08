export const RECENT_TOPIC_GENERATION_LOG_LIMIT = 10;

export function selectRecentTopicGenerationLogs<T extends { startedAt: number }>(
  byTopicId: Record<string, T>,
): T[] {
  return Object.values(byTopicId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, RECENT_TOPIC_GENERATION_LOG_LIMIT);
}
