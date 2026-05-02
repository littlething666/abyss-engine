import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { ConnectionWebContent } from '../../types/core';
import { evaluateMiniGame } from '../../features/content/evaluateMiniGame';
import { useMiniGameInteraction } from '../../hooks/useMiniGameInteraction';
import { ConnectionWebGame, connectionWebRightNodeId } from './ConnectionWebGame';

const sampleContent: ConnectionWebContent = {
  gameType: 'CONNECTION_WEB',
  prompt: 'Match',
  pairs: [
    { id: 'a', left: 'LA', right: 'RA' },
    { id: 'b', left: 'LB', right: 'RB' },
    { id: 'c', left: 'LC', right: 'RC' },
    { id: 'd', left: 'LD', right: 'RD' },
  ],
  explanation: 'Test',
};

function Harness({ content }: { content: ConnectionWebContent }) {
  const itemIds = [
    ...content.pairs.map((p) => p.id),
    ...(content.distractors ?? []).filter((d) => d.side === 'left').map((d) => d.id),
  ];
  const requiredItemIds = content.pairs.map((p) => p.id);
  const evaluateFn = useCallback(
    (placements: Map<string, string>) => evaluateMiniGame(content, placements),
    [content],
  );
  const interaction = useMiniGameInteraction({ itemIds, requiredItemIds, evaluateFn });
  return createElement(ConnectionWebGame, { content, interaction });
}

function renderHarness(content: ConnectionWebContent = sampleContent) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    flushSync(() => {
      root.render(createElement(Harness, { content }));
    });
  });
  return { container, unmount: () => root.unmount() };
}

function readRightLabels(container: HTMLElement): string[] {
  const buttons = container.querySelectorAll('[data-testid="connection-web-game"] button');
  return [...buttons]
    .filter((_, i) => i % 2 === 1)
    .map((b) => b.textContent?.trim() ?? '');
}

function clickByTestId(container: HTMLElement, testId: string) {
  const btn = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
  if (!btn) throw new Error(`Button with data-testid="${testId}" not found`);
  act(() => {
    flushSync(() => {
      btn.click();
    });
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ConnectionWebGame', () => {
  it('renders paired rows with one left and one right chip per row', () => {
    const { container, unmount } = renderHarness();
    const rows = container.querySelectorAll('[data-testid="connection-web-row"]');
    expect(rows.length).toBe(4);
    expect(container.querySelectorAll('[data-testid="connection-web-game"] button').length).toBe(8);
    unmount();
  });

  it('includes distractors in row counts', () => {
    const content: ConnectionWebContent = {
      ...sampleContent,
      distractors: [
        { id: 'dl', side: 'left', label: 'DL' },
        { id: 'dr', side: 'right', label: 'DR' },
      ],
    };
    const { container, unmount } = renderHarness(content);
    expect(container.querySelectorAll('[data-testid="connection-web-row"]').length).toBe(5);
    expect(container.querySelectorAll('[data-testid="connection-web-game"] button').length).toBe(10);
    unmount();
  });

  it('right column initial order is deterministic (shuffled, not pair insertion order)', () => {
    const { container, unmount } = renderHarness();
    const rightLabels = readRightLabels(container);
    const natural = sampleContent.pairs.map((p) => p.right);
    expect(rightLabels).not.toEqual(natural);
    unmount();
  });

  it('does not render the legacy SVG connector layer', () => {
    const { container, unmount } = renderHarness();
    expect(container.querySelector('svg')).toBeNull();
    unmount();
  });

  it('moves the matched right chip into the row of its left chip when placed', () => {
    const { container, unmount } = renderHarness();

    // Pair 'a' has left at row index 0; selecting then connecting must align RA there.
    clickByTestId(container, 'mg-item-a');
    clickByTestId(container, 'mg-item-right-a');

    expect(readRightLabels(container)[0]).toBe('RA');
    unmount();
  });

  it('preserves every right chip on placement (the displaced chip falls into the freed row)', () => {
    const { container, unmount } = renderHarness();
    const before = readRightLabels(container);

    // Pair 'b' has left at row index 1; placing it pulls RB to row 1 and bumps whoever was there.
    clickByTestId(container, 'mg-item-b');
    clickByTestId(container, 'mg-item-right-b');

    const after = readRightLabels(container);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after[1]).toBe('RB');
    unmount();
  });

  it('exports stable right node ids for pairs', () => {
    expect(connectionWebRightNodeId('a')).toBe('right-a');
  });
});
