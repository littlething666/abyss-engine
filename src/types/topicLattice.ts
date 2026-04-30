import type { TopicIconName } from './core';

/**
 * Stage-A curriculum output: topics, tiers, and curated icon names only
 * (no prerequisite edges). Used by subject graph generation and telemetry payloads.
 */
export interface TopicLatticeNode {
  topicId: string;
  title: string;
  iconName: TopicIconName;
  tier: number;
  learningObjective: string;
}

export interface TopicLattice {
  topics: TopicLatticeNode[];
}
