import { create } from 'zustand';

import { resolveModelForSurface } from '../infrastructure/llmInferenceSurfaceProviders';
import {
  DEFAULT_AGENT_PERSONALITY,
  normalizeAgentPersonality,
} from '../features/studyPanel/agentPersonalityPresets';
import type { InferenceSurfaceId } from '../types/llmInference';

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

/** First entry is empty: use env model via {@link resolveModelForSurface}. */
export const OPENAI_COMPATIBLE_MODEL_OPTIONS = [
  '',
  'prism-ml/Bonsai-8B-mlx-1bit',
  'heretic-org/gemma-3-4b-it-heretic',
  'mlx-community/gemma-4-26b-a4b-4bit',
  'mlx-community/Qwen3.5-9B-MLX-4bit',
] as const;

export interface StudySettingsState {
  targetAudience: string;
  agentPersonality: string;
  /** When empty, OpenAI-compatible requests use NEXT_PUBLIC_LLM_API_KEY. */
  openAiCompatibleApiKey: string;
  /** When empty, OpenAI-compatible requests use the repository default URL (env / localhost). */
  openAiCompatibleChatUrl: string;
  /** When empty (first preset), use {@link resolveModelForSurface} for the active surface. */
  openAiCompatibleModelId: string;
}

export interface StudySettingsActions {
  setTargetAudience: (targetAudience: string) => void;
  resetTargetAudience: () => void;
  setAgentPersonality: (agentPersonality: string) => void;
  setOpenAiCompatibleApiKey: (openAiCompatibleApiKey: string) => void;
  setOpenAiCompatibleChatUrl: (openAiCompatibleChatUrl: string) => void;
  setOpenAiCompatibleModelId: (openAiCompatibleModelId: string) => void;
}

export type StudySettingsStore = StudySettingsState & StudySettingsActions;

const DEFAULT_TARGET_AUDIENCE = TARGET_AUDIENCE_OPTIONS[0];
const targetAudienceSet = new Set<string>(TARGET_AUDIENCE_OPTIONS as readonly string[]);
const openAiCompatibleModelSet = new Set<string>(OPENAI_COMPATIBLE_MODEL_OPTIONS as readonly string[]);

function safeParseJSON<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeTargetAudience(targetAudience: string): string {
  return targetAudienceSet.has(targetAudience) ? targetAudience : DEFAULT_TARGET_AUDIENCE;
}

function normalizeOpenAiCompatibleApiKey(openAiCompatibleApiKey: string): string {
  return openAiCompatibleApiKey;
}

function normalizeOpenAiCompatibleChatUrl(openAiCompatibleChatUrl: string): string {
  return openAiCompatibleChatUrl;
}

function normalizeOpenAiCompatibleModelId(openAiCompatibleModelId: string): string {
  return openAiCompatibleModelSet.has(openAiCompatibleModelId) ? openAiCompatibleModelId : '';
}

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  return storage ?? null;
}

type PersistedPayload = {
  targetAudience?: unknown;
  agentPersonality?: unknown;
  openAiCompatibleApiKey?: unknown;
  openAiCompatibleChatUrl?: unknown;
  openAiCompatibleModelId?: unknown;
};

type StudySettingsSnapshot = {
  targetAudience: string;
  agentPersonality: string;
  openAiCompatibleApiKey: string;
  openAiCompatibleChatUrl: string;
  openAiCompatibleModelId: string;
};

const DEFAULT_STUDY_SETTINGS: StudySettingsSnapshot = {
  targetAudience: DEFAULT_TARGET_AUDIENCE,
  agentPersonality: DEFAULT_AGENT_PERSONALITY,
  openAiCompatibleApiKey: '',
  openAiCompatibleChatUrl: '',
  openAiCompatibleModelId: '',
};

function readStudySettingsFromStorage(): StudySettingsSnapshot {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_STUDY_SETTINGS };
  }

  const raw = storage.getItem(STUDY_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_STUDY_SETTINGS };
  }

  const parsed = safeParseJSON<unknown>(raw);
  if (typeof parsed === 'string') {
    return {
      ...DEFAULT_STUDY_SETTINGS,
      targetAudience: normalizeTargetAudience(parsed),
    };
  }

  if (parsed && typeof parsed === 'object') {
    const payload = parsed as PersistedPayload;
    const targetAudience =
      typeof payload.targetAudience === 'string'
        ? normalizeTargetAudience(payload.targetAudience)
        : DEFAULT_TARGET_AUDIENCE;
    const agentPersonality =
      typeof payload.agentPersonality === 'string'
        ? normalizeAgentPersonality(payload.agentPersonality)
        : DEFAULT_AGENT_PERSONALITY;
    const openAiCompatibleApiKey =
      typeof payload.openAiCompatibleApiKey === 'string'
        ? normalizeOpenAiCompatibleApiKey(payload.openAiCompatibleApiKey)
        : '';
    const openAiCompatibleChatUrl =
      typeof payload.openAiCompatibleChatUrl === 'string'
        ? normalizeOpenAiCompatibleChatUrl(payload.openAiCompatibleChatUrl)
        : '';
    const openAiCompatibleModelId =
      typeof payload.openAiCompatibleModelId === 'string'
        ? normalizeOpenAiCompatibleModelId(payload.openAiCompatibleModelId)
        : '';
    return {
      targetAudience,
      agentPersonality,
      openAiCompatibleApiKey,
      openAiCompatibleChatUrl,
      openAiCompatibleModelId,
    };
  }

  return { ...DEFAULT_STUDY_SETTINGS };
}

