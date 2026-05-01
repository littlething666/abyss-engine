import type { TopicDetails } from '@/types/core';
import type { MiniGameAffordanceSet } from '@/types/contentQuality';

import type { ParsedTopicTheoryPayload } from '../parsers/parseTopicTheoryPayload';
import { miniGameAffordancesSchema } from '../parsers/parseTopicTheoryPayload';
import { migrateMiniGameAffordancesInput } from '../parsers/migrateMiniGameAffordancesInput';

/**
 * Builds theory prompt input from persisted topic details for study / mini-game-only runs.
 * Throws a descriptive error at the boundary when prerequisites are missing (no silent repair).
 */
export function loadTheoryPayloadFromTopicDetails(details: TopicDetails): ParsedTopicTheoryPayload {
  const theory = details.theory.trim();
  if (!theory) {
    throw new Error('Topic theory is missing in the deck. Run theory generation first.');
  }

  const cq = details.coreQuestionsByDifficulty;
  const q1 = cq?.[1]?.filter((s) => s.trim().length > 0) ?? [];
  const q2 = cq?.[2]?.filter((s) => s.trim().length > 0) ?? [];
  const q3 = cq?.[3]?.filter((s) => s.trim().length > 0) ?? [];
  const q4 = cq?.[4]?.filter((s) => s.trim().length > 0) ?? [];

  if (!q1.length) {
    throw new Error('Syllabus (difficulty 1) is missing. Run theory generation first.');
  }
  if (!q2.length || !q3.length || !q4.length) {
    throw new Error('Complete syllabus (difficulties 1-4) is required. Run theory generation first.');
  }

  const kt = details.keyTakeaways.filter((s) => s.trim().length > 0);
  const keyTakeaways =
    kt.length >= 4
      ? kt.slice(0, 4)
      : [...kt, ...Array.from({ length: Math.max(0, 4 - kt.length) }, () => '—')].slice(0, 4);

  const rawAffordances = details.miniGameAffordances ?? {
    categorySets: [],
    orderedSequences: [],
    connectionPairs: [],
  };
  const migratedAffordances = migrateMiniGameAffordancesInput(rawAffordances);
  const affordanceParse = miniGameAffordancesSchema.safeParse(migratedAffordances);
  if (!affordanceParse.success) {
    const issue = affordanceParse.error.issues[0];
    const path = issue?.path?.length ? issue.path.join('.') : 'root';
    throw new Error(
      `Stored mini-game affordances are invalid at ${path}: ${issue?.message ?? 'unknown'}. Re-run theory generation to refresh anchors.`,
    );
  }

  return {
    coreConcept: details.coreConcept.trim() || '—',
    theory,
    keyTakeaways,
    coreQuestionsByDifficulty: {
      1: q1,
      2: q2,
      3: q3,
      4: q4,
    },
    groundingSources: details.groundingSources ?? [],
    miniGameAffordances: affordanceParse.data as MiniGameAffordanceSet,
  };
}
