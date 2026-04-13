import {
  IStudyHistoryRepository,
  StudyHistoryQuery,
  StudyHistoryRepositoryRecord,
} from '../../types/repository';
import { readRawTelemetryEventsFromStorage, TELEMETRY_RAW_STORAGE_KEY } from '../telemetryRawLog';

function isStudyHistoryRepositoryRecord(entry: unknown): entry is StudyHistoryRepositoryRecord {
  if (entry === null || typeof entry !== 'object') {
    return false;
  }

  const record = entry as {
    id?: unknown;
    version?: unknown;
    timestamp?: unknown;
    sessionId?: unknown;
    topicId?: unknown;
    type?: unknown;
    payload?: unknown;
  };

  const validSessionId =
    record.sessionId === null || typeof record.sessionId === 'string';

  const validTopicId =
    record.topicId === null || typeof record.topicId === 'string';

  return (
    typeof record.id === 'string'
    && record.version === 'v1'
    && typeof record.timestamp === 'number'
    && validSessionId
    && validTopicId
    && typeof record.type === 'string'
    && typeof record.payload === 'object'
    && record.payload !== null
  );
}

function readPersistedEvents(): StudyHistoryRepositoryRecord[] {
  const raw = readRawTelemetryEventsFromStorage() as unknown[];
  return raw.filter(isStudyHistoryRepositoryRecord);
}

function writePersistedEvents(events: StudyHistoryRepositoryRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TELEMETRY_RAW_STORAGE_KEY, JSON.stringify(events));
}

function getDayBoundary(daysWindow: number): number {
  const clampDays = Math.max(0, Math.floor(daysWindow));
  return Date.now() - clampDays * 24 * 60 * 60 * 1000;
}

function matchesQuery(event: StudyHistoryRepositoryRecord, query: StudyHistoryQuery = {}) {
  const {
    fromTimestamp,
    toTimestamp,
    eventTypes,
    topicId,
    sessionId,
    topicIds,
  } = query;

  if (typeof fromTimestamp === 'number' && event.timestamp < fromTimestamp) {
    return false;
  }

  if (typeof toTimestamp === 'number' && event.timestamp > toTimestamp) {
    return false;
  }

  if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(event.type)) {
    return false;
  }

  if (typeof topicId === 'string' && topicId !== event.topicId) {
    return false;
  }

  if (typeof sessionId === 'string' && sessionId !== event.sessionId) {
    return false;
  }

  if ((topicIds?.length ?? 0) > 0 && !topicIds?.includes(event.topicId || '')) {
    return false;
  }

  return true;
}

export const studyHistoryRepository: IStudyHistoryRepository = {
  getAll: () => readPersistedEvents(),

  getByQuery: (options = {}) => {
    const query: StudyHistoryQuery = {
      ...options,
    };

    if (typeof query.daysWindow === 'number') {
      query.fromTimestamp = getDayBoundary(query.daysWindow);
    }

    const records = readPersistedEvents();
    return records.filter((record) => matchesQuery(record, query)).sort((left, right) => left.timestamp - right.timestamp);
  },

  log: (record) => {
    const events = [...readPersistedEvents(), record];
    writePersistedEvents(events);
  },

  prune: (days) => {
    const cutoff = getDayBoundary(days);
    const events = readPersistedEvents().filter((event) => event.timestamp >= cutoff);
    writePersistedEvents(events);
  },

  clear: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TELEMETRY_RAW_STORAGE_KEY);
    }
  },

  exportLog: () => JSON.stringify(readPersistedEvents(), null, 2),
};

export type { StudyHistoryRepositoryRecord };
