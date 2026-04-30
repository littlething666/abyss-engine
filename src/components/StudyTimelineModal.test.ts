import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { StudyTimelineModal } from './StudyTimelineModal';
import type { TelemetryEvent, TelemetryEventType } from '@/features/telemetry';

const now = 1_700_000_000_000;
const dayMs = 24 * 60 * 60 * 1000;

function telemetryEvent<T extends TelemetryEventType>(
  type: T,
  payload: Record<string, unknown>,
  overrides: Partial<Omit<TelemetryEvent, 'type' | 'payload'>> = {},
): TelemetryEvent {
  const uniqueId = overrides.id ?? `${type}-${Math.random().toString(36).slice(2, 11)}`;
  return {
    id: uniqueId,
    type,
    version: 'v1',
    timestamp: overrides.timestamp ?? now,
    sessionId: overrides.sessionId ?? `session-${type}`,
    topicId: overrides.topicId ?? 'topic-a',
    subjectId: overrides.subjectId ?? null,
    payload,
  } as TelemetryEvent;
}

const activeRoots: Array<ReturnType<typeof createRoot>> = [];

function renderTimelineModal(props: Parameters<typeof StudyTimelineModal>[0]) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  activeRoots.push(root);
  flushSync(() => {
    root.render(createElement(StudyTimelineModal, props));
  });
  return { container, root };
}

function drillIntoFirstBucket() {
  const bucket = document.querySelector('[data-testid="study-timeline-bucket"]');
  expect(bucket).not.toBeNull();
  act(() => {
    (bucket as HTMLButtonElement).click();
  });
}

