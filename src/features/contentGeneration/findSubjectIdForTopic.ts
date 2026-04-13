import type { IDeckRepository } from '@/types/repository';

/**
 * @deprecated Callers should already know the `subjectId` from the composite
 * `SubjectTopicRef` flowing through progression, UI, and event payloads.
 * This function iterates all subjects and returns the **first** graph containing
 * the `topicId`, which is non-deterministic when multiple subjects share a topicId.
 *
 * Use only as a **fallback** during migration. Prefer passing `SubjectTopicRef`
 * from `@/lib/topicRef` through the entire call chain.
 */
export async function findSubjectIdForTopic(deckRepository: IDeckRepository, topicId: string): Promise<string | null> {
  const manifest = await deckRepository.getManifest();
  for (const s of manifest.subjects) {
    const graph = await deckRepository.getSubjectGraph(s.id);
    if (graph.nodes.some((n) => n.topicId === topicId)) {
      return s.id;
    }
  }
  return null;
}
