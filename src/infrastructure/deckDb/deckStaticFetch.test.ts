import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { fetchTopicCards } from './deckStaticFetch';

describe('fetchTopicCards', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array when all candidate paths return 404', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 404 }));
    const cards = await fetchTopicCards('sub', 'topic');
    expect(cards).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses first successful response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ topicId: 'topic', cards: [] }), { status: 200 }));
    const cards = await fetchTopicCards('sub', 'topic');
    expect(cards).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
