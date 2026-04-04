'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  Check,
  Circle,
  History,
  Landmark,
  Minus,
  Network,
  Sparkles,
  Zap,
} from 'lucide-react';

import type { MiniGameType } from '@/types/core';
import type { BaseStudyCardType, StudyCardFilterSelection } from '@/features/content';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useProgressionStore } from '@/features/progression';
import { uiStore, useUIStore } from '@/store/uiStore';

const DEV_XP_BUFF_ID = 'dev_xp_multiplier_5x' as const;
const DEV_BUFF_SOURCE = 'command_palette' as const;
const DEV_XP_AMOUNT = 80;

const CARD_TYPE_FILTER_STORAGE_KEY = 'abyss.commandPalette.cardTypeFilter';

const BASE_CARD_TYPES_ORDER: readonly BaseStudyCardType[] = [
  'FLASHCARD',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
] as const;

const MINI_GAME_TYPES_ORDER: readonly MiniGameType[] = [
  'CATEGORY_SORT',
  'SEQUENCE_BUILD',
  'CONNECTION_WEB',
] as const;

const BASE_CARD_TYPE_LABELS: Record<BaseStudyCardType, string> = {
  FLASHCARD: 'Flashcards',
  SINGLE_CHOICE: 'Single choice',
  MULTI_CHOICE: 'Multiple choice',
};

const MINI_GAME_TYPE_LABELS: Record<MiniGameType, string> = {
  CATEGORY_SORT: 'Category sort',
  SEQUENCE_BUILD: 'Sequence build',
  CONNECTION_WEB: 'Connection web',
};

interface StudyCardFilterState {
  base: Record<BaseStudyCardType, boolean>;
  mini: Record<MiniGameType, boolean>;
}

function createDefaultStudyCardFilter(): StudyCardFilterState {
  return {
    base: {
      FLASHCARD: true,
      SINGLE_CHOICE: true,
      MULTI_CHOICE: true,
    },
    mini: {
      CATEGORY_SORT: true,
      SEQUENCE_BUILD: true,
      CONNECTION_WEB: true,
    },
  };
}

function mergeStudyCardFilter(partial: {
  base?: Partial<Record<BaseStudyCardType, boolean>>;
  mini?: Partial<Record<MiniGameType, boolean>>;
}): StudyCardFilterState {
  const d = createDefaultStudyCardFilter();
  return {
    base: {
      FLASHCARD: partial.base?.FLASHCARD ?? d.base.FLASHCARD,
      SINGLE_CHOICE: partial.base?.SINGLE_CHOICE ?? d.base.SINGLE_CHOICE,
      MULTI_CHOICE: partial.base?.MULTI_CHOICE ?? d.base.MULTI_CHOICE,
    },
    mini: {
      CATEGORY_SORT: partial.mini?.CATEGORY_SORT ?? d.mini.CATEGORY_SORT,
      SEQUENCE_BUILD: partial.mini?.SEQUENCE_BUILD ?? d.mini.SEQUENCE_BUILD,
      CONNECTION_WEB: partial.mini?.CONNECTION_WEB ?? d.mini.CONNECTION_WEB,
    },
  };
}

/** v1: flat Record<CardType, boolean>. v2: { v: 2, base, mini }. */
function loadStudyCardFilterFromStorage(): StudyCardFilterState {
  const fallback = createDefaultStudyCardFilter();
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(CARD_TYPE_FILTER_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'v' in parsed &&
      (parsed as { v?: number }).v === 2 &&
      'base' in parsed &&
      'mini' in parsed
    ) {
      const p = parsed as { base?: Partial<Record<BaseStudyCardType, boolean>>; mini?: Partial<Record<MiniGameType, boolean>> };
      return mergeStudyCardFilter({ base: p.base, mini: p.mini });
    }
    const flat = parsed as Partial<Record<BaseStudyCardType | 'MINI_GAME', boolean>> | null;
    if (flat && typeof flat.FLASHCARD === 'boolean' && typeof flat.MINI_GAME === 'boolean') {
      const allMini = flat.MINI_GAME;
      return mergeStudyCardFilter({
        base: {
          FLASHCARD: flat.FLASHCARD,
          SINGLE_CHOICE: flat.SINGLE_CHOICE ?? true,
          MULTI_CHOICE: flat.MULTI_CHOICE ?? true,
        },
        mini: {
          CATEGORY_SORT: allMini,
          SEQUENCE_BUILD: allMini,
          CONNECTION_WEB: allMini,
        },
      });
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function saveStudyCardFilterToStorage(filter: StudyCardFilterState): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      CARD_TYPE_FILTER_STORAGE_KEY,
      JSON.stringify({ v: 2, base: filter.base, mini: filter.mini }),
    );
  } catch {
    // ignore quota / private mode
  }
}

