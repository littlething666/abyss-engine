import type { TelemetryEvent } from '../types';

function toStartOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const SESSION_COMPLETE_TYPES: TelemetryEvent['type'][] = ['study_session_complete', 'study_undo', 'study_redo', 'study_card_reviewed'];

export function computeStudyStreak(events: TelemetryEvent[]) {
  const daySet = new Set<number>();
  for (const event of events) {
    if (!SESSION_COMPLETE_TYPES.includes(event.type)) {
      continue;
    }
    daySet.add(toStartOfUtcDay(event.timestamp));
  }

  const days = Array.from(daySet).sort((a, b) => b - a);
  if (days.length === 0) {
    return 0;
  }

  let streak = 1;
  const millisInDay = 24 * 60 * 60 * 1000;
  for (let index = 1; index < days.length; index += 1) {
    const gap = days[index - 1] - days[index];
    if (gap === millisInDay) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

export function computeTotalStudyHours(events: TelemetryEvent[]) {
  const totalMilliseconds = events.reduce((sum, event) => {
    if (event.type === 'study_session_complete') {
      const payload = event.payload as { sessionDurationMs?: unknown };
      const rawDuration = typeof payload.sessionDurationMs === 'number' ? payload.sessionDurationMs : 0;
      return sum + Math.max(0, rawDuration);
    }

    if (event.type === 'study_card_reviewed') {
      const payload = event.payload as { timeTakenMs?: unknown };
      const rawDuration = typeof payload.timeTakenMs === 'number' ? payload.timeTakenMs : 0;
      return sum + Math.max(0, rawDuration);
    }

    return sum;
  }, 0);

  return totalMilliseconds / (1000 * 60 * 60);
}
