/**
 * `ArtifactKind` -> readonly array of `EvalFixture`.
 *
 * The harness iterates this registry to ensure every kind carries a
 * meaningful floor of golden coverage:
 *
 *   - ≥8 accept fixtures covering common payload shapes
 *   - ≥5 parse:json-mode-violation fixtures (markdown fences, prose,
 *     trailing commas, truncated JSON, ...)
 *   - ≥8 parse:zod-shape fixtures (missing required field, wrong type,
 *     extra key, empty array where min(N), ...)
 *   - ≥3 semantic-fail fixtures, at least one per locally-relevant
 *     `validation:semantic-*` failure code
 *
 * Adding a new failure code or schema constraint requires extending
 * the relevant fixture file so the harness fails CI on accidental
 * removal of the rule.
 */

import type { ArtifactKind } from '../artifacts/types';
import { crystalTrialFixtures } from './crystalTrial.fixtures';
import { subjectGraphEdgesFixtures } from './subjectGraphEdges.fixtures';
import { subjectGraphTopicsFixtures } from './subjectGraphTopics.fixtures';
import { topicExpansionCardsFixtures } from './topicExpansionCards.fixtures';
import { topicMiniGameCategorySortFixtures } from './topicMiniGameCategorySort.fixtures';
import { topicMiniGameMatchPairsFixtures } from './topicMiniGameMatchPairs.fixtures';
import { topicMiniGameSequenceBuildFixtures } from './topicMiniGameSequenceBuild.fixtures';
import { topicStudyCardsFixtures } from './topicStudyCards.fixtures';
import { topicTheoryFixtures } from './topicTheory.fixtures';
import type { EvalFixturesByKind } from './types';

export const EVAL_FIXTURES_BY_KIND: EvalFixturesByKind = {
  'subject-graph-topics': subjectGraphTopicsFixtures,
  'subject-graph-edges': subjectGraphEdgesFixtures,
  'topic-theory': topicTheoryFixtures,
  'topic-study-cards': topicStudyCardsFixtures,
  'topic-mini-game-category-sort': topicMiniGameCategorySortFixtures,
  'topic-mini-game-sequence-build': topicMiniGameSequenceBuildFixtures,
  'topic-mini-game-match-pairs': topicMiniGameMatchPairsFixtures,
  'topic-expansion-cards': topicExpansionCardsFixtures,
  'crystal-trial': crystalTrialFixtures,
};

/** Convenience accessor used by the test harness. */
export function fixturesForKind(kind: ArtifactKind) {
  return EVAL_FIXTURES_BY_KIND[kind];
}
