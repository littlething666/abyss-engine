import React, { useEffect, useMemo, useState } from 'react';

import { Brain, CheckCircle, ChevronLeft, Clock, Hash, Info, Star, Timer, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InfoPopover } from '@/components/InfoPopover';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { parseCardRefKey } from '@/lib/topicRef';
import {
  type StudyTimelineEntry,
  type StudyTimelineSessionGroup,
  type StudyTimelineSummaryBucket,
  type TelemetryEvent,
  type TimelineTopicMetadata,
  MAX_TIMELINE_DAYS,
  filterTimelineEntriesByOccurredRange,
  groupTimelineEntriesBySession,
  sortStudyTimelineSessionGroupsByFirstOccurredAt,
  useStudyTimelineLayers,
} from '@/features/telemetry';

import { TopicIcon } from './topicIcons/TopicIcon';

export interface StudyTimelineOpenStudyPayload {
  subjectId: string;
  topicId: string;
  cardId?: string;
}

interface StudyTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicMetadata?: TimelineTopicMetadata;
  /** When set, replaces live telemetry (e.g. unit tests). */
  eventsOverride?: TelemetryEvent[] | null;
  isLoading?: boolean;
  /** Fixed clock for deterministic tests; defaults to `Date.now()`. */
  timelineNow?: number;
  onOpenEntryStudy?: (payload: StudyTimelineOpenStudyPayload) => void;
}

type CorrectnessBucket = 'correct' | 'incorrect';

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0s';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (remainingSeconds === 0) {
    return `${totalMinutes}m`;
  }

  return `${totalMinutes}m ${remainingSeconds}s`;
}

function getCorrectnessBucket(isCorrect: boolean): CorrectnessBucket {
  return isCorrect ? 'correct' : 'incorrect';
}

function getCorrectnessStyles(bucket: CorrectnessBucket): string {
  if (bucket === 'correct') {
    return 'border-emerald-500/55 bg-emerald-500/18 text-emerald-700';
  }

  return 'border-rose-500/55 bg-rose-500/18 text-rose-600';
}

function getSessionRelativeWidth(
  durationMs: number,
  sessionDurationMs: number,
  sessionEventCount: number,
): number {
  if (sessionDurationMs <= 0) {
    return 100 / Math.max(1, sessionEventCount);
  }

  return Math.max(1, (durationMs / sessionDurationMs) * 100);
}

