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

  it('invalidates topic-cards and topic-ready keys on cards-updated', () => {
    client.emit({ type: 'cards-updated', subjectId: 's1', topicId: 't1' });

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['content', 'topic-cards', 's1', 't1'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['content', 'topic-ready', 's1', 't1'],
    });
  });

  it('invalidates topic details and topic-ready keys on topic-updated', () => {
    client.emit({ type: 'topic-updated', subjectId: 's1', topicId: 't1' });

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['content', 'topic', 's1', 't1'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['content', 'topic-ready', 's1', 't1'],
    });
  });
});
