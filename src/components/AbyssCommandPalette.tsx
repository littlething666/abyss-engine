'use client';

import React, { useEffect } from 'react';
import { Camera, History, Landmark, Minus, Network, Sparkles, Zap } from 'lucide-react';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { calculateLevelFromXP, useProgressionStore } from '@/features/progression';
import { uiStore } from '@/store/uiStore';

const DEV_XP_BUFF_ID = 'dev_xp_multiplier_5x' as const;
const DEV_BUFF_SOURCE = 'command_palette' as const;
const DEV_XP_AMOUNT = 80;

export interface AbyssCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDebugMode: boolean;
  /** When set, shows “Summarize screen” which runs screen capture then vision LLM. */
  onSummarizeScreen?: () => void;
  /** Opens AscentWeaver to generate a curriculum graph into IndexedDB. */
  onOpenAscentWeaver?: () => void;
}

function matchesDevXpBuff(b: { buffId: string; source?: string }) {
  return b.buffId === DEV_XP_BUFF_ID && (b.source ?? 'legacy') === DEV_BUFF_SOURCE;
}

export function AbyssCommandPalette({
  open,
  onOpenChange,
  isDebugMode,
  onSummarizeScreen,
  onOpenAscentWeaver,
}: AbyssCommandPaletteProps) {
  const selectedTopicId = uiStore((s) => s.selectedTopicId);
  const devXpBuffActive = useProgressionStore((s) => s.activeBuffs.some(matchesDevXpBuff));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return;
      }
      if (open) {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      event.preventDefault();
      onOpenChange(true);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const handleOpenTimeline = () => {
    uiStore.getState().openStudyTimeline();
    onOpenChange(false);
  };

  const handleOpenDiscovery = () => {
    uiStore.getState().openDiscoveryModal();
    onOpenChange(false);
  };

  const handleDevAddXp = () => {
    const topicId = uiStore.getState().selectedTopicId;
    if (!topicId) {
      return;
    }
    const progression = useProgressionStore.getState();
    const crystal = progression.activeCrystals.find((c) => c.topicId === topicId);
    if (!crystal) {
      return;
    }
    const previousLevel = calculateLevelFromXP(crystal.xp);
    const nextXp = progression.addXP(topicId, DEV_XP_AMOUNT);
    if (nextXp <= 0) {
      return;
    }
    const nextLevel = calculateLevelFromXP(nextXp);
    progression.emitEvent('xp-gained', {
      amount: DEV_XP_AMOUNT,
      rating: 3,
      sessionId: 'dev-command-palette',
      topicId,
    });
    const levelsGained = nextLevel - previousLevel;
    if (levelsGained > 0) {
      progression.emitEvent('crystal-level-up', {
        topicId,
        sessionId: 'dev-command-palette',
        previousLevel,
        nextLevel,
        levelsGained,
      });
    }
    onOpenChange(false);
  };

  const handleDevSubtractXp = () => {
    const topicId = uiStore.getState().selectedTopicId;
    if (!topicId) {
      return;
    }
    const progression = useProgressionStore.getState();
    const crystal = progression.activeCrystals.find((c) => c.topicId === topicId);
    if (!crystal) {
      return;
    }
    progression.addXP(topicId, -DEV_XP_AMOUNT);
    progression.emitEvent('xp-gained', {
      amount: -DEV_XP_AMOUNT,
      rating: 3,
      sessionId: 'dev-command-palette',
      topicId,
    });
    onOpenChange(false);
  };

  const handleDevXpBuffToggle = () => {
    useProgressionStore.getState().toggleBuffFromCatalog(DEV_XP_BUFF_ID, DEV_BUFF_SOURCE);
    onOpenChange(false);
  };

  const canDevAddXp = Boolean(selectedTopicId);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <Command className="rounded-lg! border-none! bg-transparent! shadow-none!">
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          <CommandGroup heading="Study">
            <CommandItem value="timeline study history" onSelect={handleOpenTimeline}>
              <History className="size-4" />
              <span>Open study timeline</span>
            </CommandItem>
            <CommandItem value="discovery wisdom altar" onSelect={handleOpenDiscovery}>
              <Landmark className="size-4" />
              <span>Open Wisdom Altar (Discovery)</span>
            </CommandItem>
          </CommandGroup>
          {onSummarizeScreen ? (
            <CommandGroup heading="Assistant">
              <CommandItem
                value="screen capture summarize screenshot assistant vision"
                onSelect={() => {
                  onSummarizeScreen();
                  onOpenChange(false);
                }}
              >
                <Camera className="size-4" />
                <span>Summarize screen with assistant</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
          {onOpenAscentWeaver ? (
            <CommandGroup heading="Curriculum">
              <CommandItem
                value="ascent weaver curriculum graph generate subject indexeddb"
                onSelect={() => {
                  onOpenAscentWeaver();
                  onOpenChange(false);
                }}
              >
                <Network className="size-4" />
                <span>Open AscentWeaver (curriculum graph)</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
          {isDebugMode ? (
            <CommandGroup heading="Dev">
              <CommandItem
                value="add xp crystal dev"
                disabled={!canDevAddXp}
                onSelect={() => {
                  if (!canDevAddXp) {
                    return;
                  }
                  handleDevAddXp();
                }}
              >
                <Sparkles className="size-4" />
                <span>Add +80 XP to selected crystal</span>
              </CommandItem>
              <CommandItem
                value="subtract xp crystal dev"
                disabled={!canDevAddXp}
                onSelect={() => {
                  if (!canDevAddXp) {
                    return;
                  }
                  handleDevSubtractXp();
                }}
              >
                <Minus className="size-4" />
                <span>Subtract 80 XP from selected crystal</span>
              </CommandItem>
              <CommandItem value="toggle xp multiplier buff dev" onSelect={handleDevXpBuffToggle}>
                <Zap className="size-4" />
                <span>
                  {devXpBuffActive ? 'Turn off 5× XP multiplier (dev)' : 'Turn on 5× XP multiplier (dev)'}
                </span>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
