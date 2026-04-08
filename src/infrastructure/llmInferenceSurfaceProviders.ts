import type { InferenceSurfaceId, LlmInferenceProviderId } from '../types/llmInference';

/**
 * Assign each inference surface to a provider. Edit values here to route traffic (no UI yet).
 *
 * Gemini env (client-side, Google AI Studio style):
 * - NEXT_PUBLIC_GEMINI_API_KEY
 * - NEXT_PUBLIC_GEMINI_MODEL
 * - NEXT_PUBLIC_GEMINI_VISION_MODEL (optional; screen capture falls back to NEXT_PUBLIC_GEMINI_MODEL)
 * - NEXT_PUBLIC_GEMINI_API_BASE_URL (optional; default https://generativelanguage.googleapis.com)
 */
export const LLM_INFERENCE_PROVIDER_BY_SURFACE: Record<
  InferenceSurfaceId,
  LlmInferenceProviderId
> = {
  studyQuestionExplain: 'openai-compatible',
  studyFormulaExplain: 'openai-compatible',
  studyQuestionMermaid: 'openai-compatible',
  screenCaptureSummary: 'openai-compatible',
  ascentWeaver: 'gemini',
  topicContent: 'gemini',
};

export function inferenceProviderForSurface(surfaceId: InferenceSurfaceId): LlmInferenceProviderId {
  return LLM_INFERENCE_PROVIDER_BY_SURFACE[surfaceId];
}

function openAiCompatibleTextModel(): string {
  return process.env.NEXT_PUBLIC_LLM_MODEL?.trim() ?? '';
}

function openAiCompatibleVisionModel(): string {
  return (
    process.env.NEXT_PUBLIC_LLM_VISION_MODEL?.trim()
    || process.env.NEXT_PUBLIC_LLM_MODEL?.trim()
    || ''
  );
}

function geminiTextModel(): string {
  return process.env.NEXT_PUBLIC_GEMINI_MODEL?.trim() ?? '';
}

function geminiVisionModel(): string {
  return (
    process.env.NEXT_PUBLIC_GEMINI_VISION_MODEL?.trim()
    || process.env.NEXT_PUBLIC_GEMINI_MODEL?.trim()
    || ''
  );
}

/** Model id string appropriate for the configured provider of this surface. */
export function resolveModelForSurface(surfaceId: InferenceSurfaceId): string {
  const provider = inferenceProviderForSurface(surfaceId);
  if (surfaceId === 'screenCaptureSummary') {
    return provider === 'gemini' ? geminiVisionModel() : openAiCompatibleVisionModel();
  }
  return provider === 'gemini' ? geminiTextModel() : openAiCompatibleTextModel();
}
