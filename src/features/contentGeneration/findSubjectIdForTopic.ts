import type { IDeckRepository } from '@/types/repository';

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
