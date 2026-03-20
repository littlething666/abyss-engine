import { type TelemetryEvent } from './types';

export type TimelineEntryType = 'study_session_complete' | 'attunement_ritual_submitted' | 'study_card_reviewed';

export interface TimelineMetric {
  label: string;
  value: string;
}

export interface TimelineTopicMetadata {
  [topicId: string]: {
    topicName?: string;
  };
}

export interface StudyTimelineEntry {
  id: string;
  type: TimelineEntryType;
  topicId: string;
  topicName: string;
  sessionId: string;
  timestamp: number;
  occurredAt: number;
  title: string;
  summary: string;
  cardId?: string;
  durationMs?: number;
  isCorrect?: boolean;
  metrics: TimelineMetric[];
}

export interface TimelineQueryOptions {
  topicMetadata?: TimelineTopicMetadata;
  daysWindow?: number;
  now?: number;
  includeEventTypes?: ReadonlyArray<TimelineEntryType>;
}

export const DEFAULT_TIMELINE_DAYS = 1;
export const MAX_TIMELINE_DAYS = 90;
export const MIN_TIMELINE_DAYS = 1;

/** Events shown on the summary (motivation) layer of the study timeline. */
export const TIMELINE_LAYER_SUMMARY_TYPES: ReadonlyArray<TimelineEntryType> = [
  'study_session_complete',
  'attunement_ritual_submitted',
  'study_card_reviewed',
];

/** Per-card review entries for the drill-down layer. */
export const TIMELINE_LAYER_REVIEW_TYPES: ReadonlyArray<TimelineEntryType> = ['study_card_reviewed'];

function coerceDays(days: number): number {
  if (!Number.isFinite(days) || days < MIN_TIMELINE_DAYS) {
    return DEFAULT_TIMELINE_DAYS;
  }

  return Math.min(Math.round(days), MAX_TIMELINE_DAYS);
}

function getTopicName(topicId: string, topicMetadata?: TimelineTopicMetadata): string {
  return topicMetadata?.[topicId]?.topicName || topicId;
}

function sanitizeDurationMs(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return 0;
  }

  return Math.max(0, rawValue);
}

function buildStudySessionEntry(
  event: TelemetryEvent,
  topicMetadata: TimelineTopicMetadata = {},
): StudyTimelineEntry {
  const payload = event.payload as {
    sessionId?: string;
    totalAttempts: number;
    correctRate: number;
    sessionDurationMs: number;
  };
  const topicId = event.topicId || 'unassigned-topic';
  const sessionId = payload.sessionId || event.id;
  const correctRate = Math.round(payload.correctRate * 100);

  return {
    id: `study-session-complete-${event.id}`,
    type: 'study_session_complete',
    topicId,
    topicName: getTopicName(topicId, topicMetadata),
    sessionId,
    timestamp: event.timestamp,
    occurredAt: event.timestamp,
    title: 'Study session completed',
    summary: `${payload.totalAttempts} card${payload.totalAttempts === 1 ? '' : 's'} reviewed`,
    metrics: [
      {
        label: 'Correct rate',
        value: `${correctRate}%`,
      },
      {
        label: 'Duration',
        value: `${payload.sessionDurationMs} ms`,
      },
    ],
    durationMs: sanitizeDurationMs(payload.sessionDurationMs),
  };
}

function buildStudyCardReviewedEntry(
  event: TelemetryEvent,
  topicMetadata: TimelineTopicMetadata = {},
): StudyTimelineEntry {
  const payload = event.payload as {
    cardId: string;
    rating: number;
    isCorrect: boolean;
    difficulty: number;
    timeTakenMs: number;
    buffMultiplier: number;
  };
  const topicId = event.topicId || 'unassigned-topic';
  const sessionId = event.sessionId || event.id;

  return {
    id: `study-card-reviewed-${event.id}`,
    type: 'study_card_reviewed',
    topicId,
    topicName: getTopicName(topicId, topicMetadata),
    sessionId,
    timestamp: event.timestamp,
    occurredAt: event.timestamp,
    title: 'Study card reviewed',
    summary: `Card ${payload.cardId} reviewed`,
    metrics: [
      {
        label: 'Rating',
        value: `${payload.rating}/4`,
      },
      {
        label: 'Correct',
        value: payload.isCorrect ? 'Yes' : 'No',
      },
      {
        label: 'Difficulty',
        value: `${payload.difficulty}`,
      },
      {
        label: 'Time',
        value: `${payload.timeTakenMs} ms`,
      },
      {
        label: 'Buff x',
        value: `${payload.buffMultiplier}`,
      },
    ],
    cardId: payload.cardId,
    isCorrect: payload.isCorrect,
    durationMs: sanitizeDurationMs(payload.timeTakenMs),
  };
}

