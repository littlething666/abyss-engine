import { inputHash } from '../contracts/generationContracts';

export const TOPIC_CONTENT_STAGE_HASH_SCOPE_FIELD = 'topic_content_stage_hash_scope';

export type TopicContentStageInputHashStage =
  | 'theory'
  | 'study-cards'
  | `mini-games:${string}`;

export type TopicContentParentContentHashes = Readonly<Record<string, string>>;

export interface TopicContentStageInputHashInput {
  snapshot: Record<string, unknown>;
  baseInputHash: string;
  stage: TopicContentStageInputHashStage;
  parentContentHashes?: TopicContentParentContentHashes;
}

function hasParentHashes(parentContentHashes: TopicContentParentContentHashes | undefined): parentContentHashes is TopicContentParentContentHashes {
  return parentContentHashes !== undefined && Object.keys(parentContentHashes).length > 0;
}

function assertParentContentHashes(parentContentHashes: TopicContentParentContentHashes): void {
  for (const [key, value] of Object.entries(parentContentHashes)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`topic-content stage input hash parent content hash "${key}" must be a non-empty string`);
    }
  }
}

/**
 * Computes the artifact-level input hash for a Topic Content stage.
 *
 * Single-stage runs keep the run snapshot hash. Multi-stage full-pipeline
 * children add the already-materialized parent artifact content hashes to the
 * hash input so study-card and mini-game artifacts are cached against the exact
 * theory/card artifacts they consumed instead of the original full-pipeline
 * run snapshot alone.
 */
export async function topicContentStageInputHash(input: TopicContentStageInputHashInput): Promise<string> {
  if (!hasParentHashes(input.parentContentHashes)) return input.baseInputHash;

  assertParentContentHashes(input.parentContentHashes);

  return inputHash({
    ...input.snapshot,
    [TOPIC_CONTENT_STAGE_HASH_SCOPE_FIELD]: {
      stage: input.stage,
      parentContentHashes: input.parentContentHashes,
    },
  });
}