function formatBucketDateLabel(dayStartMs: number): string {
  return new Date(dayStartMs).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function timelineEntryCanOpenInStudy(entry: StudyTimelineEntry): boolean {
  if (entry.subjectId && entry.topicId) {
    return true;
  }
  if (entry.cardId) {
    try {
      parseCardRefKey(entry.cardId);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const sessionClockOptions: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
};

function formatSessionHeaderTimeRange(entries: StudyTimelineEntry[], totalDurationMs: number): string {
  if (entries.length === 0) {
    return formatDuration(totalDurationMs);
  }
  const startMs = Math.min(...entries.map((e) => e.occurredAt));
  const endMs = Math.max(...entries.map((e) => e.occurredAt + (e.durationMs ?? 0)));
  const start = new Date(startMs).toLocaleTimeString(undefined, sessionClockOptions);
  const end = new Date(endMs).toLocaleTimeString(undefined, sessionClockOptions);
  return `${start} - ${end} / ${formatDuration(totalDurationMs)}`;
}

function TimelineReviewBlock({
  entry,
  sessionDurationMs,
  sessionEventCount,
  onOpenEntryStudy,
}: {
  entry: StudyTimelineEntry;
  sessionDurationMs: number;
  sessionEventCount: number;
  onOpenEntryStudy?: (payload: StudyTimelineOpenStudyPayload) => void;
}) {
  const cardLabel = entry.cardId ? `Card ${entry.cardId}` : 'Card unknown';
  const durationMs = entry.durationMs || 0;
  const isCorrect = entry.isCorrect === true;
  const bucket = getCorrectnessBucket(isCorrect);
  const widthStyle = { width: `${getSessionRelativeWidth(durationMs, sessionDurationMs, sessionEventCount)}%` };
  const ratingValue = entry.metrics.find((metric) => metric.label === 'Rating')?.value ?? '—';
  const difficultyValue = entry.metrics.find((metric) => metric.label === 'Difficulty')?.value ?? '—';
  const buffValue = entry.metrics.find((metric) => metric.label === 'Buff x')?.value ?? '—';
  const correctnessText = isCorrect ? 'Correct' : 'Wrong';
  const CorrectnessIcon = isCorrect ? CheckCircle : XCircle;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${cardLabel}, ${correctnessText.toLowerCase()}, review duration ${formatDuration(durationMs)}.`}
            data-card-id={entry.cardId ?? ''}
            data-session-id={entry.sessionId}
            data-correctness={correctnessText.toLowerCase()}
            className={`h-12 shrink-0 rounded-none border shadow-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 ${getCorrectnessStyles(bucket)}`}
            style={widthStyle}
          >
            <span className="sr-only">
              {cardLabel}, {correctnessText}, {formatDuration(durationMs)}, {entry.topicName}.
            </span>
          </button>
        }
      />
      <PopoverContent className="w-60 p-2">
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                <CardTitle className="text-xs">Review</CardTitle>
              </div>
              <Badge variant={isCorrect ? 'default' : 'destructive'}>{correctnessText}</Badge>
            </div>
            <CardDescription className="text-[11px]">
              {cardLabel} • {new Date(entry.occurredAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 pt-0 pb-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Session {entry.sessionId} in {entry.topicName}
            </p>
            <div className="grid gap-1 text-xs">
              <div className="flex items-center gap-1.5">
                <Hash className="h-3 w-3 opacity-80" />
                <span>{cardLabel}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Timer className="h-3 w-3 opacity-80" />
                <span>{formatDuration(durationMs)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 opacity-80" />
                <span>{new Date(entry.occurredAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CorrectnessIcon className="h-3 w-3 opacity-80" />
                <span>{correctnessText}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Star className="h-3 w-3 opacity-80" />
                <span>Rating {ratingValue}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Brain className="h-3 w-3 opacity-80" />
                <span>Difficulty {difficultyValue}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Info className="h-3 w-3 opacity-80" />
                <span>Buff x {buffValue}</span>
              </div>
            </div>
            {onOpenEntryStudy && timelineEntryCanOpenInStudy(entry) ? (
              <Button
                type="button"
                size="sm"
                className="w-full"
                data-testid="study-timeline-open-study"
                onClick={() => {
                  let subjectId = entry.subjectId;
                  let topicId = entry.topicId;
                  let cardId = entry.cardId;
                  if (entry.cardId) {
                    try {
                      const parsed = parseCardRefKey(entry.cardId);
                      subjectId = parsed.subjectId;
                      topicId = parsed.topicId;
                      cardId = parsed.cardId;
                    } catch {
                      // legacy card id — keep entry.topicId / subjectId when present
                    }
                  }
                  if (!subjectId) {
                    return;
                  }
                  onOpenEntryStudy({
                    subjectId,
                    topicId,
                    cardId,
                  });
                }}
              >
                Open in study
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}

function SummaryBucketRow({
  bucket,
  onSelect,
}: {
  bucket: StudyTimelineSummaryBucket;
  onSelect: () => void;
}) {
  const topicPreview = bucket.topicNames.slice(0, 2).join(' · ');
  const topicOverflow = bucket.topicNames.length > 2 ? ` +${bucket.topicNames.length - 2}` : '';
  const accuracy =
    bucket.cardsReviewed > 0
      ? Math.round((bucket.correctReviews / bucket.cardsReviewed) * 100)
      : null;

  return (
    <button
      type="button"
      data-testid="study-timeline-bucket"
      data-bucket-id={bucket.id}
      onClick={onSelect}
      className="w-full text-left rounded-lg border border-border/60 bg-card/30 px-3 py-2.5 transition-colors hover:bg-card/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {formatBucketDateLabel(bucket.dayStartMs)}
          </p>
          {(topicPreview || topicOverflow) && (
            <p className="text-xs text-muted-foreground truncate">
              {topicPreview}
              {topicOverflow}
            </p>
          )}
        </div>
        {accuracy !== null && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {accuracy}% correct
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {bucket.cardsReviewed > 0 && (
          <span>
            {bucket.cardsReviewed} card{bucket.cardsReviewed === 1 ? '' : 's'}
            {bucket.totalReviewMs > 0 ? ` · ${formatDuration(bucket.totalReviewMs)}` : ''}
          </span>
        )}
        {bucket.cardsReviewed > 0 && (bucket.sessionsCompleted > 0 || bucket.ritualsCompleted > 0) && (
          <span> · </span>
        )}
        {bucket.sessionsCompleted > 0 && (
          <span>
            {bucket.sessionsCompleted} session{bucket.sessionsCompleted === 1 ? '' : 's'}
          </span>
        )}
        {bucket.sessionsCompleted > 0 && bucket.ritualsCompleted > 0 && <span> · </span>}
        {bucket.ritualsCompleted > 0 && (
          <span>
            {bucket.ritualsCompleted} ritual{bucket.ritualsCompleted === 1 ? '' : 's'}
          </span>
        )}
        {bucket.cardsReviewed === 0 && bucket.sessionsCompleted === 0 && bucket.ritualsCompleted === 0 && (
          <span>Activity logged</span>
        )}
      </p>
    </button>
  );
}

function SessionDetailStrip({
  sessionGroups,
  onOpenEntryStudy,
}: {
  sessionGroups: StudyTimelineSessionGroup[];
  onOpenEntryStudy?: (payload: StudyTimelineOpenStudyPayload) => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 pb-1"
      data-testid="study-timeline-detail-sessions"
    >
      {sessionGroups.map((session) => (
        <div
          key={`${session.sessionId}-${session.topicName}`}
          data-session-group={session.sessionId}
          className="w-full min-w-0 rounded-md border border-border/50 bg-card/20"
        >
          <div className="px-2 py-1.5 border-b border-border/40 text-xs text-muted-foreground space-y-0.5">
            <span className="flex w-full min-w-0 items-center gap-1.5 text-foreground/90">
              {session.iconName ? (
                <TopicIcon
                  iconName={session.iconName}
                  className="size-3.5 shrink-0 text-foreground/80"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{session.topicName}</span>
            </span>
            <span className="block w-full min-w-0 truncate tabular-nums">
              {formatSessionHeaderTimeRange(session.entries, session.totalDurationMs)}
            </span>
          </div>
          <div className="overflow-x-auto p-2">
            <div className="flex items-end gap-0">
              {session.entries.map((entry: StudyTimelineEntry) => (
                <TimelineReviewBlock
                  entry={entry}
                  key={entry.id}
                  sessionDurationMs={session.totalDurationMs}
                  sessionEventCount={session.entries.length}
                  onOpenEntryStudy={onOpenEntryStudy}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StudyTimelineModal({
  isOpen,
  onClose,
  topicMetadata,
  eventsOverride = null,
  isLoading = false,
  timelineNow,
  onOpenEntryStudy,
}: StudyTimelineModalProps) {
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  const { summaryBuckets, reviewEntries } = useStudyTimelineLayers({
    daysWindow: MAX_TIMELINE_DAYS,
    topicMetadata,
    eventsOverride,
    now: timelineNow,
  });

  useEffect(() => {
    if (!isOpen) {
      setSelectedBucketId(null);
    }
  }, [isOpen]);

  const drilledBucket = useMemo(
    () => summaryBuckets.find((bucket) => bucket.id === selectedBucketId) ?? null,
    [summaryBuckets, selectedBucketId],
  );

  const detailEntries = useMemo(() => {
    if (!drilledBucket) {
      return [];
    }
    return filterTimelineEntriesByOccurredRange(
      reviewEntries,
      drilledBucket.dayStartMs,
      drilledBucket.dayEndMs,
    );
  }, [drilledBucket, reviewEntries]);

  const sessionGroups = useMemo(
    () => sortStudyTimelineSessionGroupsByFirstOccurredAt(
      groupTimelineEntriesBySession(detailEntries),
    ),
    [detailEntries],
  );

  const summaryContent = isLoading ? (
    <div className="text-sm text-muted-foreground" data-testid="study-timeline-loading">
      Loading timeline…
    </div>
  ) : summaryBuckets.length === 0 ? (
    <div className="text-sm text-muted-foreground" data-testid="study-timeline-empty">
      No study activity yet.
    </div>
  ) : (
    <div className="flex flex-col gap-2" data-testid="study-timeline-summary">
      {summaryBuckets.map((bucket) => (
        <SummaryBucketRow
          key={bucket.id}
          bucket={bucket}
          onSelect={() => setSelectedBucketId(bucket.id)}
        />
      ))}
    </div>
  );

  const detailContent =
    detailEntries.length === 0 ? (
      <div className="text-sm text-muted-foreground" data-testid="study-timeline-detail-empty">
        No card reviews on this day.
      </div>
    ) : (
      <SessionDetailStrip
        sessionGroups={sessionGroups}
        onOpenEntryStudy={onOpenEntryStudy}
      />
    );

  const mainContent = drilledBucket ? detailContent : summaryContent;

  const studyTimelineDialogDescriptionClassName = drilledBucket
    ? 'text-left'
    : 'text-left flex flex-wrap items-center gap-1';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {drilledBucket ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                aria-label="Back to summary"
                onClick={() => setSelectedBucketId(null)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-left">
                {drilledBucket
                  ? `Reviews · ${formatBucketDateLabel(drilledBucket.dayStartMs)}`
                  : 'Study journey'}
              </DialogTitle>
              <DialogDescription className={studyTimelineDialogDescriptionClassName}>
                {drilledBucket ? (
                  <span className="min-w-0">
                    Sessions are listed in chronological order; block width reflects time on each card. Tap for
                    details.
                  </span>
                ) : (
                  <>
                    <span className="min-w-0">
                      Your review activity over time — tap a day for card-level detail.
                    </span>
                    <InfoPopover label="About the study timeline" align="start">
                      <p>
                        Bars summarize reviews, sessions, and rituals per day; drill into a day to see each card
                        and how long you spent on it.
                      </p>
                    </InfoPopover>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto -mx-4 px-4 flex-1 min-h-0">
          {mainContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudyTimelineModal;
