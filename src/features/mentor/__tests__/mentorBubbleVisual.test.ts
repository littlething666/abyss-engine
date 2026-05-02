import { describe, expect, it } from 'vitest';

import type { GenerationAttentionPrimaryFailure } from '@/features/contentGeneration';
import {
  ALERT_COLOR,
  MOOD_COLOR,
  MOOD_TO_ICON,
  PHASE_TO_ICON,
  selectMentorBubbleVisual,
} from '../mentorBubbleVisual';
import { MENTOR_ICON_NAMES } from '../mentorIconAllowlist';
import type { MentorMood } from '../mentorTypes';

function failure(
  partial?: Partial<GenerationAttentionPrimaryFailure>,
): GenerationAttentionPrimaryFailure {
  return {
    kind: 'topic-content',
    failureKey: 'fk',
    subjectId: 's1',
    ...partial,
  };
}

describe('selectMentorBubbleVisual', () => {
  it('alerts win unconditionally and use anti-flicker fixed opacities', () => {
    const visual = selectMentorBubbleVisual({
      mood: 'cheer',
      hasMentorActivity: true,
      subjectGraphActivePhase: 'topics',
      primaryFailure: failure(),
    });
    expect(visual.iconName).toBe('triangle-alert');
    expect(visual.ringColor).toBe(ALERT_COLOR);
    expect(visual.glyphColor).toBe(ALERT_COLOR);
    expect(visual.glowColor).toBe(ALERT_COLOR);
    expect(visual.ringOpacity).toBe(1.0);
    expect(visual.haloOpacity).toBe(0.95);
    expect(visual.baseScaleMultiplier).toBeCloseTo(1.1);
    expect(visual.isAlert).toBe(true);
    expect(visual.isActive).toBe(true);
  });

  it('explicit mood beats subject-graph phase when no alert is active', () => {
    const visual = selectMentorBubbleVisual({
      mood: 'celebrate',
      hasMentorActivity: false,
      subjectGraphActivePhase: 'edges',
      primaryFailure: null,
    });
    expect(visual.iconName).toBe(MOOD_TO_ICON.celebrate);
    expect(visual.ringColor).toBe(MOOD_COLOR.celebrate);
    expect(visual.isAlert).toBe(false);
  });

  it('subject-graph phase wins when there is no mood and no alert', () => {
    const topics = selectMentorBubbleVisual({
      mood: null,
      hasMentorActivity: false,
      subjectGraphActivePhase: 'topics',
      primaryFailure: null,
    });
    expect(topics.iconName).toBe(PHASE_TO_ICON.topics);
    expect(topics.iconName).toBe('compass');
    expect(topics.ringColor).toBe(MOOD_COLOR.hint);
    expect(topics.isActive).toBe(true);

    const edges = selectMentorBubbleVisual({
      mood: null,
      hasMentorActivity: false,
      subjectGraphActivePhase: 'edges',
      primaryFailure: null,
    });
    expect(edges.iconName).toBe('network');
  });

  it('falls back to the philosopher-stone neutral glyph at idle', () => {
    const visual = selectMentorBubbleVisual({
      mood: null,
      hasMentorActivity: false,
      subjectGraphActivePhase: null,
      primaryFailure: null,
    });
    expect(visual.iconName).toBe('philosopher-stone');
    expect(visual.ringColor).toBe(MOOD_COLOR.neutral);
    expect(visual.isActive).toBe(false);
    expect(visual.isAlert).toBe(false);
  });

  it('hasMentorActivity flips isActive but never changes iconName', () => {
    const idle = selectMentorBubbleVisual({
      mood: null,
      hasMentorActivity: false,
      subjectGraphActivePhase: null,
      primaryFailure: null,
    });
    const busy = selectMentorBubbleVisual({
      mood: null,
      hasMentorActivity: true,
      subjectGraphActivePhase: null,
      primaryFailure: null,
    });
    expect(busy.iconName).toBe(idle.iconName);
    expect(busy.iconName).toBe('philosopher-stone');
    expect(idle.isActive).toBe(false);
    expect(busy.isActive).toBe(true);
  });

  it('maps every mood exhaustively to a glyph in the allowlist', () => {
    const moods: MentorMood[] = ['neutral', 'cheer', 'tease', 'concern', 'celebrate', 'hint'];
    for (const mood of moods) {
      const visual = selectMentorBubbleVisual({
        mood,
        hasMentorActivity: false,
        subjectGraphActivePhase: null,
        primaryFailure: null,
      });
      expect((MENTOR_ICON_NAMES as readonly string[]).includes(visual.iconName)).toBe(
        true,
      );
      expect(visual.ringColor).toBe(MOOD_COLOR[mood]);
      expect(visual.glyphColor).toBe(MOOD_COLOR[mood]);
    }
  });

  it('uses the OQ4-refreshed concern color #ffba6b (distinct from alert)', () => {
    expect(MOOD_COLOR.concern).toBe('#ffba6b');
    expect(ALERT_COLOR).toBe('#ff5d5d');
    expect(MOOD_COLOR.concern).not.toBe(ALERT_COLOR);
  });
});
