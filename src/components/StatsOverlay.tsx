import React from 'react';
import { History } from 'lucide-react';
import { Buff } from '../types/progression';
import {
  getBuffDisplayName,
  getBuffIcon,
  getBuffSummary,
  groupBuffsByType,
  groupBuffsByTypeWithSources,
} from '../features/progression';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface StatsOverlayProps {
  /** Total number of cards in the deck */
  totalCards: number;
  /** Number of cards due for review */
  dueCards: number;
  activeBuffs?: Buff[];
  onOpenStudyTimeline?: () => void;
}

/**
 * StatsOverlay Component
 * Displays study statistics in an overlay on the main page.
 * Shows: Due/Total cards, buffs
 */
export function StatsOverlay({
  totalCards,
  dueCards,
  activeBuffs = [],
  onOpenStudyTimeline,
}: StatsOverlayProps) {
  const [selectedBuffType, setSelectedBuffType] = React.useState<Buff['modifierType'] | null>(null);

  const groupedBuffs = groupBuffsByType(activeBuffs).slice(0, 3);
  const groupedBuffsWithSources = groupBuffsByTypeWithSources(activeBuffs);
  const selectedGroup = groupedBuffsWithSources.find((group) => group.modifierType === selectedBuffType);

  const buffIcons = groupedBuffs.map((buff) => {
    const icon = getBuffIcon(buff.modifierType);
    const summary = getBuffSummary(buff);
    const isSelected = selectedBuffType === buff.modifierType;

    return (
      <Badge
        asChild
        key={buff.modifierType}
        variant={isSelected ? 'default' : 'outline'}
        className={`px-1.5 py-0.5 text-[10px] transition-colors ${isSelected ? 'ring-1 ring-foreground/25' : ''}`}
      >
        <button
          type="button"
          onClick={() => {
            setSelectedBuffType((current) => (current === buff.modifierType ? null : buff.modifierType));
          }}
          aria-label={`View ${summary} sources`}
          title={summary}
          className="inline-flex items-center gap-0.5 text-[10px] text-current"
        >
          <span className="text-xs leading-none" aria-hidden="true">{icon}</span>
          <span>{buff.magnitude.toFixed(1)}x</span>
        </button>
      </Badge>
    );
  });

  const selectedDetails = selectedGroup ? (
        <div className="mt-1.5 border-t border-border/40 pt-1 text-[10px] text-foreground/90">
        <p className="mb-0.5 font-medium text-[9px] uppercase tracking-wider text-foreground/55">
        {`${selectedGroup.totalMagnitude.toFixed(2)}x ${getBuffDisplayName(selectedGroup.modifierType)}`}
      </p>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {selectedGroup.buffs.map((buff, index) => (
          <li key={`${buff.buffId}-${buff.source ?? 'unknown'}-${index}`} className="leading-3.5">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">{getBuffIcon(selectedGroup.modifierType)}</span>
              <span>{buff.magnitude.toFixed(2)}x from {buff.source ?? 'Unknown origin'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <div className="absolute left-3 top-3 z-10 flex gap-1.5" data-testid="stats-overlay">
      <div className="rounded-md border border-border/50 bg-card/90 px-2.5 py-1.5 text-center" data-testid="stats-overlay-cards">
        <Badge variant="outline" className="mb-0.5 h-4 px-1.5 text-[9px]">
          Cards
        </Badge>
        <span className="block text-base font-semibold leading-none text-primary">
          {dueCards}/{totalCards}
        </span>
      </div>

      <div className="min-w-[72px] rounded-md border border-border/40 bg-card/90 px-2 py-1.5 text-left" data-testid="stats-overlay-buffs">
        <Badge variant="outline" className="mb-0.5 h-4 px-1.5 text-[9px]">
          Buffs
        </Badge>
        {activeBuffs.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">None</span>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1">{buffIcons}</div>
            {selectedBuffType ? (
              selectedDetails
            ) : (
              <span className="mt-0.5 text-[10px] text-muted-foreground">Tap buff for sources</span>
            )}
          </div>
        )}
      </div>

      {onOpenStudyTimeline && (
        <Button
          size="icon-sm"
          variant="outline"
          type="button"
          onClick={onOpenStudyTimeline}
          title="Open study timeline"
          aria-label="Open study timeline"
          data-testid="stats-overlay-timeline"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export default StatsOverlay;
