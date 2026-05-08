import { z } from 'zod';

const jsonObjectSchema = z.object({}).catchall(z.unknown());

export const learningContentArtifactKinds = [
  'subject-graph-topics',
  'subject-graph-edges',
  'topic-theory',
  'topic-study-cards',
  'topic-mini-game-category-sort',
  'topic-mini-game-sequence-build',
  'topic-mini-game-match-pairs',
  'topic-expansion-cards',
  'crystal-trial',
] as const;

export const subjectMetadataEnvelopeSchema = z.object({
  subject: z.object({
    description: z.string().trim().min(1),
    color: z.string().trim().min(1),
    geometry: z.object({
      gridTile: z.enum(['box', 'cylinder', 'sphere', 'octahedron', 'plane']),
    }).passthrough(),
    topicIds: z.array(z.string().trim().min(1)).optional(),
    metadata: jsonObjectSchema.optional(),
  }).passthrough(),
}).passthrough();

export const subjectGraphEnvelopeSchema = z.object({
  subjectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  nodes: z.array(z.object({
    topicId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    iconName: z.string().trim().min(1),
    tier: z.number().int().min(1),
    learningObjective: z.string().trim().min(1).optional(),
    prerequisites: z.array(z.object({
      topicId: z.string().trim().min(1),
      minLevel: z.number().int().min(1),
    }).strict()),
  }).passthrough()),
}).passthrough();

export const topicDetailsEnvelopeSchema = jsonObjectSchema.superRefine((value, ctx) => {
  for (const key of ['topicId', 'title'] as const) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].trim().length === 0)) {
      ctx.addIssue({ code: 'custom', path: [key], message: `${key} must be a non-empty string when present` });
    }
  }
});

export const topicCardEnvelopeSchema = jsonObjectSchema.extend({
  id: z.string().trim().min(1),
});

export const crystalTrialQuestionsEnvelopeSchema = z.object({
  questions: z.array(z.unknown()),
}).passthrough();

export const sourceArtifactKindSchema = z.enum(learningContentArtifactKinds);