function buildRitualEntry(
  event: TelemetryEvent,
  topicMetadata: TimelineTopicMetadata = {},
): StudyTimelineEntry {
  const payload = event.payload as {
    harmonyScore: number;
    readinessBucket: string;
    checklistKeys: string[];
    buffsGranted: string[];
  };
  const topicId = event.topicId || 'unassigned-topic';
  const sessionId = event.sessionId || event.id;

  return {
    id: `attunement-ritual-submitted-${event.id}`,
    type: 'attunement_ritual_submitted',
    topicId,
    topicName: getTopicName(topicId, topicMetadata),
    sessionId,
    timestamp: event.timestamp,
    occurredAt: event.timestamp,
    title: 'Attunement ritual submitted',
    summary: `Harmony ${payload.harmonyScore}`,
    metrics: [
      {
        label: 'Readiness',
        value: payload.readinessBucket,
      },
      {
        label: 'Checklist',
        value: `${payload.checklistKeys.length}`,
      },
      {
        label: 'Buffs granted',
        value: `${payload.buffsGranted.length}`,
      },
    ],
    durationMs: 0,
  };
}

function buildTimelineEntry(event: TelemetryEvent, topicMetadata: TimelineTopicMetadata = {}): StudyTimelineEntry {
  if (event.type === 'study_session_complete') {
    return buildStudySessionEntry(event, topicMetadata);
  }

  if (event.type === 'attunement_ritual_submitted') {
    return buildRitualEntry(event, topicMetadata);
  }

  return buildStudyCardReviewedEntry(event, topicMetadata);
}

function filterByWindow(entries: StudyTimelineEntry[], daysWindow: number, now: number): StudyTimelineEntry[] {
  const windowSizeMs = coerceDays(daysWindow) * 24 * 60 * 60 * 1000;
  const windowStart = now - windowSizeMs;
  return entries.filter((entry) => entry.occurredAt >= windowStart);
}

const SUPPORTED_EVENT_TYPES: ReadonlyArray<TimelineEntryType> = [
  'study_session_complete',
  'attunement_ritual_submitted',
  'study_card_reviewed',
];

export interface StudyTimelineSessionGroup {
  sessionId: string;
  topicName: string;
  totalDurationMs: number;
  entries: StudyTimelineEntry[];
}

export interface StudyTimelineSummaryBucket {
  id: string;
  dayStartMs: number;
  dayEndMs: number;
  sessionsCompleted: number;
  cardsReviewed: number;
  correctReviews: number;
  ritualsCompleted: number;
  totalReviewMs: number;
  topicNames: string[];
}

export interface TimelineSummaryOptions {
  topicMetadata?: TimelineTopicMetadata;
  daysWindow?: number;
  now?: number;
}

