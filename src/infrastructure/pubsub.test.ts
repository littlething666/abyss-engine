import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { PubSubClient } from './pubsub';

describe('PubSubClient content invalidation', () => {
  let client: PubSubClient;
  let queryClient: QueryClient;

  beforeEach(() => {
    client = new PubSubClient();
    queryClient = new QueryClient();
    client.bindQueryClient(queryClient);
    vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    client.disconnect();
    vi.restoreAllMocks();
  });

  it('invalidates topic-cards, topic-statuses, and topic-ready keys on topic-cards:updated', () => {
    client.emit({ type: 'topic-cards:updated', subjectId: 's1', topicId: 't1' });

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(3);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-cards', 's1', 't1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-statuses', 's1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-ready', 's1', 't1'] });
  });

  it('invalidates topic details, topic-statuses, and topic-ready keys on topic:updated', () => {
    client.emit({ type: 'topic:updated', subjectId: 's1', topicId: 't1' });

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(3);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic', 's1', 't1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-statuses', 's1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-ready', 's1', 't1'] });
  });

  it('publishes topic content as topic details and cards invalidation', () => {
    client.publishTopicContent('s1', 't1');

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(6);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic', 's1', 't1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-cards', 's1', 't1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-statuses', 's1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-ready', 's1', 't1'] });
  });

  it('invalidates crystal trial read keys on crystal-trial publication', () => {
    client.publishCrystalTrial('s1', 't1');

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'crystal-trial', 's1', 't1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-statuses', 's1'] });
  });

  it('invalidates backend-published subject graph read keys without local subject:updated semantics', () => {
    const publishedHandler = vi.fn();
    const subjectUpdatedHandler = vi.fn();
    client.on('subject-graph:published', publishedHandler);
    client.on('subject:updated', subjectUpdatedHandler);

    client.publishBackendSubjectGraph('s1');

    expect(publishedHandler).toHaveBeenCalledWith({ type: 'subject-graph:published', subjectId: 's1' });
    expect(subjectUpdatedHandler).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'subjects'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'subject', 's1', 'graph'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'subject', 'graphs'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['content', 'topic-statuses', 's1'] });
  });
});
