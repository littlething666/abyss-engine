import { z } from 'zod';

export const graphNodeSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1),
  tier: z.number().int().positive(),
  prerequisites: z.array(z.string()),
  learningObjective: z.string().min(1),
});

export const subjectGraphSchema = z.object({
  subjectId: z.string().min(1),
  title: z.string().min(1),
  themeId: z.string().min(1),
  maxTier: z.number().int().positive(),
  nodes: z.array(graphNodeSchema).min(1),
});

export type ParsedSubjectGraph = z.infer<typeof subjectGraphSchema>;