export interface AbyssCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDebugMode: boolean;
  /** When set, shows “Summarize screen” which runs screen capture then vision LLM. */
  onSummarizeScreen?: () => void;
  /** Opens AscentWeaver to generate a curriculum graph into IndexedDB. */
  onOpenAscentWeaver?: () => void;
  /** Starts a study session for the selected topic using only enabled base types and mini-game kinds. */
  onStartStudyWithCardTypes?: (selection: StudyCardFilterSelection) => void;
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
  onStartStudyWithCardTypes,
}: AbyssCommandPaletteProps) {
  const selectedTopicId = useUIStore((s) => s.selectedTopicId);
  const devXpBuffActive = useProgressionStore((s) => s.activeBuffs.some(matchesDevXpBuff));
  const [studyCardFilter, setStudyCardFilter] = useState(createDefaultStudyCardFilter);
  const skipNextCardFilterSaveRef = useRef(true);

  useEffect(() => {
    setStudyCardFilter(loadStudyCardFilterFromStorage());
  }, []);

  useEffect(() => {
    if (skipNextCardFilterSaveRef.current) {
      skipNextCardFilterSaveRef.current = false;
      return;
    }
    saveStudyCardFilterToStorage(studyCardFilter);
  }, [studyCardFilter]);

  const enabledBaseTypes = useMemo(
    () => BASE_CARD_TYPES_ORDER.filter((t) => studyCardFilter.base[t]),
    [studyCardFilter.base],
  );

  const enabledMiniGameTypes = useMemo(
    () => MINI_GAME_TYPES_ORDER.filter((t) => studyCardFilter.mini[t]),
    [studyCardFilter.mini],
  );

  const studySelection = useMemo(
    (): StudyCardFilterSelection => ({
      enabledBaseTypes,
      enabledMiniGameTypes,
    }),
    [enabledBaseTypes, enabledMiniGameTypes],
  );

  const canStartFilteredStudy =
    Boolean(selectedTopicId) &&
    (enabledBaseTypes.length > 0 || enabledMiniGameTypes.length > 0) &&
    Boolean(onStartStudyWithCardTypes);

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
    const nextXp = progression.addXP(topicId, DEV_XP_AMOUNT, { sessionId: 'dev-command-palette' });
    if (nextXp <= 0) {
      return;
    }
    progression.emitEvent('xp-gained', {
      amount: DEV_XP_AMOUNT,
      rating: 3,
      sessionId: 'dev-command-palette',
      topicId,
    });
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
          {onStartStudyWithCardTypes ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Card type filter">
                <CommandItem
                  value="study filtered cards selected topic crystal flashcard choice mini game"
                  disabled={!canStartFilteredStudy}
                  onSelect={() => {
                    if (!canStartFilteredStudy) {
                      return;
                    }
                    onStartStudyWithCardTypes(studySelection);
                    onOpenChange(false);
                  }}
                >
                  <BookOpen className="size-4" />
                  <span>Study filtered cards (selected topic)</span>
                </CommandItem>
                {BASE_CARD_TYPES_ORDER.map((type) => {
                  const on = studyCardFilter.base[type];
                  const label = BASE_CARD_TYPE_LABELS[type];
                  const searchExtras =
                    type === 'FLASHCARD'
                      ? 'flashcard deck'
                      : type === 'SINGLE_CHOICE'
                        ? 'single choice mcq'
                        : 'multiple choice mcq';
                  return (
                    <CommandItem
                      key={type}
                      value={`filter include ${label} ${type} ${searchExtras} study filter toggle`}
                      onSelect={() => {
                        setStudyCardFilter((prev) => ({
                          ...prev,
                          base: { ...prev.base, [type]: !prev.base[type] },
                        }));
                      }}
                    >
                      {on ? (
                        <Check className="size-4 text-primary" aria-hidden />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" aria-hidden />
                      )}
                      <span>
                        Include {label}
                        <span className="sr-only">{on ? ', on' : ', off'}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandGroup heading="Mini games">
                {MINI_GAME_TYPES_ORDER.map((type) => {
                  const on = studyCardFilter.mini[type];
                  const label = MINI_GAME_TYPE_LABELS[type];
                  const searchExtras =
                    type === 'CATEGORY_SORT'
                      ? 'category sort buckets'
                      : type === 'SEQUENCE_BUILD'
                        ? 'sequence build order steps'
                        : 'connection web match pairs';
                  return (
                    <CommandItem
                      key={type}
                      value={`filter include mini game ${label} ${type} ${searchExtras} study filter toggle`}
                      onSelect={() => {
                        setStudyCardFilter((prev) => ({
                          ...prev,
                          mini: { ...prev.mini, [type]: !prev.mini[type] },
                        }));
                      }}
                    >
                      {on ? (
                        <Check className="size-4 text-primary" aria-hidden />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" aria-hidden />
                      )}
                      <span>
                        Include {label}
                        <span className="sr-only">{on ? ', on' : ', off'}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          ) : null}
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
