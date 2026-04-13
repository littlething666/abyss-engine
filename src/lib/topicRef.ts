/**
 * Canonical composite identity for (subjectId, topicId) pairs.
 *
 * Use `SubjectTopicRef` as the structured representation on persisted objects
 * and function parameters. Use `TopicRefKey` (via `topicRefKey()`) whenever
 * you need a flat string key for `Record` / `Map` indices.
 *
 * This module is the **single source of truth** for the composite key format.
 * Do not create ad-hoc "subjectId::topicId" strings elsewhere.
 */

/** Delimiter used internally by `topicRefKey`. Never appears in valid IDs. */
const DELIMITER = '::';

/**
 * Structured composite reference to a topic within a subject.
 * Prefer this shape on persisted objects, function signatures, and anywhere
 * the pair travels together.
 */
export interface SubjectTopicRef {
  readonly subjectId: string;
  readonly topicId: string;
}

/**
 * Branded string type used as a flat map key derived from a `SubjectTopicRef`.
 *
 * Obtain via `topicRefKey(subjectId, topicId)`. Do not construct manually.
 */
export type TopicRefKey = string & { readonly __brand: 'TopicRefKey' };

/**
 * Derives a deterministic flat string key from a (subjectId, topicId) pair.
 * Use this whenever you need a `Record` or `Map` index for a topic.
 *
 * @example
 * ```ts
 * const key = topicRefKey('math-101', 'linear-algebra');
 * // => 'math-101::linear-algebra' (typed as TopicRefKey)
 * ```
 */
export function topicRefKey(subjectId: string, topicId: string): TopicRefKey {
  return `${subjectId}${DELIMITER}${topicId}` as TopicRefKey;
}

/**
 * Inverse of `topicRefKey`. Splits a `TopicRefKey` back into its structured
 * components. Intended for debug / test paths only — prefer passing the
 * structured `SubjectTopicRef` through your code instead of round-tripping
 * through the string form.
 *
 * @throws if `key` does not contain the expected delimiter.
 */
export function parseTopicRefKey(key: TopicRefKey): SubjectTopicRef {
  const idx = key.indexOf(DELIMITER);
  if (idx === -1) {
    throw new Error(`Invalid TopicRefKey: missing '${DELIMITER}' delimiter in "${key}"`);
  }
  return {
    subjectId: key.slice(0, idx),
    topicId: key.slice(idx + DELIMITER.length),
  };
}

/**
 * Helper to create a `SubjectTopicRef` from loose strings.
 * Purely cosmetic — avoids `{ subjectId, topicId }` object literals at call sites.
 */
export function makeTopicRef(subjectId: string, topicId: string): SubjectTopicRef {
  return { subjectId, topicId };
}
