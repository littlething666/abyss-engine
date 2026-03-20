import { useMemo } from 'react';

import { useTelemetryStore } from '../telemetryStore';
import type { TelemetryEvent } from '../types';
import {
  TIMELINE_LAYER_REVIEW_TYPES,
  buildTimelineEntries,
  buildTimelineSummaryBuckets,
  type StudyTimelineEntry,
  type StudyTimelineSummaryBucket,
  type TimelineQueryOptions,
  type TimelineTopicMetadata,
} from '../timeline';

export interface UseStudyTimelineLayersOptions {
  daysWindow: number;
  topicMetadata?: TimelineTopicMetadata;
  now?: number;
  /** When set (e.g. in tests), bypasses the live telemetry store. */
  eventsOverride?: TelemetryEvent[] | null;
}

export interface UseStudyTimelineLayersResult {
  summaryBuckets: StudyTimelineSummaryBucket[];
  reviewEntries: StudyTimelineEntry[];
}

export function useStudyTimelineLayers(
  options: UseStudyTimelineLayersOptions,
): UseStudyTimelineLayersResult {
  const storeEvents = useTelemetryStore((state) => state.events);
  const events = options.eventsOverride ?? storeEvents;
  const now = options.now ?? Date.now();
  const { daysWindow, topicMetadata } = options;

  const queryBase = useMemo(
    () => ({ daysWindow, now, topicMetadata }),
    [daysWindow, now, topicMetadata],
  );

  const summaryBuckets = useMemo(
    () => buildTimelineSummaryBuckets(events, queryBase),
    [events, queryBase],
  );

  const reviewQuery = useMemo(
    (): TimelineQueryOptions => ({
      ...queryBase,
      includeEventTypes: TIMELINE_LAYER_REVIEW_TYPES,
    }),
    [queryBase],
  );

  const reviewEntries = useMemo(
    () => buildTimelineEntries(events, reviewQuery),
    [events, reviewQuery],
  );

  return { summaryBuckets, reviewEntries };
}
