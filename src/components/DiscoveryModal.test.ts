import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import DiscoveryModal from './DiscoveryModal';

const DISCOVERY_MODAL_SUBJECT_STORAGE_KEY = 'abyss:discoveryModalSubjectId';

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

const mockSubject = (id: string, name: string) => ({
  id,
  name,
  description: '',
  color: '#336699',
  geometry: { gridTile: 'box' as const },
});

vi.mock('../features/progression', () => ({
  useProgressionStore: (selector: (state: typeof progressionState) => unknown) => selector(progressionState),
}));

vi.mock('../features/content', () => ({
  useAllGraphs: () => [],
  useSubjects: () => ({
    data: [mockSubject('sub-x', 'Subject X'), mockSubject('sub-a', 'Subject A'), mockSubject('sub-y', 'Subject Y')],
  }),
  useSubjectGraphs: () => [],
}));

vi.mock('../features/contentGeneration/contentGenerationStore', () => ({
  useContentGenerationStore: (fn: (s: { jobs: Record<string, never> }) => unknown) => fn({ jobs: {} }),
}));

vi.mock('../hooks/useTopicContentStatusMap', () => ({
  useTopicContentStatusMap: () => ({}),
}));

const featureFlagsState = { ritualVisible: true };
vi.mock('@/store/featureFlagsStore', () => ({
  useFeatureFlagsStore: (selector: (state: typeof featureFlagsState) => unknown) => selector(featureFlagsState),
}));

function renderDiscoveryModal(props: Parameters<typeof DiscoveryModal>[0]) {
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() => {
    root.render(createElement(DiscoveryModal, props));
  });
  return { container, root };
}

beforeEach(() => {
  sessionStorage.removeItem(DISCOVERY_MODAL_SUBJECT_STORAGE_KEY);
});

afterEach(() => {
  vi.clearAllMocks();
  progressionState.getTopicsByTier.mockReturnValue([]);
  featureFlagsState.ritualVisible = true;
  sessionStorage.removeItem(DISCOVERY_MODAL_SUBJECT_STORAGE_KEY);
  document.body.innerHTML = '';
});

