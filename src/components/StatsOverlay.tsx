import React from 'react';
import { Buff } from '../types/progression';
import {
  getBuffDefinition,
  getBuffDisplayName,
  getBuffIcon,
  groupBuffsByTypeWithSources,
  type GroupedBuffSummary,
} from '../features/progression';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface StatsOverlayProps {
  activeBuffs?: Buff[];
}

function resolveBuffDescription(buff: Buff): string {
  const fromBuff = buff.description?.trim();
  if (fromBuff) {
    return fromBuff;
  }
  const fromCatalog = getBuffDefinition(buff.buffId)?.description?.trim();
  if (fromCatalog) {
    return fromCatalog;
  }
  return `${getBuffDisplayName(buff)} modifier active.`;
}

function BuffTypePopover({ group }: { group: GroupedBuffSummary }) {
  const icon = getBuffIcon(group.modifierType);
  const displayName = getBuffDisplayName(group.modifierType);
  const summaryLabel = `${group.totalMagnitude.toFixed(2)}× ${displayName}`;

  const descriptionBlock =
    group.buffs.length === 1 ? (
      <PopoverDescription>{resolveBuffDescription(group.buffs[0]!)}</PopoverDescription>
    ) : (
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="text-xs leading-snug">Multiple effects of this type are stacking.</p>
        <ul className="flex flex-col gap-1.5 text-xs leading-snug">
          {group.buffs.map((buff, index) => {
            const name = buff.name ?? getBuffDefinition(buff.buffId)?.name ?? displayName;
            const snippet = resolveBuffDescription(buff);
            return (
              <li key={`${buff.buffId}-${buff.source ?? 'unknown'}-${index}`}>
                <span className="font-medium text-foreground">
                  {name} ({buff.magnitude.toFixed(2)}×)
                </span>
                <span className="mt-0.5 block">{snippet}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={`${summaryLabel} — open details`}
            title={summaryLabel}
          >
            <span aria-hidden="true">{icon}</span>
          </Button>
        }
      />
      <PopoverContent align="start" side="left" sideOffset={8} className="w-72">
        <PopoverHeader>
          <PopoverTitle>{summaryLabel}</PopoverTitle>
        </PopoverHeader>
        {descriptionBlock}
        <div className="border-t border-border/40 pt-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Sources
          </p>
          <ul className="flex flex-col gap-1 text-xs text-foreground/90">
            {group.buffs.map((buff, index) => (
              <li key={`${buff.buffId}-src-${buff.source ?? 'unknown'}-${index}`} className="leading-snug">
                {buff.magnitude.toFixed(2)}× from {buff.source ?? 'Unknown origin'}
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Buff stack for the main HUD (popover details per modifier type).
 */
export function StatsOverlay({ activeBuffs = [] }: StatsOverlayProps) {
  if (activeBuffs.length === 0) {
    return null;
  }

  const groupedWithSources = groupBuffsByTypeWithSources(activeBuffs);

  return (
    <div className="flex flex-col gap-1 items-end" data-testid="stats-overlay-buffs">
      {groupedWithSources.map((group) => (
        <BuffTypePopover key={group.modifierType} group={group} />
      ))}
    </div>
  );
}

export default StatsOverlay;
