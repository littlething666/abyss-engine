import { useMemo } from 'react';

import { computeStudyStreak, computeTotalStudyHours } from '../computed/studyMetrics';
import { useTelemetryStore } from '../telemetryStore';

export interface StudyMetrics {
  studyStreak: number;
  totalStudyHours: number;
}

export function useStudyMetrics(): StudyMetrics {
  const events = useTelemetryStore((state) => state.events);
  return useMemo(() => ({
    studyStreak: computeStudyStreak(events),
    totalStudyHours: computeTotalStudyHours(events),
  }), [events]);
}
