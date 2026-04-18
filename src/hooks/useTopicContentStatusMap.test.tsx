import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';
import type { TopicContentStatus } from '@/types/progression';

import { useContentGenerationStore } from '@/features/contentGeneration';
import { useTopicContentStatusMap } from './useTopicContentStatusMap';

vi.mock('@/features/content', () => ({
  useAllGraphs: () => [
    {
      subjectId: 'sub-1',
      nodes: [{ topicId: 't-a' }],
    },
  ],
}));

const queryResults: { data?: boolean }[] = [{ data: true }];

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
    useContentGenerationStore.setState({
      jobs: {},
      pipelines: {},
      abortControllers: {},
      pipelineAbortControllers: {},
    });
    queryResults[0] = { data: true };
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

  it("prefers 'generating' over 'ready' when a crystal content job is in-flight", () => {
    queryResults[0] = { data: true };
    const job: ContentGenerationJob = {
      id: 'job-1',
      pipelineId: 'p1',
      kind: 'topic-mini-games',
      status: 'streaming',
      label: 'Mini',
      subjectId: 'sub-1',
      topicId: 't-a',
      createdAt: 0,
      startedAt: 1,
      finishedAt: null,
      inputMessages: null,
      rawOutput: '',
      reasoningText: null,
      error: null,
      parseError: null,
      retryOf: null,
      metadata: null,
    };
    useContentGenerationStore.setState({ jobs: { 'job-1': job } });

    act(() => {
      root.render(createElement(CaptureHook));
    });
    expect(lastMap['sub-1::t-a']).toBe('generating');
  });

  it("ignores in-flight crystal-trial jobs for the topic's status", () => {
    queryResults[0] = { data: false };
    const job: ContentGenerationJob = {
      id: 'trial-1',
      pipelineId: null,
      kind: 'crystal-trial',
      status: 'streaming',
      label: 'Trial',
      subjectId: 'sub-1',
      topicId: 't-a',
      createdAt: 0,
      startedAt: 1,
      finishedAt: null,
      inputMessages: null,
      rawOutput: '',
      reasoningText: null,
      error: null,
      parseError: null,
      retryOf: null,
      metadata: null,
    };
    useContentGenerationStore.setState({ jobs: { 'trial-1': job } });

    act(() => {
      root.render(createElement(CaptureHook));
    });
    expect(lastMap['sub-1::t-a']).toBe('unavailable');
  });

  it("marks 'generating' for in-flight topic-expansion-cards jobs", () => {
    queryResults[0] = { data: true };
    const job: ContentGenerationJob = {
      id: 'exp-1',
      pipelineId: null,
      kind: 'topic-expansion-cards',
      status: 'parsing',
      label: 'Expansion',
      subjectId: 'sub-1',
      topicId: 't-a',
      createdAt: 0,
      startedAt: 1,
      finishedAt: null,
      inputMessages: null,
      rawOutput: '',
      reasoningText: null,
      error: null,
      parseError: null,
      retryOf: null,
      metadata: { nextLevel: 1 },
    };
    useContentGenerationStore.setState({ jobs: { 'exp-1': job } });

    act(() => {
      root.render(createElement(CaptureHook));
    });
    expect(lastMap['sub-1::t-a']).toBe('generating');
  });
});
