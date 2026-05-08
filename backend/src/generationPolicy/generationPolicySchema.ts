import { z } from 'zod';
import { BACKEND_GENERATION_JOB_KINDS } from './types';

export const generationJobPolicySchema = z
  .object({
    modelId: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^openrouter\/[^\s/]+\/[^\s]+$/),
    temperature: z.number().finite().min(0).max(2).optional(),
  })
  .strict();

const generationJobsSchema = z
  .object(
    Object.fromEntries(
      BACKEND_GENERATION_JOB_KINDS.map((kind) => [kind, generationJobPolicySchema]),
    ) as Record<(typeof BACKEND_GENERATION_JOB_KINDS)[number], typeof generationJobPolicySchema>,
  )
  .strict();

export const generationPolicySchema = z
  .object({
    version: z.literal(1),
    provider: z.literal('openrouter'),
    responseHealing: z
      .object({
        enabled: z.literal(true),
      })
      .strict(),
    jobs: generationJobsSchema,
  })
  .strict();
