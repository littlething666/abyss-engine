import type { SubjectGraphTopicsArtifactPayload } from '../schemas';
import { SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST } from './_constants';
import type { SemanticValidator } from './types';

/**
 * Stage A semantic validator for `subject-graph-topics`.
 *
 * The strict Zod schema already accepts kebab-case `topicId` and
 * non-empty `title` / `iconName`; this validator adds the domain rules
 * the structural envelope cannot encode:
 * 1. `iconName` must be a member of `TOPIC_ICON_NAMES` (mirrored locally
 *    in `_constants.ts` per the lockstep policy).
 * 2. No duplicate `topicId` across topics.
 * 3. No duplicate `title` (case-insensitive trim) — model drift
 *    sometimes emits the same node twice with different ids.
 */
export const validateSubjectGraphTopicsArtifact: SemanticValidator<
  SubjectGraphTopicsArtifactPayload
> = (payload) => {
  const allowed = new Set(SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST);
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  for (let i = 0; i < payload.topics.length; i += 1) {
    const t = payload.topics[i];
    if (seenIds.has(t.topicId)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-subject-graph',
        message: `Duplicate topicId at topics[${i}]: ${t.topicId}`,
        path: `topics[${i}].topicId`,
      };
    }
    seenIds.add(t.topicId);
    const titleKey = t.title.trim().toLowerCase();
    if (seenTitles.has(titleKey)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-subject-graph',
        message: `Duplicate title at topics[${i}]: ${t.title}`,
        path: `topics[${i}].title`,
      };
    }
    seenTitles.add(titleKey);
    if (!allowed.has(t.iconName)) {
      return {
        ok: false,
        failureCode: 'validation:semantic-subject-graph',
        message: `iconName "${t.iconName}" is not in the topic-icon allowlist`,
        path: `topics[${i}].iconName`,
      };
    }
  }
  return { ok: true };
};
