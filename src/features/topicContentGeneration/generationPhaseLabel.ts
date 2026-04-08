import type { TopicGenerationPhase } from './contentGenerationStore';

/** User-facing status for the HUD pill when a topic unlock pipeline is in progress. */
export function labelForTopicGenerationPhase(phase: TopicGenerationPhase | undefined): string | null {
  if (!phase) {
    return null;
  }
  switch (phase) {
    case 'theory':
      return 'Writing theory and syllabus…';
    case 'study_cards':
      return 'Building study cards…';
    case 'mini_games':
      return 'Creating mini-games…';
    case 'saving':
      return 'Saving deck…';
    default:
      return 'Synthesizing knowledge…';
  }
}
