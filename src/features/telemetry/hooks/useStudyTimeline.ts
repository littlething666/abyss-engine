import { useMemo } from 'react';

import { useTelemetryStore } from '../telemetryStore';
import {
  DEFAULT_TIMELINE_DAYS,
  TIMELINE_LAYER_REVIEW_TYPES,
  buildTimelineEntries,
  type StudyTimelineEntry,
  type TimelineQueryOptions,
  type TimelineTopicMetadata,
  type TimelineEntryType,
} from '../timeline';

interface UseStudyTimelineOptions {
  daysWindow?: number;
  includeEventTypes?: ReadonlyArray<TimelineEntryType>;
  topicMetadata?: TimelineTopicMetadata;
  now?: number;
}

export interface UseStudyTimelineResult {
  timelineEntries: StudyTimelineEntry[];
}

function buildTimelineOptions(options: UseStudyTimelineOptions): TimelineQueryOptions {
  const {
    daysWindow = DEFAULT_TIMELINE_DAYS,
    includeEventTypes = TIMELINE_LAYER_REVIEW_TYPES,
    topicMetadata,
    now,
  } = options;

  return {
    daysWindow,
    includeEventTypes,
    topicMetadata,
    now,
  };
}

export function useStudyTimeline(options: UseStudyTimelineOptions = {}): UseStudyTimelineResult {
  const events = useTelemetryStore((state) => state.events);
  const queryOptions = useMemo(() => buildTimelineOptions(options), [
    options.daysWindow,
    options.includeEventTypes,
    options.topicMetadata,
    options.now,
  ]);

  const timelineEntries = useMemo(() => {
    return buildTimelineEntries(events, queryOptions as TimelineQueryOptions);
  }, [events, queryOptions]);

  return { timelineEntries };
}
