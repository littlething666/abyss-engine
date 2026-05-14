import { z } from 'zod';
import { WorkflowFail } from '../lib/workflowErrors';
import { generationPolicySchema } from './generationPolicySchema';
import type { GenerationPolicy } from './types';

function summarizeZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'policy';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function fail(message: string): never {
  throw new WorkflowFail('config:invalid', `invalid backend generation policy: ${message}`);
}

/**
 * Validate and normalize the backend generation policy at the configuration
 * seam. The parser is intentionally strict: unsupported providers, missing job
 * kinds, extra fields, disabled response healing, and malformed model config all
 * fail loudly instead of being repaired downstream.
 */
export function parseGenerationPolicy(input: unknown): GenerationPolicy {
  const parsed = generationPolicySchema.safeParse(input);
  if (!parsed.success) fail(summarizeZodIssues(parsed.error));
  return parsed.data;
}

/** Parse backend-owned generation policy JSON without any default fallback. */
export function parseGenerationPolicyJson(raw: string, source: string): GenerationPolicy {
  if (raw.trim().length === 0) fail(`${source} is blank`);

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${source} is not valid JSON: ${message}`);
  }

  return parseGenerationPolicy(decoded);
}
