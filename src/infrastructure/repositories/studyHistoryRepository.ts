import {
  IStudyHistoryRepository,
  StudyHistoryQuery,
  StudyHistoryRepositoryRecord,
} from '../../types/repository';

const STORAGE_KEY = 'abyss-telemetry-v1-raw';

function safeParsePersisted(raw: string | null) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is StudyHistoryRepositoryRecord => {
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
        && typeof record.version === 'string'
        && typeof record.timestamp === 'number'
        && validSessionId
        && validTopicId
        && typeof record.type === 'string'
        && typeof record.payload === 'object'
      );
    });
  } catch {
    return [];
  }
}

function readPersistedEvents(): StudyHistoryRepositoryRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  return safeParsePersisted(window.localStorage.getItem(STORAGE_KEY));
}

function writePersistedEvents(events: StudyHistoryRepositoryRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
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
      window.localStorage.removeItem(STORAGE_KEY);
    }
  },

  exportLog: () => JSON.stringify(readPersistedEvents(), null, 2),
};

export type { StudyHistoryRepositoryRecord };
