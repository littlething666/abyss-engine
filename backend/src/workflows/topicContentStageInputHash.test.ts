import { describe, expect, it } from 'vitest';
import { inputHash } from '../contracts/generationContracts';
import { topicContentStageInputHash } from './topicContentStageInputHash';

describe('topicContentStageInputHash', () => {
  const snapshot: Record<string, unknown> = {
    pipeline_kind: 'topic-theory',
    subject_id: 'math',
    topic_id: 'limits',
    stage: 'full',
    schema_version: 1,
  };

  it('keeps the base snapshot hash when a stage has no parent artifact hashes', async () => {
    const baseInputHash = await inputHash(snapshot);

    await expect(topicContentStageInputHash({
      snapshot,
      baseInputHash,
      stage: 'theory',
    })).resolves.toBe(baseInputHash);
  });

  it('binds study-card hashes to the consumed theory artifact content hash', async () => {
    const baseInputHash = await inputHash(snapshot);

    const first = await topicContentStageInputHash({
      snapshot,
      baseInputHash,
      stage: 'study-cards',
      parentContentHashes: { theory: 'cnt_theory_a' },
    });
    const second = await topicContentStageInputHash({
      snapshot,
      baseInputHash,
      stage: 'study-cards',
      parentContentHashes: { theory: 'cnt_theory_b' },
    });

    expect(first).not.toBe(baseInputHash);
    expect(first).not.toBe(second);
  });

  it('binds mini-game hashes to both theory and study-card parent artifacts', async () => {
    const baseInputHash = await inputHash(snapshot);

    const categorySort = await topicContentStageInputHash({
      snapshot,
      baseInputHash,
      stage: 'mini-games:CATEGORY_SORT',
      parentContentHashes: { theory: 'cnt_theory', studyCards: 'cnt_cards_a' },
    });
    const sequenceBuild = await topicContentStageInputHash({
      snapshot,
      baseInputHash,
      stage: 'mini-games:SEQUENCE_BUILD',
      parentContentHashes: { theory: 'cnt_theory', studyCards: 'cnt_cards_a' },
    });
    const changedCards = await topicContentStageInputHash({
      snapshot,
      baseInputHash,
      stage: 'mini-games:CATEGORY_SORT',
      parentContentHashes: { theory: 'cnt_theory', studyCards: 'cnt_cards_b' },
    });

    expect(categorySort).not.toBe(baseInputHash);
    expect(categorySort).not.toBe(sequenceBuild);
    expect(categorySort).not.toBe(changedCards);
  });
});
