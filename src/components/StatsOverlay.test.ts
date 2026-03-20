import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import type { Buff } from '../types/progression';
import { StatsOverlay } from './StatsOverlay';

function renderStatsOverlay(props: Parameters<typeof StatsOverlay>[0]) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(createElement(StatsOverlay, props));
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('StatsOverlay', () => {
  it('shows compact buff hint when buffs exist', () => {
    const { root } = renderStatsOverlay({
      totalCards: 5,
      dueCards: 1,
      activeBuffs: [
        {
          buffId: 'b1',
          modifierType: 'xp_multiplier',
          magnitude: 1.1,
          condition: 'manual',
          source: 'test',
        } satisfies Buff,
      ],
    });

    expect(document.body.textContent).toContain('Tap buff for sources');
    root.unmount();
  });

  it('invokes timeline action from the cards/buffs stack', () => {
    const onOpenStudyTimeline = vi.fn();
    const { root } = renderStatsOverlay({
      totalCards: 10,
      dueCards: 4,
      onOpenStudyTimeline,
    });

    const timelineButton = document.body.querySelector('[aria-label="Open study timeline"]') as
      | HTMLButtonElement
      | null;
    expect(timelineButton).not.toBeNull();
    timelineButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenStudyTimeline).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});
