import type { Subject, SubjectGraph } from '@/types/core';
import type { IDeckContentWriter } from '@/types/repository';

export interface ApplyGraphToStorageInput {
  subject: Subject;
  graph: SubjectGraph;
}

/**
 * Persists subject row, full graph, stub topic details, and empty card decks for every node.
 */
export async function applyGraphToStorage(
  writer: IDeckContentWriter,
  input: ApplyGraphToStorageInput,
): Promise<void> {
  const { subject, graph } = input;

  if (subject.id !== graph.subjectId) {
    throw new Error(`Subject id "${subject.id}" does not match graph.subjectId "${graph.subjectId}"`);
  }

  await writer.upsertSubject({ ...subject, themeId: graph.themeId, contentSource: 'generated' });
  await writer.upsertGraph(graph);

  for (const node of graph.nodes) {
    await writer.upsertTopicDetails({
      topicId: node.topicId,
      title: node.title,
      subjectId: graph.subjectId,
      coreConcept: node.learningObjective,
      theory: '',
      keyTakeaways: [],
    });
    await writer.upsertTopicCards(graph.subjectId, node.topicId, []);
  }
}
