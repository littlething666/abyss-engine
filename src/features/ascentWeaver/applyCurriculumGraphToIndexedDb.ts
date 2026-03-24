import type { IDeckContentWriter } from '../../types/repository';
import type { Subject, SubjectGraph } from '../../types/core';

export interface ApplyCurriculumGraphInput {
  subject: Subject;
  graph: SubjectGraph;
}

/**
 * Persists subject row, full graph, stub topic details, and empty card decks for every node.
 */
export async function applyCurriculumGraphToIndexedDb(
  writer: IDeckContentWriter,
  input: ApplyCurriculumGraphInput,
): Promise<void> {
  const { subject, graph } = input;

  if (subject.id !== graph.subjectId) {
    throw new Error(`Subject id "${subject.id}" does not match graph.subjectId "${graph.subjectId}"`);
  }

  await writer.upsertSubject({ ...subject, themeId: graph.themeId });
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
