import { describe, expect, it, vi } from 'vitest';

import {
  applyOpenTopicStudyEffect,
  type OpenTopicStudyAdapterDeps,
} from './openTopicStudyAdapter';

type FakeCard = { id: string };

function makeDeps(
  cards: ReadonlyArray<FakeCard>,
): OpenTopicStudyAdapterDeps<FakeCard> & { _calls: string[] } {
  const calls: string[] = [];
  return {
    selectTopic: vi.fn(() => {
      calls.push('selectTopic');
    }),
    startTopicStudySession: vi.fn(() => {
      calls.push('startTopicStudySession');
    }),
    openStudyPanel: vi.fn(() => {
      calls.push('openStudyPanel');
    }),
    getCardsForTopic: vi.fn(() => cards),
    _calls: calls,
  };
}

describe('applyOpenTopicStudyEffect', () => {
  it('selects the topic, starts a study session with the available cards, and opens the panel - in that order', () => {
    const deps = makeDeps([{ id: 'c1' }, { id: 'c2' }]);

    applyOpenTopicStudyEffect(
      { subjectId: 'subj-1', topicId: 'topic-1' },
      deps,
    );

    expect(deps.selectTopic).toHaveBeenCalledWith({
      subjectId: 'subj-1',
      topicId: 'topic-1',
    });
    expect(deps.startTopicStudySession).toHaveBeenCalledWith(
      { subjectId: 'subj-1', topicId: 'topic-1' },
      [{ id: 'c1' }, { id: 'c2' }],
    );
    expect(deps.openStudyPanel).toHaveBeenCalledTimes(1);
    expect(deps._calls).toEqual([
      'selectTopic',
      'startTopicStudySession',
      'openStudyPanel',
    ]);
  });

  it('skips startTopicStudySession when the topic has no cards available, but still selects + opens the panel', () => {
    const deps = makeDeps([]);

    applyOpenTopicStudyEffect(
      { subjectId: 'subj-2', topicId: 'topic-2' },
      deps,
    );

    expect(deps.selectTopic).toHaveBeenCalledWith({
      subjectId: 'subj-2',
      topicId: 'topic-2',
    });
    expect(deps.startTopicStudySession).not.toHaveBeenCalled();
    expect(deps.openStudyPanel).toHaveBeenCalledTimes(1);
    expect(deps._calls).toEqual(['selectTopic', 'openStudyPanel']);
  });

  it('queries cards via getCardsForTopic with the same topic ref', () => {
    const deps = makeDeps([]);

    applyOpenTopicStudyEffect(
      { subjectId: 'algebra', topicId: 'matrices' },
      deps,
    );

    expect(deps.getCardsForTopic).toHaveBeenCalledWith({
      subjectId: 'algebra',
      topicId: 'matrices',
    });
  });
});
