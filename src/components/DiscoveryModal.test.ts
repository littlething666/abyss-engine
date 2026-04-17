import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import DiscoveryModal from './DiscoveryModal';

const progressionState = {
  getTopicsByTier: vi.fn(() => [] as { tier: number; topics: unknown[] }[]),
  unlockTopic: () => null,
  activeCrystals: [],
  getTopicUnlockStatus: () => ({
    canUnlock: false,
    hasPrerequisites: false,
    hasEnoughPoints: false,
    unlockPoints: 0,
    missingPrerequisites: [],
  }),
};

vi.mock('../features/progression', () => ({
  useProgressionStore: (selector: (state: typeof progressionState) => unknown) => selector(progressionState),
}));

vi.mock('../features/content', () => ({
  useAllGraphs: () => [],
  useSubjects: () => [],
  useSubjectGraphs: () => [],
}));

vi.mock('@/hooks/useTopicContentStatusMap', () => ({
  useTopicContentStatusMap: () => ({}),
}));

function renderDiscoveryModal(props: Parameters<typeof DiscoveryModal>[0]) {
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() => {
    root.render(createElement(DiscoveryModal, props));
  });
  return { container, root };
}

afterEach(() => {
  vi.clearAllMocks();
  progressionState.getTopicsByTier.mockReturnValue([]);
  document.body.innerHTML = '';
});

describe('DiscoveryModal', () => {
  it('opens IncrementalSubjectModal from the new subject header action', async () => {
    const onClose = vi.fn();
    const { root } = renderDiscoveryModal({
      isOpen: true,
      unlockPoints: 3,
      onClose,
    });

    const newSubjectButton = document.body.querySelector('[aria-label="Generate new subject"]') as
      | HTMLButtonElement
      | null;
    expect(newSubjectButton).not.toBeNull();
    await act(async () => {
      newSubjectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('New subject');

    root.unmount();
  });

  it('opens the attunement ritual modal through the header action', () => {
    const onOpenRitual = vi.fn();
    const onClose = vi.fn();
    const { container, root } = renderDiscoveryModal({
      isOpen: true,
    unlockPoints: 3,
    onOpenRitual,
    onClose,
    });

    const openRitualButton = document.body.querySelector('[aria-label="Open attunement ritual"]') as
      | HTMLButtonElement
      | null;
    expect(openRitualButton).not.toBeNull();
    openRitualButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenRitual).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it('renders an icon-only ritual action button', () => {
    const { container, root } = renderDiscoveryModal({
      isOpen: true,
    unlockPoints: 1,
    ritualCooldownRemainingMs: 5400000, // 1h 30m
    onOpenRitual: vi.fn(),
    onClose: vi.fn(),
    });

    const openRitualButton = document.body.querySelector('[aria-label="Open attunement ritual"]') as
      | HTMLButtonElement
      | null;
    expect(openRitualButton).not.toBeNull();
    expect(openRitualButton?.textContent?.trim()).toBe('🧪');
    root.unmount();
  });

  it('shows due and total cards inline with locked topic summary', () => {
    const { root } = renderDiscoveryModal({
      isOpen: true,
      unlockPoints: 1,
      dueCards: 3,
      totalCards: 12,
      onClose: vi.fn(),
    });

    expect(document.body.textContent).toMatch(/3\/12 cards due/);
    expect(document.body.textContent).toMatch(/locked topic/);
    root.unmount();
  });

  it('renders subject name badge on each topic card', () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 'topic-a',
            name: 'Alpha Topic',
            description: 'Description text',
            subjectId: 'sub-x',
            subjectName: 'Quantum Physics',
            contentStatus: 'ready' as const,
            isLocked: false,
            isUnlocked: true,
            isCurriculumVisible: true,
          },
        ],
      },
    ]);

    const { root } = renderDiscoveryModal({
      isOpen: true,
      unlockPoints: 1,
      onClose: vi.fn(),
    });

    expect(document.body.textContent).toContain('Quantum Physics');
    expect(document.body.textContent).toContain('Alpha Topic');
    root.unmount();
  });

  it('hides tier sections that have no curriculum-visible topics', () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 't1',
            name: 'Visible',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
            isCurriculumVisible: true,
          },
        ],
      },
      {
        tier: 2,
        topics: [
          {
            id: 't2',
            name: 'Hidden tier row',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
            isCurriculumVisible: false,
          },
        ],
      },
    ]);

    const { root } = renderDiscoveryModal({
      isOpen: true,
      unlockPoints: 1,
      onClose: vi.fn(),
    });

    expect(document.body.textContent).toContain('Tier 1');
    expect(document.body.textContent).not.toContain('Tier 2');
    expect(document.body.textContent).toContain('Visible');
    expect(document.body.textContent).not.toContain('Hidden tier row');
    root.unmount();
  });
});
