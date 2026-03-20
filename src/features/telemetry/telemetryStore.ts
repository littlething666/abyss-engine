import { create } from 'zustand';

/** Study history: load and append via `studyHistoryRepository` (single persistence path for the timeline). */
import { computeStudyStreak, computeTotalStudyHours } from './computed/studyMetrics';
import { studyHistoryRepository } from '../../infrastructure/repositories/studyHistoryRepository';
import { TelemetryEventPayloadSchema, type TelemetryEvent } from './types';
import type { StudyHistoryRepositoryRecord } from '../../types/repository';

const normalizeEvents = (events: StudyHistoryRepositoryRecord[]): TelemetryEvent[] => {
  const parsed = TelemetryEventPayloadSchema.array().safeParse(events);
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
};

interface TelemetryState {
  events: TelemetryEvent[];
  log: (event: TelemetryEvent | unknown) => void;
  prune: (olderThanDays: number) => void;
  clear: () => void;
  exportLog: () => string;
  getStudyStreak: () => number;
  getTotalStudyHours: () => number;
}

export const useTelemetryStore = create<TelemetryState>()(
  (set, get) => ({
    events: normalizeEvents(studyHistoryRepository.getAll()),
    log: (event) => {
      const result = TelemetryEventPayloadSchema.safeParse(event);
      if (!result.success) {
        return;
      }

      studyHistoryRepository.log(result.data);
      set((state) => ({ events: [...state.events, result.data] }));
    },
    prune: (olderThanDays) => {
      const clampDays = Math.max(0, olderThanDays);
      studyHistoryRepository.prune(clampDays);
      set({ events: normalizeEvents(studyHistoryRepository.getByQuery()) });
    },
    clear: () => {
      studyHistoryRepository.clear();
      set({ events: [] });
    },
    exportLog: () => {
      return studyHistoryRepository.exportLog();
    },
    getStudyStreak: () => {
      return computeStudyStreak(get().events);
    },
    getTotalStudyHours: () => {
      return computeTotalStudyHours(get().events);
    },
  }),
);
