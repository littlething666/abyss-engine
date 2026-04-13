import { describe, it, expect } from 'vitest';
import {
  topicRefKey,
  parseTopicRefKey,
  makeTopicRef,
  type TopicRefKey,
} from './topicRef';

describe('topicRefKey', () => {
  it('produces a deterministic string from (subjectId, topicId)', () => {
    const key = topicRefKey('math-101', 'linear-algebra');
    expect(key).toBe('math-101::linear-algebra');
  });

  it('distinguishes different subjects with the same topicId', () => {
    const a = topicRefKey('subject-a', 'shared-topic');
    const b = topicRefKey('subject-b', 'shared-topic');
    expect(a).not.toBe(b);
  });

  it('distinguishes different topics within the same subject', () => {
    const a = topicRefKey('subject-a', 'topic-1');
    const b = topicRefKey('subject-a', 'topic-2');
    expect(a).not.toBe(b);
  });
});

describe('parseTopicRefKey', () => {
  it('round-trips with topicRefKey', () => {
    const key = topicRefKey('sub-1', 'top-2');
    const ref = parseTopicRefKey(key);
    expect(ref).toEqual({ subjectId: 'sub-1', topicId: 'top-2' });
  });

  it('throws on a key without the delimiter', () => {
    expect(() => parseTopicRefKey('no-delimiter' as TopicRefKey)).toThrow('missing');
  });
});

describe('makeTopicRef', () => {
  it('creates a SubjectTopicRef from loose strings', () => {
    const ref = makeTopicRef('sub', 'top');
    expect(ref).toEqual({ subjectId: 'sub', topicId: 'top' });
  });
});