function startOfLocalDayMs(timestampMs: number): number {
  const d = new Date(timestampMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function filterTimelineEntriesByOccurredRange(
  entries: StudyTimelineEntry[],
  rangeStartMs: number,
  rangeEndMs: number,
): StudyTimelineEntry[] {
  return entries.filter(
    (entry) => entry.occurredAt >= rangeStartMs && entry.occurredAt < rangeEndMs,
  );
}

export function groupTimelineEntriesBySession(
  entries: StudyTimelineEntry[],
): StudyTimelineSessionGroup[] {
  const groups = new Map<string, StudyTimelineSessionGroup>();

  entries.forEach((entry) => {
    const existing = groups.get(entry.sessionId);
    const duration = entry.durationMs || 0;
    if (existing) {
      existing.entries.push(entry);
      existing.totalDurationMs += duration;
      return;
    }

    groups.set(entry.sessionId, {
      sessionId: entry.sessionId,
      topicName: entry.topicName,
      totalDurationMs: duration,
      entries: [entry],
    });
  });

  return Array.from(groups.values());
}

/** Earliest `occurredAt` among reviews in the session; stable tie-breaker by sessionId. */
function sessionGroupFirstOccurredAt(group: StudyTimelineSessionGroup): number {
  if (group.entries.length === 0) {
    return 0;
  }
  return Math.min(...group.entries.map((e) => e.occurredAt));
}

export function sortStudyTimelineSessionGroupsByFirstOccurredAt(
  groups: StudyTimelineSessionGroup[],
): StudyTimelineSessionGroup[] {
  return [...groups].sort((a, b) => {
    const diff = sessionGroupFirstOccurredAt(a) - sessionGroupFirstOccurredAt(b);
    if (diff !== 0) {
      return diff;
    }
    return a.sessionId.localeCompare(b.sessionId);
  });
}

export function buildTimelineSummaryBuckets(
  events: TelemetryEvent[] = [],
  options: TimelineSummaryOptions = {},
): StudyTimelineSummaryBucket[] {
  const { daysWindow = DEFAULT_TIMELINE_DAYS, now = Date.now(), topicMetadata } = options;
  const entries = buildTimelineEntries(events, {
    daysWindow,
    now,
    topicMetadata,
    includeEventTypes: TIMELINE_LAYER_SUMMARY_TYPES,
  });

  const bucketMap = new Map<number, StudyTimelineSummaryBucket>();

  entries.forEach((entry) => {
    const dayStartMs = startOfLocalDayMs(entry.occurredAt);
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
    const id = `day-${dayStartMs}`;

    let bucket = bucketMap.get(dayStartMs);
    if (!bucket) {
      bucket = {
        id,
        dayStartMs,
        dayEndMs,
        sessionsCompleted: 0,
        cardsReviewed: 0,
        correctReviews: 0,
        ritualsCompleted: 0,
        totalReviewMs: 0,
        topicNames: [],
      };
      bucketMap.set(dayStartMs, bucket);
    }

    const topicLabel = entry.topicName;
    if (topicLabel && !bucket.topicNames.includes(topicLabel)) {
      bucket.topicNames.push(topicLabel);
    }

    if (entry.type === 'study_session_complete') {
      bucket.sessionsCompleted += 1;
    } else if (entry.type === 'attunement_ritual_submitted') {
      bucket.ritualsCompleted += 1;
    } else if (entry.type === 'study_card_reviewed') {
      bucket.cardsReviewed += 1;
      if (entry.isCorrect === true) {
        bucket.correctReviews += 1;
      }
      bucket.totalReviewMs += entry.durationMs || 0;
    }
  });

  return Array.from(bucketMap.values()).sort((a, b) => b.dayStartMs - a.dayStartMs);
}

export function buildTimelineEntries(
  events: TelemetryEvent[] = [],
  options: TimelineQueryOptions = {},
): StudyTimelineEntry[] {
  const { daysWindow = DEFAULT_TIMELINE_DAYS, now = Date.now(), topicMetadata } = options;
  const includeEventTypes = options.includeEventTypes?.length
    ? options.includeEventTypes
    : SUPPORTED_EVENT_TYPES;
  const eventTypeSet = new Set<TimelineEntryType>(includeEventTypes.filter((eventType) => (
    SUPPORTED_EVENT_TYPES.includes(eventType)
  )));

  const supportedEvents = events.filter(
    (event): event is TelemetryEvent & { type: TimelineEntryType } => (
      eventTypeSet.has(event.type as TimelineEntryType)
    ),
  );
  const entries = supportedEvents.map((event) => buildTimelineEntry(event, topicMetadata));
  const filtered = filterByWindow(entries, daysWindow, now);
  return filtered.sort((a, b) => a.occurredAt - b.occurredAt);
}
