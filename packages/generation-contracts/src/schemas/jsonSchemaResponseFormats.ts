/**
 * JSON Schema response-format builders for OpenRouter strict structured-output
 * pipeline calls.
 *
 * Every `ArtifactKind` has exactly ONE response-format builder. The JSON
 * Schema payload is derived from the same Zod schema the strict-parser and
 * semantic validator use, via `z.toJSONSchema()`. Backend workflows must
 * consume these through the Worker contract adapter (`@contracts`); adding a
 * hand-written inline JSON Schema to any workflow is prohibited.
 *
 * Response-format JSON Schema names are stable snapshots. Changing a schema
 * bumps the per-kind `schemaVersion`; changing the name requires updating the
 * backend `topic_content_<stage>` construction rule in
 * `src/llm/openrouterClient.ts` for Topic Content workflows.
 *
 * Adding an `ArtifactKind` requires:
 *   1. Extending the union in `../artifacts/types.ts`.
 *   2. Adding a strict Zod schema + schema version under `../schemas/`.
 *   3. Wiring the kind in `../strictParsers/byKind.ts` and
 *      `../semanticValidators/byKind.ts`.
 *   4. Adding a response-format entry in this file.
 */

import type { ArtifactKind } from '../artifacts/types';
import {
  crystalTrialArtifactSchema,
  subjectGraphEdgesArtifactSchema,
  subjectGraphTopicsArtifactSchema,
  topicExpansionCardsArtifactSchema,
  topicMiniGameCategorySortArtifactSchema,
  topicMiniGameMatchPairsArtifactSchema,
  topicMiniGameSequenceBuildArtifactSchema,
  topicStudyCardsArtifactSchema,
  topicTheoryArtifactSchema,
} from './index';

// ---------------------------------------------------------------------------
// Stable schema names for OpenRouter `json_schema.name`
// ---------------------------------------------------------------------------

/**
 * Per-ArtifactKind OpenRouter `response_format.json_schema.name` value.
 *
 * These names are part of the response-format contract — changing one
 * changes the hash of any prompt/schema/model surface that references it,
 * which triggers the eval CI gate.
 */
export const JSON_SCHEMA_RESPONSE_FORMAT_NAMES: Record<ArtifactKind, string> = {
  'subject-graph-topics': 'subject_graph_topics',
  'subject-graph-edges': 'subject_graph_edges',
  'topic-theory': 'topic_theory',
  'topic-study-cards': 'topic_study_cards',
  'topic-mini-game-category-sort': 'topic_mini_game_category_sort',
  'topic-mini-game-sequence-build': 'topic_mini_game_sequence_build',
  'topic-mini-game-match-pairs': 'topic_mini_game_match_pairs',
  'topic-expansion-cards': 'topic_expansion_cards',
  'crystal-trial': 'crystal_trial',
};

/**
 * Per-ArtifactKind Zod schema used to derive the JSON Schema payload.
 */
const SCHEMA_BY_KIND: Record<ArtifactKind, { toJSONSchema(): Record<string, unknown> }> = {
  'subject-graph-topics': subjectGraphTopicsArtifactSchema,
  'subject-graph-edges': subjectGraphEdgesArtifactSchema,
  'topic-theory': topicTheoryArtifactSchema,
  'topic-study-cards': topicStudyCardsArtifactSchema,
  'topic-mini-game-category-sort': topicMiniGameCategorySortArtifactSchema,
  'topic-mini-game-sequence-build': topicMiniGameSequenceBuildArtifactSchema,
  'topic-mini-game-match-pairs': topicMiniGameMatchPairsArtifactSchema,
  'topic-expansion-cards': topicExpansionCardsArtifactSchema,
  'crystal-trial': crystalTrialArtifactSchema,
};

// ---------------------------------------------------------------------------
// OpenRouter response-format shape
// ---------------------------------------------------------------------------

export interface JsonSchemaResponseFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
}

/**
 * Build the OpenRouter `response_format` payload for a given artifact kind.
 *
 * The returned shape is `{ type: 'json_schema', json_schema: { name, strict:
 * true, schema } }` — exactly what `callCrystalTrial` and the other Worker
 * OpenRouter helpers merge into the chat-completions request body.
 */
export function jsonSchemaResponseFormat(
  kind: ArtifactKind,
): JsonSchemaResponseFormat {
  const name = JSON_SCHEMA_RESPONSE_FORMAT_NAMES[kind];
  const schema = SCHEMA_BY_KIND[kind].toJSONSchema();

  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema: schema as Record<string, unknown>,
    },
  };
}

/**
 * Lookup map for pipeline composition roots that dispatch by kind.
 *
 * Every `ArtifactKind` is covered — adding a new kind without a builder
 * entry will fail CI at typecheck time.
 */
export const JSON_SCHEMA_RESPONSE_FORMAT_BY_KIND: Record<
  ArtifactKind,
  JsonSchemaResponseFormat
> = {
  'subject-graph-topics': jsonSchemaResponseFormat('subject-graph-topics'),
  'subject-graph-edges': jsonSchemaResponseFormat('subject-graph-edges'),
  'topic-theory': jsonSchemaResponseFormat('topic-theory'),
  'topic-study-cards': jsonSchemaResponseFormat('topic-study-cards'),
  'topic-mini-game-category-sort': jsonSchemaResponseFormat(
    'topic-mini-game-category-sort',
  ),
  'topic-mini-game-sequence-build': jsonSchemaResponseFormat(
    'topic-mini-game-sequence-build',
  ),
  'topic-mini-game-match-pairs': jsonSchemaResponseFormat(
    'topic-mini-game-match-pairs',
  ),
  'topic-expansion-cards': jsonSchemaResponseFormat('topic-expansion-cards'),
  'crystal-trial': jsonSchemaResponseFormat('crystal-trial'),
};
