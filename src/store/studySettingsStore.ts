import { create } from 'zustand';

import {
  DEFAULT_AGENT_PERSONALITY,
  normalizeAgentPersonality,
} from '../features/studyPanel/agentPersonalityPresets';

export { AGENT_PERSONALITY_OPTIONS } from '../features/studyPanel/agentPersonalityPresets';

export const STUDY_SETTINGS_STORAGE_KEY = 'abyss-study-settings';

export const TARGET_AUDIENCE_OPTIONS = [
  'Domain Experts',
  'Programmers',
  'QA',
  'Customer Service',
  'Market Analysts',
  'Sales Reps',
  'Financial Analysts',
  'Lawyers',
  'Graphic Designer',
  'Logistics',
] as const;

const DEFAULT_TARGET_AUDIENCE = TARGET_AUDIENCE_OPTIONS[0];
const targetAudienceSet = new Set<string>(TARGET_AUDIENCE_OPTIONS as readonly string[]);

export interface StudySettingsState {
  targetAudience: string;
  agentPersonality: string;
  /**
   * When true, Cmd/Ctrl+Z (and Shift variant) are wired up inside the Study Panel to undo/redo
   * the most recent rating. Off by default to keep the study session UI minimal; users opt in
   * from Global Settings when they want history correction available.
   *
   * The keyboard-shortcut path is the only undo/redo affordance: there are no longer visible
   * undo/redo buttons inside the study card.
   */
  showStudyHistoryControls: boolean;
}

export interface StudySettingsActions {
  setTargetAudience: (targetAudience: string) => void;
  resetTargetAudience: () => void;
  setAgentPersonality: (agentPersonality: string) => void;
  setShowStudyHistoryControls: (enabled: boolean) => void;
}

export type StudySettingsStore = StudySettingsState & StudySettingsActions;

type Snapshot = StudySettingsState;

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

function safeParseJSON<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeTargetAudience(v: string): string {
  return targetAudienceSet.has(v) ? v : DEFAULT_TARGET_AUDIENCE;
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function buildDefaultSnapshot(): Snapshot {
  return {
    targetAudience: DEFAULT_TARGET_AUDIENCE,
    agentPersonality: DEFAULT_AGENT_PERSONALITY,
    showStudyHistoryControls: false,
  };
}

function readSnapshotFromStorage(): Snapshot {
  const storage = getStorage();
  if (!storage) return buildDefaultSnapshot();
  const raw = storage.getItem(STUDY_SETTINGS_STORAGE_KEY);
  if (!raw) return buildDefaultSnapshot();
  const parsed = safeParseJSON<unknown>(raw);
  if (!isStringRecord(parsed)) return buildDefaultSnapshot();

  return {
    targetAudience:
      typeof parsed.targetAudience === 'string'
        ? normalizeTargetAudience(parsed.targetAudience)
        : DEFAULT_TARGET_AUDIENCE,
    agentPersonality:
      typeof parsed.agentPersonality === 'string'
        ? normalizeAgentPersonality(parsed.agentPersonality)
        : DEFAULT_AGENT_PERSONALITY,
    showStudyHistoryControls: parsed.showStudyHistoryControls === true,
  };
}

function writeSnapshotToStorage(snapshot: Snapshot): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STUDY_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

export const createStudySettingsStore = () =>
  create<StudySettingsStore>((set, get) => {
    const initial = readSnapshotFromStorage();
    writeSnapshotToStorage(initial); // normalise stored blob after migration

    const persist = (patch: Partial<Snapshot>) => {
      const current = get();
      const snapshot: Snapshot = {
        targetAudience: patch.targetAudience ?? current.targetAudience,
        agentPersonality: patch.agentPersonality ?? current.agentPersonality,
        showStudyHistoryControls: patch.showStudyHistoryControls ?? current.showStudyHistoryControls,
      };
      writeSnapshotToStorage(snapshot);
      set(patch);
    };

    return {
      ...initial,

      setTargetAudience: (v) => persist({ targetAudience: normalizeTargetAudience(v) }),
      resetTargetAudience: () => persist({ targetAudience: DEFAULT_TARGET_AUDIENCE }),
      setAgentPersonality: (v) => persist({ agentPersonality: normalizeAgentPersonality(v) }),
      setShowStudyHistoryControls: (enabled) => persist({ showStudyHistoryControls: enabled === true }),
    };
  });

const store = createStudySettingsStore();

export const useStudySettingsStore = store;
export { store as studySettingsStore };
