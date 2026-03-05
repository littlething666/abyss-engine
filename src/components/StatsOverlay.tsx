import React from 'react';
import { AttunementReadinessBucket, Buff } from '../types/progression';
import { getBuffIcon, getBuffSummary } from '../features/progression/buffDisplay';

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
  const readinessLabel = latestReadinessBucket ?? 'low';

  const buffIcons = activeBuffs.slice(0, 3).map((buff) => {
    const icon = getBuffIcon(buff.modifierType);
    const summary = getBuffSummary(buff);
    return (
      <span
        key={buff.buffId}
        className="inline-flex items-center justify-center w-8 h-8 rounded bg-indigo-500/20 border border-indigo-400/40 mr-1"
        title={`${summary} (${buff.condition})`}
      >
        {icon}
      </span>
    );
  });

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
          <div className="flex flex-wrap items-center">{buffIcons}</div>
        )}
      </div>
    </div>
  );
}

export default StatsOverlay;
