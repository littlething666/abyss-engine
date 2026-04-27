import { create } from 'zustand';

import {
  DEFAULT_AGENT_PERSONALITY,
  normalizeAgentPersonality,
} from '../features/studyPanel/agentPersonalityPresets';
import { ALL_SURFACE_IDS } from '../types/llmInference';
import type {
  InferenceSurfaceId,
  LlmInferenceProviderId,
  OpenRouterModelConfig,
  OpenRouterSupportedParameter,
  SurfaceProviderBinding,
} from '../types/llmInference';
import {
  buildSeedOpenRouterConfigs,
  GENERATION_SURFACE_DEFAULT_MODEL,
  PREVIOUS_GENERATION_SURFACE_DEFAULT_MODEL,
  inferOpenRouterExtraSupportedParameters,
  seededConfigIdForModel,
  STUDY_SURFACE_DEFAULT_MODEL,
} from '../infrastructure/openRouterDefaults';

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

function buildDefaultSurfaceBindings(
  configs: OpenRouterModelConfig[],
): Record<InferenceSurfaceId, SurfaceProviderBinding> {
  const studyId = seededConfigIdForModel(configs, STUDY_SURFACE_DEFAULT_MODEL);
  const genId = seededConfigIdForModel(configs, GENERATION_SURFACE_DEFAULT_MODEL);
  const or = (configId: string): SurfaceProviderBinding => ({
    provider: 'openrouter',
    openRouterConfigId: configId,
  });
  return {
    studyQuestionExplain: or(studyId),
    studyFormulaExplain: or(studyId),
    subjectGenerationTopics: or(genId),
    subjectGenerationEdges: or(genId),
    topicContent: or(genId),
    crystalTrial: or(genId),
  };
}

export interface StudySettingsState {
  targetAudience: string;
  agentPersonality: string;
  /** Model string for the 'local' provider (env fallback is NEXT_PUBLIC_LLM_MODEL). */
  localModelId: string;
  /**
   * When true and a surface uses OpenRouter, structured JSON jobs send the `response-healing` plugin.
   * Those requests use non-streaming `json_object` mode (see OpenRouter docs). Defaults to on.
   */
  openRouterResponseHealing: boolean;
  openRouterConfigs: OpenRouterModelConfig[];
  surfaceProviders: Record<InferenceSurfaceId, SurfaceProviderBinding>;
}

