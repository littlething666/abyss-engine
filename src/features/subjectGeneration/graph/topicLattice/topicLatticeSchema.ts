import { z } from 'zod';

import { TOPIC_ICON_NAMES } from '../topicIcons/topicIconAllowlist';

const kebabTopicId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ICON_NAME_VALUES = [...TOPIC_ICON_NAMES] as [
  (typeof TOPIC_ICON_NAMES)[number],
  ...(typeof TOPIC_ICON_NAMES)[number][],
];

export const topicLatticeNodeSchema = z.object({
  topicId: z
    .string()
    .min(1)
    .refine((id) => kebabTopicId.test(id), { message: 'topicId must be lowercase kebab-case' }),
  title: z.string().min(1),
  iconName: z.enum(ICON_NAME_VALUES),
  tier: z.number().int().positive(),
  learningObjective: z.string().min(1),
});

export const topicLatticeResponseSchema = z.object({
  topics: z.array(topicLatticeNodeSchema).min(1),
});
