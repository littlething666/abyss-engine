/**
 * Single store for HUD-visible LLM content generation: topic unlock pipeline (phases + structured I/O)
 * and crystal level-up deck expansion (activity timeline + status line).
 */
import { create } from 'zustand';

export type TopicGenerationPhase = 'theory' | 'study_cards' | 'mini_games' | 'saving';

export interface TopicGenerationStageIo {
  input: string;
  output: string;
  error?: string;
}

export interface TopicGenerationIoLog {
  subjectId: string;
  topicId: string;
  startedAt: number;
  finishedAt?: number;
  ok?: boolean;
  finalError?: string;
  theory?: TopicGenerationStageIo;
  studyCards?: TopicGenerationStageIo;
  miniGames?: TopicGenerationStageIo;
}

/** Text timeline entries (e.g. crystal expansion); cleared independently of structured topic I/O logs. */
export interface ContentGenerationActivityEntry {
  id: string;
  at: number;
  message: string;
}

export interface CrystalExpansionHudState {
  active: boolean;
  statusLine: string;
}

interface ContentGenerationState {
  byTopicId: Record<string, TopicGenerationPhase | undefined>;
  setPhase: (topicId: string, phase: TopicGenerationPhase | null) => void;
  generationIoLogByTopicId: Record<string, TopicGenerationIoLog>;
  resetGenerationIoLog: (topicId: string, base: Pick<TopicGenerationIoLog, 'subjectId' | 'topicId' | 'startedAt'>) => void;
  patchGenerationIoLog: (topicId: string, patch: Partial<TopicGenerationIoLog>) => void;

  crystalExpansion: CrystalExpansionHudState;
  activityTimeline: ContentGenerationActivityEntry[];

  beginCrystalExpansion: (statusLine: string) => void;
  appendActivityTimeline: (message: string) => void;
  finishCrystalExpansion: () => void;
  clearActivityTimeline: () => void;
}

let activitySeq = 0;

function nextActivityId(): string {
  activitySeq += 1;
  return `llm-activity-${activitySeq}`;
}

export const useContentGenerationStore = create<ContentGenerationState>((set) => ({
  byTopicId: {},
  generationIoLogByTopicId: {},
  crystalExpansion: { active: false, statusLine: '' },
  activityTimeline: [],

  setPhase: (topicId, phase) =>
    set((s) => {
      if (phase === null) {
        const next = { ...s.byTopicId };
        delete next[topicId];
        return { byTopicId: next };
      }
      return { byTopicId: { ...s.byTopicId, [topicId]: phase } };
    }),

  resetGenerationIoLog: (topicId, base) =>
    set((s) => ({
      generationIoLogByTopicId: {
        ...s.generationIoLogByTopicId,
        [topicId]: {
          subjectId: base.subjectId,
          topicId: base.topicId,
          startedAt: base.startedAt,
          finishedAt: undefined,
          ok: undefined,
          finalError: undefined,
          theory: undefined,
          studyCards: undefined,
          miniGames: undefined,
        },
      },
    })),

  patchGenerationIoLog: (topicId, patch) =>
    set((s) => {
      const prev = s.generationIoLogByTopicId[topicId];
      if (!prev) {
        return s;
      }
      return {
        generationIoLogByTopicId: {
          ...s.generationIoLogByTopicId,
          [topicId]: { ...prev, ...patch },
        },
      };
    }),

  beginCrystalExpansion: (statusLine) =>
    set((s) => ({
      crystalExpansion: { active: true, statusLine },
      activityTimeline: [...s.activityTimeline, { id: nextActivityId(), at: Date.now(), message: statusLine }],
    })),

  appendActivityTimeline: (message) =>
    set((s) => ({
      activityTimeline: [...s.activityTimeline, { id: nextActivityId(), at: Date.now(), message }],
    })),

  finishCrystalExpansion: () =>
    set({
      crystalExpansion: { active: false, statusLine: '' },
    }),

  clearActivityTimeline: () => set({ activityTimeline: [] }),
}));