export interface StudySettingsActions {
  setTargetAudience: (targetAudience: string) => void;
  resetTargetAudience: () => void;
  setAgentPersonality: (agentPersonality: string) => void;
  setLocalModelId: (modelId: string) => void;
  setOpenRouterResponseHealing: (enabled: boolean) => void;
  addOpenRouterConfig: (partial: Omit<OpenRouterModelConfig, 'id'> & { id?: string }) => string;
  updateOpenRouterConfig: (id: string, patch: Partial<Omit<OpenRouterModelConfig, 'id'>>) => void;
  deleteOpenRouterConfig: (id: string) => void;
  setSurfaceProvider: (surfaceId: InferenceSurfaceId, providerId: LlmInferenceProviderId) => void;
  setSurfaceConfigId: (surfaceId: InferenceSurfaceId, configId: string) => void;
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

function parseStoredSupportedParameters(raw: unknown): readonly OpenRouterSupportedParameter[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const allowed = new Set<OpenRouterSupportedParameter>([
    'tools',
    'response_format',
    'structured_outputs',
  ]);
  const out = raw.filter((x): x is OpenRouterSupportedParameter => typeof x === 'string' && allowed.has(x as OpenRouterSupportedParameter));
  return out.length > 0 ? out : undefined;
}

function parseConfigs(raw: unknown): OpenRouterModelConfig[] | null {
  if (!Array.isArray(raw)) return null;
  const out: OpenRouterModelConfig[] = [];
  for (const item of raw) {
    if (!isStringRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const label = typeof item.label === 'string' ? item.label : '';
    const model = typeof item.model === 'string' ? item.model : '';
    const enableReasoning = item.enableReasoning === true;
    const enableStreaming = item.enableStreaming !== false;
    if (!id || !model) continue;
    const supportedParameters = parseStoredSupportedParameters(item.supportedParameters);
    out.push({
      id,
      label: label || model,
      model,
      enableReasoning,
      enableStreaming,
      ...(supportedParameters ? { supportedParameters } : {}),
    });
  }
  return out;
}

function mergeSeedConfigs(configs: OpenRouterModelConfig[]): OpenRouterModelConfig[] {
  const next = [...configs];
  const existing = new Set(next.map((c) => c.id));
  for (const seeded of buildSeedOpenRouterConfigs()) {
    if (!existing.has(seeded.id)) {
      next.push(seeded);
      existing.add(seeded.id);
    }
  }
  return next;
}

function migrateOldGenerationDefaultBindings(
  bindings: Record<InferenceSurfaceId, SurfaceProviderBinding>,
  configs: OpenRouterModelConfig[],
): Record<InferenceSurfaceId, SurfaceProviderBinding> {
  const oldId = seededConfigIdForModel(configs, PREVIOUS_GENERATION_SURFACE_DEFAULT_MODEL);
  const newId = seededConfigIdForModel(configs, GENERATION_SURFACE_DEFAULT_MODEL);
  const generationSurfaces: InferenceSurfaceId[] = [
    'subjectGenerationTopics',
    'subjectGenerationEdges',
    'topicContent',
    'crystalTrial',
  ];
  const next = { ...bindings };
  for (const surfaceId of generationSurfaces) {
    const binding = next[surfaceId];
    if (binding.provider === 'openrouter' && binding.openRouterConfigId === oldId) {
      next[surfaceId] = { provider: 'openrouter', openRouterConfigId: newId };
    }
  }
  return next;
}

function parseBindings(
  raw: unknown,
  validConfigIds: Set<string>,
): Record<InferenceSurfaceId, SurfaceProviderBinding> | null {
  if (!isStringRecord(raw)) return null;
  const fallbackConfigId = validConfigIds.values().next().value ?? null;
  const result = {} as Record<InferenceSurfaceId, SurfaceProviderBinding>;
  for (const surfaceId of ALL_SURFACE_IDS) {
    const entry = raw[surfaceId];
    if (isStringRecord(entry) && typeof entry.provider === 'string') {
      const legacyProvider = entry.provider;
      const normalizedProvider: LlmInferenceProviderId =
        legacyProvider === 'local' ? 'local' : 'openrouter';
      const candidateId = typeof entry.openRouterConfigId === 'string' ? entry.openRouterConfigId : null;
      const configId =
        normalizedProvider === 'openrouter'
          ? candidateId && validConfigIds.has(candidateId)
            ? candidateId
            : fallbackConfigId
          : null;
      result[surfaceId] = { provider: normalizedProvider, openRouterConfigId: configId };
    }
  }
  // Fill any missing surfaces with safe defaults.
  for (const surfaceId of ALL_SURFACE_IDS) {
    if (!(surfaceId in result)) {
      result[surfaceId] = { provider: 'local', openRouterConfigId: null };
    }
  }
  return result;
}

function buildDefaultSnapshot(): Snapshot {
  const configs = buildSeedOpenRouterConfigs();
  return {
    targetAudience: DEFAULT_TARGET_AUDIENCE,
    agentPersonality: DEFAULT_AGENT_PERSONALITY,
    localModelId: '',
    openRouterResponseHealing: true,
    openRouterConfigs: configs,
    surfaceProviders: buildDefaultSurfaceBindings(configs),
  };
}

function readSnapshotFromStorage(): Snapshot {
  const storage = getStorage();
  if (!storage) return buildDefaultSnapshot();
  const raw = storage.getItem(STUDY_SETTINGS_STORAGE_KEY);
  if (!raw) return buildDefaultSnapshot();
  const parsed = safeParseJSON<unknown>(raw);
  if (!isStringRecord(parsed)) return buildDefaultSnapshot();

  const targetAudience =
    typeof parsed.targetAudience === 'string'
      ? normalizeTargetAudience(parsed.targetAudience)
      : DEFAULT_TARGET_AUDIENCE;
  const agentPersonality =
    typeof parsed.agentPersonality === 'string'
      ? normalizeAgentPersonality(parsed.agentPersonality)
      : DEFAULT_AGENT_PERSONALITY;
  const localModelId = typeof parsed.localModelId === 'string' ? parsed.localModelId : '';
  const openRouterResponseHealing = parsed.openRouterResponseHealing !== false;

  // Migration: if no configs persisted, seed defaults.
  let configs = parseConfigs(parsed.openRouterConfigs);
  if (!configs || configs.length === 0) {
    configs = buildSeedOpenRouterConfigs();
  } else {
    configs = mergeSeedConfigs(configs);
  }
  const validConfigIds = new Set(configs.map((c) => c.id));

  const parsedBindings =
    parseBindings(parsed.surfaceProviders, validConfigIds) ?? buildDefaultSurfaceBindings(configs);
  const bindings = migrateOldGenerationDefaultBindings(parsedBindings, configs);

  return {
    targetAudience,
    agentPersonality,
    localModelId,
    openRouterResponseHealing,
    openRouterConfigs: configs,
    surfaceProviders: bindings,
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

function randomId(): string {
  try {
    const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      return cryptoObj.randomUUID();
    }
  } catch {
    // fall through
  }
  // Fallback: 32-char hex from Math.random (non-cryptographic; acceptable for local IDs).
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-8${out.slice(17, 20)}-${out.slice(20, 32)}`;
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
        localModelId: patch.localModelId ?? current.localModelId,
        openRouterResponseHealing: patch.openRouterResponseHealing ?? current.openRouterResponseHealing,
        openRouterConfigs: patch.openRouterConfigs ?? current.openRouterConfigs,
        surfaceProviders: patch.surfaceProviders ?? current.surfaceProviders,
      };
      writeSnapshotToStorage(snapshot);
      set(patch);
    };

    return {
      ...initial,

      setTargetAudience: (v) => persist({ targetAudience: normalizeTargetAudience(v) }),
      resetTargetAudience: () => persist({ targetAudience: DEFAULT_TARGET_AUDIENCE }),
      setAgentPersonality: (v) => persist({ agentPersonality: normalizeAgentPersonality(v) }),
      setLocalModelId: (v) => persist({ localModelId: v }),
      setOpenRouterResponseHealing: (enabled) => persist({ openRouterResponseHealing: enabled }),

      addOpenRouterConfig: (partial) => {
        const id = partial.id ?? randomId();
        const model = partial.model.trim();
        const supportedParameters = inferOpenRouterExtraSupportedParameters(model);
        const config: OpenRouterModelConfig = {
          id,
          label: partial.label || model,
          model,
          enableReasoning: partial.enableReasoning === true,
          enableStreaming: partial.enableStreaming === true,
          ...(supportedParameters ? { supportedParameters } : {}),
        };
        const next = [...get().openRouterConfigs, config];
        persist({ openRouterConfigs: next });
        return id;
      },

      updateOpenRouterConfig: (id, patch) => {
        const next = get().openRouterConfigs.map((c) =>
          c.id === id
            ? {
                ...c,
                ...(patch.label !== undefined ? { label: patch.label } : {}),
                ...(patch.model !== undefined
                  ? {
                      model: patch.model,
                      supportedParameters: inferOpenRouterExtraSupportedParameters(patch.model),
                    }
                  : {}),
                ...(patch.enableReasoning !== undefined ? { enableReasoning: patch.enableReasoning } : {}),
                ...(patch.enableStreaming !== undefined ? { enableStreaming: patch.enableStreaming } : {}),
                ...(patch.supportedParameters !== undefined
                  ? { supportedParameters: patch.supportedParameters }
                  : {}),
              }
            : c,
        );
        persist({ openRouterConfigs: next });
      },

      deleteOpenRouterConfig: (id) => {
        const state = get();
        const nextConfigs = state.openRouterConfigs.filter((c) => c.id !== id);
        const fallbackId = nextConfigs[0]?.id ?? null;
        const nextBindings = { ...state.surfaceProviders };
        for (const surfaceId of ALL_SURFACE_IDS) {
          const b = nextBindings[surfaceId];
          if (b.provider === 'openrouter' && b.openRouterConfigId === id) {
            nextBindings[surfaceId] = fallbackId
              ? { provider: 'openrouter', openRouterConfigId: fallbackId }
              : { provider: 'local', openRouterConfigId: null };
          }
        }
        persist({ openRouterConfigs: nextConfigs, surfaceProviders: nextBindings });
      },

      setSurfaceProvider: (surfaceId, providerId) => {
        const state = get();
        const current = state.surfaceProviders[surfaceId];
        if (providerId === 'local') {
          persist({
            surfaceProviders: {
              ...state.surfaceProviders,
              [surfaceId]: { provider: 'local', openRouterConfigId: null },
            },
          });
          return;
        }
        const configId =
          current.openRouterConfigId && state.openRouterConfigs.some((c) => c.id === current.openRouterConfigId)
            ? current.openRouterConfigId
            : state.openRouterConfigs[0]?.id ?? null;
        if (!configId) {
          throw new Error(
            `Cannot bind surface '${surfaceId}' to OpenRouter: no configs defined. Create one in Global Settings first.`,
          );
        }
        persist({
          surfaceProviders: {
            ...state.surfaceProviders,
            [surfaceId]: { provider: 'openrouter', openRouterConfigId: configId },
          },
        });
      },

      setSurfaceConfigId: (surfaceId, configId) => {
        const state = get();
        if (!state.openRouterConfigs.some((c) => c.id === configId)) {
          throw new Error(`Unknown OpenRouter config id: ${configId}`);
        }
        persist({
          surfaceProviders: {
            ...state.surfaceProviders,
            [surfaceId]: { provider: 'openrouter', openRouterConfigId: configId },
          },
        });
      },
    };
  });

const store = createStudySettingsStore();

export function getSurfaceBinding(surfaceId: InferenceSurfaceId): SurfaceProviderBinding {
  return store.getState().surfaceProviders[surfaceId];
}

export function getOpenRouterConfigById(id: string): OpenRouterModelConfig | undefined {
  return store.getState().openRouterConfigs.find((c) => c.id === id);
}

export function getLocalModelId(): string {
  return store.getState().localModelId;
}

export const useStudySettingsStore = store;
export { store as studySettingsStore };
