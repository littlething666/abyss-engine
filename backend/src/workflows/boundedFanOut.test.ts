import { describe, expect, it } from 'vitest';

import { mapWithBoundedConcurrency } from './boundedFanOut';

describe('mapWithBoundedConcurrency', () => {
  it('preserves input order while limiting active tasks', async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapWithBoundedConcurrency({
      items: [30, 10, 20, 5],
      concurrency: 2,
      task: async (delay, index) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return `item-${index}`;
      },
    });

    expect(results).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
    expect(maxActive).toBe(2);
  });

  it('rejects invalid concurrency instead of silently falling back', async () => {
    await expect(mapWithBoundedConcurrency({
      items: [1],
      concurrency: 0,
      task: async (value) => value,
    })).rejects.toThrow('bounded fan-out concurrency must be a positive integer');
  });
});