afterEach(() => {
  for (const r of [...activeRoots]) {
    act(() => {
      r.unmount();
    });
  }
  activeRoots.length = 0;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('StudyTimelineModal', () => {
  it('shows summary layer with study journey before drilling into a day', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-x',
          rating: 3,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 1000,
          buffMultiplier: 1,
        }, { timestamp: now - 60_000 }),
      ],
      topicMetadata: { 'topic-a': { topicName: 'Topic A' } },
    });

    expect(document.body.textContent).toContain('Study journey');
    expect(document.querySelector('[data-testid="study-timeline-summary"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-session-group]').length).toBe(0);
  });

  it('lists sessions in chronological order and keeps review blocks in time order', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-newer',
          rating: 4,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 2000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-b',
          sessionId: 'session-b',
          timestamp: now - 1 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-oldest',
          rating: 1,
          isCorrect: false,
          difficulty: 1,
          timeTakenMs: 700,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-a',
          sessionId: 'session-a',
          timestamp: now - 4 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-latest',
          rating: 2,
          isCorrect: false,
          difficulty: 1,
          timeTakenMs: 1000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-b',
          sessionId: 'session-b',
          timestamp: now - 2 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-a': { topicName: 'Topic A' },
        'topic-b': { topicName: 'Topic B' },
      },
    });

    drillIntoFirstBucket();

    const sessionGroups = document.querySelectorAll('[data-session-group]');
    expect(sessionGroups.length).toBe(2);
    expect(sessionGroups[0]?.getAttribute('data-session-group')).toBe('session-a');
    expect(sessionGroups[1]?.getAttribute('data-session-group')).toBe('session-b');

    const buttons = document.querySelectorAll('button[data-card-id]');
    expect(buttons.length).toBe(3);
    expect(buttons[0]?.getAttribute('data-card-id')).toBe('card-oldest');
    expect(buttons[1]?.getAttribute('data-card-id')).toBe('card-latest');
    expect(buttons[2]?.getAttribute('data-card-id')).toBe('card-newer');
    expect(document.body.textContent).toContain('Topic A');
  });

  it('shows only review events in the card detail layer', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-session:completed', {
          sessionId: 'study-1',
          topicId: 'topic-a',
          totalAttempts: 2,
          correctRate: 0.8,
          sessionDurationMs: 900,
        }, {
          topicId: 'topic-a',
          sessionId: 'session-1',
          timestamp: now - dayMs,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-7',
          rating: 3,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 430,
          buffMultiplier: 1.2,
        }, {
          topicId: 'topic-b',
          sessionId: 'session-2',
          timestamp: now - 1,
        }),
      ],
      topicMetadata: {
        'topic-b': { topicName: 'Topic B' },
      },
    });

    drillIntoFirstBucket();

    const reviewBlocks = document.querySelectorAll('button[data-correctness]');
    expect(reviewBlocks.length).toBe(1);
    expect(document.body.textContent).toContain('Card card-7');
  });

  it('scales block width proportionally by review duration', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-short',
          rating: 2,
          isCorrect: false,
          difficulty: 1,
          timeTakenMs: 600,
          buffMultiplier: 1.1,
        }, {
          topicId: 'topic-a',
          sessionId: 'study-1',
          timestamp: now - 2 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-long',
          rating: 4,
          isCorrect: true,
          difficulty: 3,
          timeTakenMs: 5400,
          buffMultiplier: 1.0,
        }, {
          topicId: 'topic-a',
          sessionId: 'study-1',
          timestamp: now - 1 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-a': { topicName: 'Topic A' },
      },
    });

    drillIntoFirstBucket();

    const shortBlock = document.querySelector('button[aria-label="Card card-short, wrong, review duration 0s."]') as HTMLElement | null;
    const longBlock = document.querySelector('button[aria-label="Card card-long, correct, review duration 5s."]') as HTMLElement | null;
    expect(shortBlock).not.toBeNull();
    expect(longBlock).not.toBeNull();

    const shortWidth = shortBlock?.getAttribute('style');
    const longWidth = longBlock?.getAttribute('style');
    expect(shortWidth?.includes('width:')).toBe(true);
    expect(longWidth?.includes('width:')).toBe(true);
    expect(shortWidth).not.toBe(longWidth);
  });

  it('maps correctness to visual block colors', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-correct',
          rating: 4,
          isCorrect: true,
          difficulty: 3,
          timeTakenMs: 2500,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-b',
          sessionId: 'study-1',
          timestamp: now - 2 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-wrong',
          rating: 1,
          isCorrect: false,
          difficulty: 1,
          timeTakenMs: 3000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-b',
          sessionId: 'study-1',
          timestamp: now - 1 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-b': { topicName: 'Topic B' },
      },
    });

    drillIntoFirstBucket();

    const correctBlock = document.querySelector('button[data-correctness="correct"]');
    const wrongBlock = document.querySelector('button[data-correctness="wrong"]');
    expect(correctBlock).not.toBeNull();
    expect(wrongBlock).not.toBeNull();
    expect(correctBlock?.className).toContain('border-emerald-500/55');
    expect(wrongBlock?.className).toContain('border-rose-500/55');
  });

  it('uses full-width session rows and scales review blocks by duration within each session', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-short',
          rating: 3,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 1000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-a',
          sessionId: 'session-small',
          timestamp: now - 3 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-long-1',
          rating: 4,
          isCorrect: true,
          difficulty: 3,
          timeTakenMs: 6000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-b',
          sessionId: 'session-large',
          timestamp: now - 2 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-long-2',
          rating: 2,
          isCorrect: false,
          difficulty: 1,
          timeTakenMs: 2000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-b',
          sessionId: 'session-large',
          timestamp: now - 1 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-a': { topicName: 'Topic A' },
        'topic-b': { topicName: 'Topic B' },
      },
    });

    drillIntoFirstBucket();

    const sessionStrip = document.querySelector('[data-testid="study-timeline-detail-sessions"]') as HTMLElement | null;
    expect(sessionStrip?.className).toContain('flex-col');

    const smallGroup = document.querySelector('[data-session-group="session-small"]') as HTMLElement | null;
    const largeGroup = document.querySelector('[data-session-group="session-large"]') as HTMLElement | null;
    expect(smallGroup).not.toBeNull();
    expect(largeGroup).not.toBeNull();

    expect(smallGroup?.className).toContain('w-full');
    expect(largeGroup?.className).toContain('w-full');
    expect(smallGroup?.style.width).toBe('');
    expect(largeGroup?.style.width).toBe('');

    const ordered = document.querySelectorAll('[data-session-group]');
    expect(ordered[0]?.getAttribute('data-session-group')).toBe('session-small');
    expect(ordered[1]?.getAttribute('data-session-group')).toBe('session-large');

    const largeButtons = largeGroup?.querySelectorAll('button[data-card-id]') as NodeListOf<HTMLButtonElement>;
    expect(largeButtons?.length).toBe(2);
    const w0 = Number.parseFloat(largeButtons[0]?.style.width || '0');
    const w1 = Number.parseFloat(largeButtons[1]?.style.width || '0');
    expect(w0 + w1).toBeGreaterThanOrEqual(99);
    expect(w0 + w1).toBeLessThanOrEqual(101);
    expect(w0).toBeGreaterThan(w1);
  });

  it('renders event blocks without spacing and with square corners', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-a',
          rating: 2,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 1000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-a',
          sessionId: 'session-full',
          timestamp: now - 3 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-b',
          rating: 1,
          isCorrect: false,
          difficulty: 1,
          timeTakenMs: 3000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-a',
          sessionId: 'session-full',
          timestamp: now - 2 * 60 * 60 * 1000,
        }),
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-c',
          rating: 4,
          isCorrect: true,
          difficulty: 3,
          timeTakenMs: 6000,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-a',
          sessionId: 'session-full',
          timestamp: now - 1 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-a': { topicName: 'Topic A' },
      },
    });

    drillIntoFirstBucket();

    const group = document.querySelector('[data-session-group="session-full"]') as HTMLElement | null;
    expect(group).not.toBeNull();

    const eventRow = group?.querySelector('div.flex.items-end') as HTMLElement | null;
    expect(eventRow).not.toBeNull();
    expect(eventRow?.className).toContain('gap-0');

    const buttons = group?.querySelectorAll('button[data-card-id]') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(3);
    expect(buttons[0]?.className).toContain('rounded-none');

    const totalWidth = Array.from(buttons).reduce((sum, button) => (
      sum + Number.parseFloat(button.style.width || '0')
    ), 0);
    expect(totalWidth).toBeGreaterThanOrEqual(99);
    expect(totalWidth).toBeLessThanOrEqual(101);
  });

  it('opens compact popover with full review metrics', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-7',
          rating: 3,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 430,
          buffMultiplier: 1.2,
        }, {
          topicId: 'topic-b',
          sessionId: 'study-1',
          timestamp: now - 2 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-b': { topicName: 'Topic B' },
      },
    });

    drillIntoFirstBucket();

    const block = document.querySelector('[data-card-id="card-7"]') as HTMLElement | null;
    expect(block).not.toBeNull();
    act(() => {
      flushSync(() => {
        block?.click();
      });
    });
    expect(document.body.textContent).toContain('Review');
    expect(document.body.textContent).toContain('Card card-7');
    expect(document.body.textContent).toContain('Session study-1');
    expect(document.body.textContent).toContain('Correct');
    expect(document.body.textContent).toContain('Rating 3/4');
    expect(document.body.textContent).toContain('Difficulty 2');
    expect(document.body.textContent).toContain('Buff x 1.2');
  });

  it('invokes onOpenEntryStudy when Open in study is used', () => {
    const onOpenEntryStudy = vi.fn();
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      onOpenEntryStudy,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-7',
          rating: 3,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 430,
          buffMultiplier: 1.2,
        }, {
          topicId: 'topic-b',
          sessionId: 'study-1',
          subjectId: 'sub-b',
          timestamp: now - 2 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-b': { topicName: 'Topic B' },
      },
    });

    drillIntoFirstBucket();

    const block = document.querySelector('[data-card-id="card-7"]') as HTMLElement | null;
    expect(block).not.toBeNull();
    act(() => {
      flushSync(() => {
        block?.click();
      });
    });

    const openStudy = document.querySelector('[data-testid="study-timeline-open-study"]') as HTMLButtonElement | null;
    expect(openStudy).not.toBeNull();
    act(() => {
      flushSync(() => {
        openStudy?.click();
      });
    });

    expect(onOpenEntryStudy).toHaveBeenCalledWith({
      subjectId: 'sub-b',
      topicId: 'topic-b',
      cardId: 'card-7',
    });
  });

  it('shows empty state when events are outside the timeline range and closes', () => {
    const onClose = vi.fn();
    renderTimelineModal({
      isOpen: true,
      onClose,
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'old-card',
          rating: 3,
          isCorrect: true,
          difficulty: 1,
          timeTakenMs: 500,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-a',
          sessionId: 'study-1',
          timestamp: now - 100 * dayMs,
        }),
      ],
      topicMetadata: {
        'topic-a': { topicName: 'Topic A' },
      },
    });

    expect(document.body.textContent).toContain('No study activity yet.');

    const closeButton = document.body.querySelector('[data-slot="dialog-close"]') as
      | HTMLButtonElement
      | null;
    act(() => {
      closeButton?.click();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the curated topic icon next to the session topic name', () => {
    renderTimelineModal({
      isOpen: true,
      onClose: vi.fn(),
      timelineNow: now,
      eventsOverride: [
        telemetryEvent('study-card:reviewed', {
          cardId: 'card-icon',
          rating: 3,
          isCorrect: true,
          difficulty: 2,
          timeTakenMs: 1500,
          buffMultiplier: 1,
        }, {
          topicId: 'topic-a',
          sessionId: 'session-icon',
          timestamp: now - 1 * 60 * 60 * 1000,
        }),
      ],
      topicMetadata: {
        'topic-a': { topicName: 'Topic A', iconName: 'rocket' },
      },
    });

    drillIntoFirstBucket();

    const sessionGroup = document.querySelector('[data-session-group="session-icon"]');
    expect(sessionGroup).not.toBeNull();
    expect(sessionGroup?.querySelector('[data-topic-icon="rocket"]')).not.toBeNull();
    expect(sessionGroup?.textContent).toContain('Topic A');
  });
});
