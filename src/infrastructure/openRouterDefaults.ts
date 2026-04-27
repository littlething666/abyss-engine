import type { OpenRouterModelConfig, OpenRouterSupportedParameter } from '../types/llmInference';
const OPENROUTER_MODEL_IDS_WITH_GENERATION_TOOLS = [
  'mistralai/mistral-small-2603',
] as const;
const OPENROUTER_GENERATION_TOOL_MODEL_SET = new Set<string>(OPENROUTER_MODEL_IDS_WITH_GENERATION_TOOLS);

export const OPENROUTER_MODEL_OPTIONS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'minimax/minimax-m2.5:free',
  'qwen/qwen3.5-flash-02-23',
  'mistralai/mistral-small-2603',
  'tencent/hy3-preview:free',
] as const;

export const STUDY_SURFACE_DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free' as const;
export const PREVIOUS_GENERATION_SURFACE_DEFAULT_MODEL = 'google/gemma-4-31b-it:free' as const;
export const GENERATION_SURFACE_DEFAULT_MODEL = 'mistralai/mistral-small-2603' as const;

export function inferOpenRouterExtraSupportedParameters(
  model: string,
): readonly OpenRouterSupportedParameter[] | undefined {
  const normalized = model.trim();
  const out: OpenRouterSupportedParameter[] = [];
  if (OPENROUTER_GENERATION_TOOL_MODEL_SET.has(normalized)) {
    out.push('tools', 'response_format', 'structured_outputs');
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Deterministic UUIDs for seeded configs so migrations produce the same id on
 * every device for the same model string.
 */
const SEEDED_CONFIG_IDS: Record<(typeof OPENROUTER_MODEL_OPTIONS)[number], string> = {
  'nvidia/nemotron-3-super-120b-a12b:free': '00000000-0000-4000-8000-000000000002',
  'minimax/minimax-m2.5:free': '00000000-0000-4000-8000-000000000004',
  'qwen/qwen3.5-flash-02-23': '00000000-0000-4000-8000-000000000005',
  'google/gemma-4-31b-it:free': '00000000-0000-4000-8000-000000000006',
  'google/gemma-4-26b-a4b-it:free': '00000000-0000-4000-8000-000000000007',
  'mistralai/mistral-small-2603': '00000000-0000-4000-8000-000000000008',
  'tencent/hy3-preview:free': '00000000-0000-4000-8000-000000000009',
};

export function buildSeedOpenRouterConfigs(): OpenRouterModelConfig[] {
  return OPENROUTER_MODEL_OPTIONS.map((model) => {
    const supportedParameters = inferOpenRouterExtraSupportedParameters(model);
    return {
      id: SEEDED_CONFIG_IDS[model],
      label: model,
      model,
      supportedParameters,
      enableReasoning: true,
      enableStreaming: true,
    };
  });
}

export function seededConfigIdForModel(
  configs: OpenRouterModelConfig[],
  model: string,
): string {
  const found = configs.find((c) => c.model === model);
  if (!found) {
    throw new Error(
      `Seeded OpenRouter config for model '${model}' is missing. ` +
        'Check OPENROUTER_MODEL_OPTIONS and SEEDED_CONFIG_IDS.',
    );
  }
  return found.id;
}

/**
 * Resolves the Worker proxy chat-completions URL from env.
 * Throws at call time (not module load) when unset.
 */
export function resolveLlmWorkerChatUrl(): string {
  const base = process.env.NEXT_PUBLIC_LLM_WORKER_URL?.trim();
  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_LLM_WORKER_URL is not configured; OpenRouter requests require the Cloudflare Worker proxy URL',
    );
  }
  return `${base.replace(/\/+$/, '')}/chat/completions`;
}
