import { describe, expect, it } from 'vitest';
import { BuffEngine } from './buffEngine';

describe('BuffEngine', () => {
  it('creates buff instances from catalog definitions', () => {
    const buff = BuffEngine.get().grantBuff('clarity_focus', 'cognitive');
    expect(buff).toMatchObject({
      buffId: 'clarity_focus',
      modifierType: 'xp_multiplier',
      source: 'cognitive',
      condition: 'next_10_cards',
      magnitude: 1.15,
    });
    expect(buff.instanceId).toBeDefined();
    expect(buff.remainingUses).toBe(10);
  });

  it('handles card review and session-end consumption rules', () => {
    const usageBuff = BuffEngine.get().grantBuff('clarity_focus', 'cognitive');
    const sessionEndBuff = BuffEngine.get().grantBuff('ritual_growth', 'quest');
    const afterReview = BuffEngine.get().consumeForEvent([usageBuff, sessionEndBuff], 'card_reviewed');
    const usageAfterReview = afterReview.find((buff) => buff.buffId === 'clarity_focus');
    const sessionEndAfterReview = afterReview.find((buff) => buff.buffId === 'ritual_growth');

    expect(usageAfterReview?.remainingUses).toBe(9);
    expect(sessionEndAfterReview).toBeDefined();

    const afterSession = BuffEngine.get().consumeForEvent(afterReview, 'session_ended');
    expect(afterSession).toHaveLength(0);
  });

  it('computes modifier totals by stacking mode', () => {
    const xp = BuffEngine.get().grantBuff('clarity_focus', 'cognitive');
    const xpSecond = BuffEngine.get().grantBuff('clarity_focus', 'biological');
    const growth = BuffEngine.get().grantBuff('ritual_growth', 'quest');
    const growthSecond = BuffEngine.get().grantBuff('ritual_growth', 'quest');

    expect(BuffEngine.get().getModifierTotal('xp_multiplier', [xp, xpSecond])).toBeCloseTo(1.3225);
    expect(BuffEngine.get().getModifierTotal('growth_speed', [growth, growthSecond])).toBeCloseTo(0.3);
    expect(BuffEngine.get().getDisplayModifierTotal('growth_speed', [growth, growthSecond])).toBeCloseTo(1.3);
  });
});
