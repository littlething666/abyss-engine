import { describe, expect, it } from 'vitest';

import { topicLatticeNodeSchema, topicLatticeResponseSchema } from './topicLatticeSchema';

const validNode = {
  topicId: 'entropy',
  title: 'Entropy',
  iconName: 'atom',
  tier: 1,
  learningObjective: 'Learners can explain entropy.',
};

describe('topicLatticeNodeSchema', () => {
  it('accepts a node with an allowlisted iconName', () => {
    const result = topicLatticeNodeSchema.safeParse(validNode);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.iconName).toBe('atom');
    }
  });

  it('rejects an unknown iconName', () => {
    const result = topicLatticeNodeSchema.safeParse({ ...validNode, iconName: 'banana' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.');
      expect(path).toBe('iconName');
    }
  });

  it('rejects a missing iconName', () => {
    const { iconName: _omitted, ...withoutIcon } = validNode;
    const result = topicLatticeNodeSchema.safeParse(withoutIcon);
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.');
      expect(path).toBe('iconName');
    }
  });
});

describe('topicLatticeResponseSchema', () => {
  it('rejects a topics array containing an invalid iconName', () => {
    const result = topicLatticeResponseSchema.safeParse({
      topics: [validNode, { ...validNode, topicId: 'invalid', iconName: 'not-real' }],
    });
    expect(result.success).toBe(false);
  });
});
