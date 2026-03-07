import React from 'react';
import { AttunementReadinessBucket, Buff } from '../types/progression';
import {
  getBuffDisplayName,
  getBuffIcon,
  getBuffSummary,
  groupBuffsByType,
  groupBuffsByTypeWithSources,
} from '../features/progression';

export interface StatsOverlayProps {
  /** Total number of cards in the deck */
  totalCards: number;
  /** Number of cards due for review */
  dueCards: number;
  /** Number of active (unlocked) topics */
  activeTopics: number;
  /** Number of locked topics */
  lockedTopics: number;
  activeBuffs?: Buff[];
  latestHarmonyScore?: number;
  latestReadinessBucket?: AttunementReadinessBucket;
}

/**
 * StatsOverlay Component
 * Displays study statistics in an overlay on the main page.
 * Shows: Total cards, Due cards, Active topics, Locked topics
 */
export function StatsOverlay({
  totalCards,
  dueCards,
  activeTopics,
  lockedTopics,
  activeBuffs = [],
  latestHarmonyScore,
  latestReadinessBucket,
}: StatsOverlayProps) {
  const [selectedBuffType, setSelectedBuffType] = React.useState<Buff['modifierType'] | null>(null);
  const readinessLabel = latestReadinessBucket ?? 'low';

  const groupedBuffs = groupBuffsByType(activeBuffs).slice(0, 3);
  const groupedBuffsWithSources = groupBuffsByTypeWithSources(activeBuffs);
  const selectedGroup = groupedBuffsWithSources.find((group) => group.modifierType === selectedBuffType);

  const buffIcons = groupedBuffs.map((buff) => {
    const icon = getBuffIcon(buff.modifierType);
    const summary = getBuffSummary(buff);
    return (
      <button
        type="button"
        key={buff.modifierType}
        className={`inline-flex items-center justify-center w-8 h-8 rounded bg-indigo-500/20 border border-indigo-400/40 mr-1 ${selectedBuffType === buff.modifierType ? 'ring-2 ring-cyan-400' : ''}`}
        onClick={() => {
          setSelectedBuffType((current) => (current === buff.modifierType ? null : buff.modifierType));
        }}
        aria-label={`View ${summary} sources`}
        title={summary}
      >
        {icon}
      </button>
    );
  });

  const selectedDetails = selectedGroup ? (
    <div className="text-xs text-slate-200 mt-2 border-t border-indigo-400/30 pt-2">
      <p className="font-semibold text-emerald-300">
        {`${selectedGroup.totalMagnitude.toFixed(2)}x ${getBuffDisplayName(selectedGroup.modifierType)} sources`}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {selectedGroup.buffs.map((buff, index) => (
          <li key={`${buff.buffId}-${buff.source ?? 'unknown'}-${index}`} className="leading-4">
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
    <div className="absolute top-5 left-5 flex gap-[15px] z-10">
      {/* Total Cards */}
      <div className="bg-slate-800/90 px-5 py-2.5 rounded-lg text-center">
        <span className="block text-slate-400 text-xs mb-0.5">Total</span>
        <span className="block text-xl font-bold text-cyan-400">{totalCards}</span>
      </div>

      {/* Due Cards */}
      <div className="bg-slate-800/90 px-5 py-2.5 rounded-lg text-center">
        <span className="block text-slate-400 text-xs mb-0.5">Due</span>
        <span className="block text-xl font-bold text-cyan-400">{dueCards}</span>
      </div>

      {/* Active Topics */}
      <div className="bg-slate-800/90 px-5 py-2.5 rounded-lg text-center">
        <span className="block text-slate-400 text-xs mb-0.5">Topics</span>
        <span className="block text-xl font-bold text-cyan-400">{activeTopics}</span>
      </div>

      {/* Locked Topics */}
      <div className="bg-slate-800/90 px-5 py-2.5 rounded-lg text-center">
        <span className="block text-slate-400 text-xs mb-0.5">Locked</span>
        <span className="block text-xl font-bold text-amber-500">{lockedTopics}</span>
      </div>

      <div className="bg-slate-800/90 px-5 py-2.5 rounded-lg text-center min-w-[120px]">
        <span className="block text-slate-400 text-xs mb-0.5">Harmony</span>
        <span className="block text-xl font-bold text-emerald-400">
          {typeof latestHarmonyScore === 'number' ? `${latestHarmonyScore}` : '—'}
        </span>
        <span className="block text-xs text-slate-300 capitalize">
          {readinessLabel}
        </span>
      </div>

      <div className="bg-slate-800/90 px-5 py-2.5 rounded-lg text-left min-w-[140px]">
        <span className="block text-slate-400 text-xs mb-0.5">Active Buffs</span>
        {activeBuffs.length === 0 ? (
          <span className="text-sm text-slate-500">None</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center">{buffIcons}</div>
            {selectedBuffType ? (
              selectedDetails
            ) : (
              <span className="text-xs text-slate-500 mt-2">Click a buff to see details</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default StatsOverlay;