function writeStudySettingsToStorage(
  updates: Partial<{
    targetAudience: string;
    agentPersonality: string;
    openAiCompatibleApiKey: string;
    openAiCompatibleChatUrl: string;
    openAiCompatibleModelId: string;
  }>,
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const current = readStudySettingsFromStorage();
  const targetAudience =
    updates.targetAudience !== undefined
      ? normalizeTargetAudience(updates.targetAudience)
      : current.targetAudience;
  const agentPersonality =
    updates.agentPersonality !== undefined
      ? normalizeAgentPersonality(updates.agentPersonality)
      : current.agentPersonality;
  const openAiCompatibleApiKey =
    updates.openAiCompatibleApiKey !== undefined
      ? normalizeOpenAiCompatibleApiKey(updates.openAiCompatibleApiKey)
      : current.openAiCompatibleApiKey;
  const openAiCompatibleChatUrl =
    updates.openAiCompatibleChatUrl !== undefined
      ? normalizeOpenAiCompatibleChatUrl(updates.openAiCompatibleChatUrl)
      : current.openAiCompatibleChatUrl;
  const openAiCompatibleModelId =
    updates.openAiCompatibleModelId !== undefined
      ? normalizeOpenAiCompatibleModelId(updates.openAiCompatibleModelId)
      : current.openAiCompatibleModelId;

  try {
    storage.setItem(
      STUDY_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetAudience,
        agentPersonality,
        openAiCompatibleApiKey,
        openAiCompatibleChatUrl,
        openAiCompatibleModelId,
      }),
    );
  } catch {
    // localStorage writes can fail in restricted environments
  }
}

export const createStudySettingsStore = () =>
  create<StudySettingsStore>((set) => {
    const initial = readStudySettingsFromStorage();
    return {
      targetAudience: initial.targetAudience,
      agentPersonality: initial.agentPersonality,
      openAiCompatibleApiKey: initial.openAiCompatibleApiKey,
      openAiCompatibleChatUrl: initial.openAiCompatibleChatUrl,
      openAiCompatibleModelId: initial.openAiCompatibleModelId,

      setTargetAudience: (targetAudience) => {
        const normalized = normalizeTargetAudience(targetAudience);
        writeStudySettingsToStorage({ targetAudience: normalized });
        set({ targetAudience: normalized });
      },

      resetTargetAudience: () => {
        writeStudySettingsToStorage({ targetAudience: DEFAULT_TARGET_AUDIENCE });
        set({ targetAudience: DEFAULT_TARGET_AUDIENCE });
      },

      setAgentPersonality: (agentPersonality) => {
        const normalized = normalizeAgentPersonality(agentPersonality);
        writeStudySettingsToStorage({ agentPersonality: normalized });
        set({ agentPersonality: normalized });
      },

      setOpenAiCompatibleApiKey: (openAiCompatibleApiKey) => {
        const normalized = normalizeOpenAiCompatibleApiKey(openAiCompatibleApiKey);
        writeStudySettingsToStorage({ openAiCompatibleApiKey: normalized });
        set({ openAiCompatibleApiKey: normalized });
      },

      setOpenAiCompatibleChatUrl: (openAiCompatibleChatUrl) => {
        const normalized = normalizeOpenAiCompatibleChatUrl(openAiCompatibleChatUrl);
        writeStudySettingsToStorage({ openAiCompatibleChatUrl: normalized });
        set({ openAiCompatibleChatUrl: normalized });
      },

      setOpenAiCompatibleModelId: (openAiCompatibleModelId) => {
        const normalized = normalizeOpenAiCompatibleModelId(openAiCompatibleModelId);
        writeStudySettingsToStorage({ openAiCompatibleModelId: normalized });
        set({ openAiCompatibleModelId: normalized });
      },
    };
  });

const store = createStudySettingsStore();

/** Non-empty when Study Settings should override `NEXT_PUBLIC_LLM_API_KEY` for OpenAI-compatible HTTP calls. */
export function getOpenAiCompatibleApiKeyOverride(): string | undefined {
  const v = store.getState().openAiCompatibleApiKey.trim();
  return v.length > 0 ? v : undefined;
}

/** Non-empty when Study Settings should override the default chat completions URL for OpenAI-compatible HTTP calls. */
export function getOpenAiCompatibleChatUrlOverride(): string | undefined {
  const v = store.getState().openAiCompatibleChatUrl.trim();
  return v.length > 0 ? v : undefined;
}

/**
 * Resolves the model id for an OpenAI-compatible surface: Study Settings override when set,
 * otherwise {@link resolveModelForSurface} (env, including vision chain for screen capture).
 */
export function resolveOpenAiCompatibleModelForSurface(surfaceId: InferenceSurfaceId): string {
  const o = store.getState().openAiCompatibleModelId.trim();
  if (o.length > 0) {
    return o;
  }
  return resolveModelForSurface(surfaceId);
}

export const useStudySettingsStore = store;
export { store as studySettingsStore };