describe('DiscoveryModal', () => {
  it('opens the attunement ritual modal through the header action', () => {
    const onOpenRitual = vi.fn();
    const onClose = vi.fn();
    const { root } = renderDiscoveryModal({
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

  it('renders ritual action with visible Ritual label', () => {
    const { root } = renderDiscoveryModal({
      isOpen: true,
      unlockPoints: 1,
      ritualCooldownRemainingMs: 5400000,
      onOpenRitual: vi.fn(),
      onClose: vi.fn(),
    });

    const openRitualButton = document.body.querySelector('[aria-label="Open attunement ritual"]') as
      | HTMLButtonElement
      | null;
    expect(openRitualButton).not.toBeNull();
    expect(openRitualButton?.textContent).toContain('Ritual');
    expect(openRitualButton?.textContent).toContain('🧪');
    root.unmount();
  });

  it('shows unlock points in description and as KeyRound badge', () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 't1',
            name: 'A',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'lightbulb' as const,
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
            isCurriculumVisible: true,
          },
        ],
      },
    ]);

    const { root } = renderDiscoveryModal({
      isOpen: true,
      unlockPoints: 5,
      onClose: vi.fn(),
    });

    expect(document.body.textContent).toContain('Spend keys to unlock topic crystals, tier by tier.');
    const badge = document.body.querySelector('[title="Unlock points"]');
    expect(badge?.textContent?.trim()).toBe('5');
    root.unmount();
  });

  it('shows topic filter counts on toggle items', () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 't-locked',
            name: 'L',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'lightbulb' as const,
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
            isCurriculumVisible: true,
          },
          {
            id: 't-ready',
            name: 'U',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'lightbulb' as const,
            contentStatus: 'ready' as const,
            isLocked: false,
            isUnlocked: true,
            isCurriculumVisible: true,
          },
          {
            id: 't-hidden',
            name: 'H',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'lightbulb' as const,
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

    expect(document.body.querySelector('[aria-label="Locked topics, 1"]')).not.toBeNull();
    expect(document.body.querySelector('[aria-label="Unlocked topics, 1"]')).not.toBeNull();
    expect(document.body.querySelector('[aria-label="All topics, 2"]')).not.toBeNull();
    root.unmount();
  });

  it('renders subject group labels when viewing all subjects', () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 'topic-b',
            name: 'Beta Topic',
            description: 'Other',
            subjectId: 'sub-y',
            subjectName: 'Organic Chemistry',
            iconName: 'lightbulb' as const,
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
            isCurriculumVisible: true,
          },
          {
            id: 'topic-a',
            name: 'Alpha Topic',
            description: 'Description text',
            subjectId: 'sub-x',
            subjectName: 'Quantum Physics',
            iconName: 'lightbulb' as const,
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
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

    const headings = document.body.querySelectorAll('h3');
    const labels = [...headings].map((h) => h.textContent?.trim()).filter(Boolean);
    // Descending manifest order: sub-y before sub-x — not tier topic iteration order.
    expect(labels).toEqual(['Organic Chemistry', 'Quantum Physics']);
    expect(document.body.textContent).toContain('Alpha Topic');
    expect(document.body.textContent).toContain('Beta Topic');
    root.unmount();
  });

  it('hides subject group headings when a single subject is selected in the modal', () => {
    sessionStorage.setItem(DISCOVERY_MODAL_SUBJECT_STORAGE_KEY, 'sub-x');
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 'topic-a',
            name: 'Alpha Topic',
            description: 'Description text',
            subjectId: 'sub-x',
            subjectName: 'Scoped Subject Label',
            iconName: 'lightbulb' as const,
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
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

    expect(document.body.textContent).toContain('Alpha Topic');
    expect(document.body.querySelectorAll('h3').length).toBe(0);
    expect(document.body.textContent).not.toContain('Scoped Subject Label');
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
            iconName: 'lightbulb' as const,
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
            iconName: 'lightbulb' as const,
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

  it('shows empty state with reset when no topics match the locked filter', () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 't1',
            name: 'Only unlocked',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'lightbulb' as const,
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

    expect(document.body.textContent).toContain('No topics match');
    expect(document.body.textContent).toContain('Reset filters');
    root.unmount();
  });

  it('reset filters widens list and clears stored modal subject', async () => {
    sessionStorage.setItem(DISCOVERY_MODAL_SUBJECT_STORAGE_KEY, 'sub-a');
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 't1',
            name: 'Only unlocked',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'lightbulb' as const,
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

    expect(document.body.textContent).toContain('No topics match');
    const resetBtn = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Reset filters'),
    ) as HTMLButtonElement | undefined;
    expect(resetBtn).toBeDefined();
    await act(async () => {
      resetBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sessionStorage.getItem(DISCOVERY_MODAL_SUBJECT_STORAGE_KEY)).toBe('__all_floors__');
    expect(document.body.textContent).toContain('Only unlocked');
    root.unmount();
  });

  it('renders the curated topic icon and a Lucide lock badge for locked topics', () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 't-locked-with-icon',
            name: 'Locked Topic',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'lightbulb' as const,
            contentStatus: 'ready' as const,
            isLocked: true,
            isUnlocked: false,
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

    const tile = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Locked Topic'),
    );
    expect(tile).toBeDefined();
    expect(tile?.querySelector('[data-topic-icon="lightbulb"]')).not.toBeNull();
    expect(tile?.querySelector('[data-testid="discovery-topic-lock-badge"]')).not.toBeNull();
    expect(tile?.querySelector('[data-testid="discovery-topic-unlock-badge"]')).toBeNull();
    root.unmount();
  });

  it('renders the curated topic icon and a Lucide unlock badge for unlocked topics after toggling the unlocked filter', async () => {
    progressionState.getTopicsByTier.mockReturnValue([
      {
        tier: 1,
        topics: [
          {
            id: 't-unlocked-with-icon',
            name: 'Unlocked Topic',
            description: '',
            subjectId: 's',
            subjectName: 'S',
            iconName: 'rocket' as const,
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

    // Default filter is 'locked' — toggle to 'Unlocked' so the unlocked tile renders.
    const unlockedToggle = document.body.querySelector('[aria-label="Unlocked topics, 1"]') as
      | HTMLButtonElement
      | null;
    expect(unlockedToggle).not.toBeNull();
    await act(async () => {
      unlockedToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const tile = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Unlocked Topic'),
    );
    expect(tile).toBeDefined();
    expect(tile?.querySelector('[data-topic-icon="rocket"]')).not.toBeNull();
    expect(tile?.querySelector('[data-testid="discovery-topic-unlock-badge"]')).not.toBeNull();
    expect(tile?.querySelector('[data-testid="discovery-topic-lock-badge"]')).toBeNull();
    root.unmount();
  });
});
