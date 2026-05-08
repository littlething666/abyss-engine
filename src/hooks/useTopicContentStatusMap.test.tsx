import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicContentStatus, TopicContentStatusRecord } from '@/types/topicContent';

import { useTopicContentStatusMap } from './useTopicContentStatusMap';

vi.mock('@/features/content', () => ({
  useAllGraphs: () => [
    {
      subjectId: 'sub-1',
      nodes: [{ topicId: 't-a' }],
    },
  ],
}));

const readyStatusRows: TopicContentStatusRecord[] = [{ subjectId: 'sub-1', topicId: 't-a', status: 'ready' }];
const generatingStatusRows: TopicContentStatusRecord[] = [{ subjectId: 'sub-1', topicId: 't-a', status: 'generating' }];
const unavailableStatusRows: TopicContentStatusRecord[] = [{ subjectId: 'sub-1', topicId: 't-a', status: 'unavailable' }];
const queryResults: { data?: TopicContentStatusRecord[] }[] = [{ data: readyStatusRows }];

vi.mock('@tanstack/react-query', () => ({
  useQueries: () => queryResults,
}));

vi.mock('@/infrastructure/di', () => ({
  deckRepository: {},
}));

let lastMap: Record<string, TopicContentStatus> = {};

function CaptureHook() {
  const map = useTopicContentStatusMap();
  useLayoutEffect(() => {
    lastMap = map;
  });
  return null;
}

describe('useTopicContentStatusMap', () => {
  let root: Root;

  beforeEach(() => {
    queryResults[0] = { data: readyStatusRows };
    lastMap = {};
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = '';
  });

  it('uses the backend Topic Content Status ready row', () => {
    queryResults[0] = { data: readyStatusRows };

    act(() => {
      root.render(createElement(CaptureHook));
    });
    expect(lastMap['sub-1::t-a']).toBe('ready');
  });

  it('uses the backend Topic Content Status generating row', () => {
    queryResults[0] = { data: generatingStatusRows };

    act(() => {
      root.render(createElement(CaptureHook));
    });
    expect(lastMap['sub-1::t-a']).toBe('generating');
  });

  it('uses the backend Topic Content Status unavailable row', () => {
    queryResults[0] = { data: unavailableStatusRows };

    act(() => {
      root.render(createElement(CaptureHook));
    });
    expect(lastMap['sub-1::t-a']).toBe('unavailable');
  });
});
