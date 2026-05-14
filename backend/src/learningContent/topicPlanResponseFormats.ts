import type { JsonSchemaResponseFormat } from '../contracts/generationContracts';
import {
  TOPIC_CARD_PLAN_ARTIFACT_KIND,
  TOPIC_CONCEPT_PLAN_ARTIFACT_KIND,
  topicCardPlanArtifactPayloadSchema,
  topicConceptPlanArtifactPayloadSchema,
  type TopicPlanArtifactKind,
} from './topicPlanCompiler';

const TOPIC_PLAN_RESPONSE_FORMAT_NAMES: Record<TopicPlanArtifactKind, string> = {
  [TOPIC_CONCEPT_PLAN_ARTIFACT_KIND]: 'topic_concept_plan',
  [TOPIC_CARD_PLAN_ARTIFACT_KIND]: 'topic_card_plan',
};

const TOPIC_PLAN_SCHEMA_BY_KIND: Record<TopicPlanArtifactKind, { toJSONSchema(): Record<string, unknown> }> = {
  [TOPIC_CONCEPT_PLAN_ARTIFACT_KIND]: topicConceptPlanArtifactPayloadSchema as unknown as { toJSONSchema(): Record<string, unknown> },
  [TOPIC_CARD_PLAN_ARTIFACT_KIND]: topicCardPlanArtifactPayloadSchema as unknown as { toJSONSchema(): Record<string, unknown> },
};

/**
 * Backend-local strict JSON Schema response formats for planning artifacts.
 *
 * These remain outside the durable external `@contracts` layer until the plan
 * and per-spec content artifacts are promoted together. Workflow wiring can
 * still use the same OpenAI-compatible `json_schema` boundary as contract-owned
 * stages while keeping the local planning seam clearly isolated.
 */
export function topicPlanJsonSchemaResponseFormat(kind: TopicPlanArtifactKind): JsonSchemaResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name: TOPIC_PLAN_RESPONSE_FORMAT_NAMES[kind],
      strict: true,
      schema: TOPIC_PLAN_SCHEMA_BY_KIND[kind].toJSONSchema(),
    },
  };
}
