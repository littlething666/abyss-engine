import { Buff } from '../../types/progression';
import { BuffConsumeEvent, BuffContext, BuffDefinition, BuffInstance } from './types';
import { getBuffDefinition } from './buffDefinitions';

export class BuffEngine {
  private static instance = new BuffEngine();
  private instanceSequence = 0;

  static get() {
    return this.instance;
  }

  private createInstanceId(buffId: string): string {
    this.instanceSequence += 1;
    return `${buffId}-${Date.now()}-${this.instanceSequence}`;
  }

  private normalizeIssuedAt(issuedAt?: number): number {
    return issuedAt ?? Date.now();
  }

  private shouldExpire(definition: BuffDefinition, issuedAt: number): number | undefined {
    if (typeof definition.durationMs !== 'number') {
      return undefined;
    }
    return issuedAt + definition.durationMs;
  }

  private coerceDefinition(definition?: BuffDefinition) {
    return definition ?? undefined;
  }

  hydrateBuff(buff: Buff): Buff {
    const definition = getBuffDefinition(buff.buffId);
    const issuedAt = this.normalizeIssuedAt(buff.issuedAt);

    return {
      ...buff,
      condition: buff.condition ?? definition?.condition ?? 'manual',
      stacks: Math.max(1, Number.isFinite(buff.stacks as number) ? (buff.stacks as number) : 1),
      source: buff.source ?? 'legacy',
      issuedAt,
      instanceId: buff.instanceId ?? this.createInstanceId(buff.buffId),
      remainingUses:
        typeof buff.remainingUses === 'number'
          ? Math.max(0, Math.floor(buff.remainingUses))
          : definition?.maxUses,
      duration: buff.duration ?? definition?.durationMs,
      maxUses: definition?.maxUses,
      expiresAt: buff.expiresAt ?? (definition ? this.shouldExpire(definition, issuedAt) : undefined),
      icon: definition?.icon ?? buff.icon ?? '🪙',
      name: definition?.name ?? buff.name ?? 'Unknown Buff',
      description: definition?.description ?? buff.description ?? '',
    };
  }

  grantBuff(defId: string, source: string, magnitudeOverride?: number): Buff {
    const definition = this.coerceDefinition(getBuffDefinition(defId));
    if (!definition) {
      throw new Error(`Unknown buff definition: ${defId}`);
    }

    const issuedAt = Date.now();

    return this.normalizeBuff({
      buffId: definition.id,
      modifierType: definition.modifierType,
      magnitude: magnitudeOverride ?? definition.baseMagnitude,
      condition: definition.condition,
      source,
      issuedAt,
      instanceId: this.createInstanceId(definition.id),
      stacks: 1,
      duration: definition.durationMs,
      remainingUses: definition.maxUses,
      expiresAt: this.shouldExpire(definition, issuedAt),
    });
  }

  private normalizeBuff(buff: BuffInstance): Buff {
    const definition = getBuffDefinition(buff.buffId);
    return {
      ...buff,
      condition: buff.condition ?? definition?.condition ?? 'manual',
      source: buff.source || 'legacy',
      issuedAt: this.normalizeIssuedAt(buff.issuedAt),
      instanceId: buff.instanceId ?? this.createInstanceId(buff.buffId),
      stacks: Math.max(1, buff.stacks || 1),
      remainingUses: typeof buff.remainingUses === 'number' ? Math.max(0, Math.floor(buff.remainingUses)) : definition?.maxUses,
      duration: buff.duration ?? definition?.durationMs,
      maxUses: definition?.maxUses,
      expiresAt: buff.expiresAt ?? (definition ? this.shouldExpire(definition, buff.issuedAt ?? Date.now()) : undefined),
    };
  }

  private pruneExpiredInternal(activeBuffs: Buff[], now: number): Buff[] {
    return activeBuffs.filter((buff) => {
      const expiresAt = buff.expiresAt;
      if (typeof expiresAt !== 'number') {
        return true;
      }
      return expiresAt > now;
    });
  }

  pruneExpired(activeBuffs: Buff[], now: number = Date.now()): Buff[] {
    const sanitized = activeBuffs.map((buff) => this.hydrateBuff(buff));
    return this.pruneExpiredInternal(sanitized, now);
  }

  private getDefinitionForBuff(buff: Buff): BuffDefinition | undefined {
    return getBuffDefinition(buff.buffId);
  }

  private getStackingRule(modifierType: Buff['modifierType'], sampleBuff?: Buff): BuffInstance['stacking'] {
    const definition = sampleBuff ? this.getDefinitionForBuff(sampleBuff) : undefined;
    if (definition?.stacking) {
      return definition.stacking;
    }
    if (modifierType === 'growth_speed') {
      return 'additive';
    }
    return 'multiplicative';
  }

  getModifierTotal(modifierType: Buff['modifierType'], activeBuffs: Buff[], context: BuffContext = {}): number {
    const now = context.now ?? Date.now();
    const relevant = this.pruneExpiredInternal(
      activeBuffs.filter((buff) => buff.modifierType === modifierType),
      now,
    );
    const sample = relevant[0];
    const stacking = this.getStackingRule(modifierType, sample);

    if (stacking === 'additive') {
      return relevant.reduce((sum, buff) => sum + (buff.magnitude - 1), 0);
    }
    if (stacking === 'max') {
      return relevant.reduce((max, buff) => Math.max(max, buff.magnitude), 0) || 1;
    }
    if (stacking === 'override') {
      return relevant.length > 0 ? relevant[relevant.length - 1].magnitude : 1;
    }
    return relevant.reduce((total, buff) => total * buff.magnitude, 1);
  }

  getDisplayModifierTotal(modifierType: Buff['modifierType'], activeBuffs: Buff[], context: BuffContext = {}): number {
    const total = this.getModifierTotal(modifierType, activeBuffs, context);
    const stacking = this.getStackingRule(modifierType, activeBuffs.find((buff) => buff.modifierType === modifierType));
    if (stacking === 'additive') {
      return total + 1;
    }
    return total;
  }

  consumeForEvent(activeBuffs: Buff[], event: BuffConsumeEvent, context: BuffContext = {}): Buff[] {
    const now = context.now ?? Date.now();
    const next = this.pruneExpiredInternal(activeBuffs.map((buff) => this.hydrateBuff(buff)), now);
    if (event === 'card_reviewed') {
      return next
        .map((buff) => {
          const definition = this.getDefinitionForBuff(buff);
          const condition = definition?.condition ?? buff.condition;
          const isUsageCondition = condition === 'next_10_cards' || condition === 'next_5_cards';
          if (!isUsageCondition || typeof buff.remainingUses !== 'number') {
            return buff;
          }
          const remainingUses = Math.max(0, Math.floor(buff.remainingUses) - 1);
          if (remainingUses <= 0) {
            return null;
          }
          return { ...buff, remainingUses };
        })
        .filter((buff): buff is Buff => buff !== null);
    }

    return next.filter((buff) => {
      if (buff.condition === 'session_end' || buff.condition === 'next_10_cards' || buff.condition === 'next_5_cards') {
        return false;
      }
      return true;
    });
  }
}
