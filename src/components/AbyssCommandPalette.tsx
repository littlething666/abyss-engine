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
  ShieldCheck,
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
import { appEventBus } from '@/infrastructure/eventBus';
import { deckRepository } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import { crystalCeremonyStore, useProgressionStore } from '@/features/progression';
import { uiStore, useUIStore } from '@/store/uiStore';
import { calculateLevelFromXP, MAX_CRYSTAL_LEVEL } from '@/features/progression/progressionUtils';
import { generateTrialQuestions } from '@/features/crystalTrial/generateTrialQuestions';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';

const DEV_XP_BUFF_ID = 'dev_xp_multiplier_5x' as const;
const DEV_BUFF_SOURCE = 'command_palette' as const;
const DEV_XP_AMOUNT = 80;

const CARD_TYPE_FILTER_STORAGE_KEY = 'abyss.commandPalette.cardTypeFilter';
const RECENT_COMMANDS_STORAGE_KEY = 'abyss.commandPalette.recentCommands';
const RECENT_COMMAND_LIMIT = 3;

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

const RECENT_COMMAND_IDS = [
  'open-study-timeline',
  'open-wisdom-altar',
  'study-filtered-cards',
  'filter-flashcard',
  'filter-single-choice',
  'filter-multi-choice',
  'filter-category-sort',
  'filter-sequence-build',
  'filter-connection-web',
  'summarize-screen',
  'new-subject-curriculum',
  'prepare-trial',
  'force-complete-trial',
  'add-xp',
  'subtract-xp',
  'trigger-level-up-animation',
  'toggle-xp-buff',
] as const;

type PaletteCommandId = (typeof RECENT_COMMAND_IDS)[number];

const RECENT_COMMAND_SET = new Set<string>(RECENT_COMMAND_IDS);

interface PaletteCommandMeta {
  id: PaletteCommandId;
  label: string;
  value: string;
  icon: React.ComponentType<React.ComponentProps<'svg'> & { className?: string }>;
  onSelect: () => void;
  disabled: boolean;
}

function isPaletteCommandId(value: unknown): value is PaletteCommandId {
  return typeof value === 'string' && RECENT_COMMAND_SET.has(value);
}

function normalizeRecentCommands(raw: unknown): PaletteCommandId[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized: PaletteCommandId[] = [];
  const seen = new Set<PaletteCommandId>();

  for (const commandId of raw) {
    if (!isPaletteCommandId(commandId)) {
      continue;
    }
    if (seen.has(commandId)) {
      continue;
    }
    seen.add(commandId);
    normalized.push(commandId);
    if (normalized.length >= RECENT_COMMAND_LIMIT) {
      break;
    }
  }

  return normalized;
}

function loadRecentCommandsFromStorage(): PaletteCommandId[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeRecentCommands(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveRecentCommandsToStorage(commands: PaletteCommandId[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(RECENT_COMMANDS_STORAGE_KEY, JSON.stringify(commands));
  } catch {
    // ignore quota / private mode
  }
}

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
  /** Opens the incremental subject flow (two-tier graph into IndexedDB). */
  onOpenSubjectCurriculum?: () => void;
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
  onOpenSubjectCurriculum,
  onStartStudyWithCardTypes,
}: AbyssCommandPaletteProps) {
  const selectedTopic = useUIStore((s) => s.selectedTopic);
  const devXpBuffActive = useProgressionStore((s) => s.activeBuffs.some(matchesDevXpBuff));
  const activeCrystals = useProgressionStore((s) => s.activeCrystals);
  const trialStatus = useCrystalTrialStore((s) => (selectedTopic ? s.getTrialStatus(selectedTopic) : 'idle'));
  const [studyCardFilter, setStudyCardFilter] = useState(createDefaultStudyCardFilter);
  const skipNextCardFilterSaveRef = useRef(true);
  const [recentCommands, setRecentCommands] = useState<PaletteCommandId[]>(() => loadRecentCommandsFromStorage());
  const selectedCrystal = activeCrystals.find(
    (crystal) =>
      selectedTopic?.subjectId === crystal.subjectId &&
      selectedTopic?.topicId === crystal.topicId,
  );
  const selectedCrystalLevel = selectedCrystal ? calculateLevelFromXP(selectedCrystal.xp) : null;
  const canPrepareTrialReady =
    Boolean(selectedTopic) &&
    selectedCrystal != null &&
    selectedCrystalLevel !== null &&
    selectedCrystalLevel < MAX_CRYSTAL_LEVEL &&
    (trialStatus === 'idle' || trialStatus === 'failed' || trialStatus === 'cooldown');
  const canForceTrialPass =
    Boolean(selectedTopic) && (trialStatus === 'awaiting_player' || trialStatus === 'in_progress');
  const canTriggerLevelUpAnimation = Boolean(selectedTopic && selectedCrystal);

  const rememberRecentCommand = (commandId: PaletteCommandId) => {
    setRecentCommands((previous) => {
      const next = [commandId, ...previous.filter((id) => id !== commandId)];
      return next.slice(0, RECENT_COMMAND_LIMIT);
    });
  };

  const handleCommandSelect = (commandId: PaletteCommandId, enabled: boolean, action: () => void) => {
    if (!enabled) {
      return;
    }
    rememberRecentCommand(commandId);
    action();
  };

  useEffect(() => {
    saveRecentCommandsToStorage(recentCommands);
  }, [recentCommands]);

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
    Boolean(selectedTopic) &&
    (enabledBaseTypes.length > 0 || enabledMiniGameTypes.length > 0) &&
    Boolean(onStartStudyWithCardTypes);

  const canSummarizeScreen = Boolean(onSummarizeScreen);
  const canOpenSubjectCurriculum = Boolean(onOpenSubjectCurriculum);
  

  const handlePrepareTrialReady = () => {
    if (!selectedTopic) {
      return;
    }
    if (!selectedCrystal || selectedCrystalLevel == null || selectedCrystalLevel >= MAX_CRYSTAL_LEVEL) {
      return;
    }
    const trialStore = useCrystalTrialStore.getState();
    const currentTrialStatus = trialStore.getTrialStatus(selectedTopic);

    if (currentTrialStatus === 'cooldown') {
      trialStore.clearCooldown(selectedTopic);
    }

    if (currentTrialStatus === 'idle') {
      appEventBus.emit('crystal:trial-pregenerate', {
        subjectId: selectedTopic.subjectId,
        topicId: selectedTopic.topicId,
        currentLevel: selectedCrystalLevel,
        targetLevel: selectedCrystalLevel + 1,
      });
      onOpenChange(false);
      return;
    }

    if (currentTrialStatus === 'failed' || currentTrialStatus === 'cooldown') {
      trialStore.invalidateAndRegenerate(selectedTopic, {
        subjectId: selectedTopic.subjectId,
        topicId: selectedTopic.topicId,
        targetLevel: selectedCrystalLevel + 1,
      });
      void generateTrialQuestions({
        chat: getChatCompletionsRepositoryForSurface('crystalTrial'),
        deckRepository,
        subjectId: selectedTopic.subjectId,
        topicId: selectedTopic.topicId,
        currentLevel: selectedCrystalLevel,
      });
      onOpenChange(false);
    }
  };

  const handleForceTrialPass = () => {
    if (!selectedTopic || !canForceTrialPass) {
      return;
    }

    const result = useCrystalTrialStore.getState().forceCompleteWithCorrectAnswers(selectedTopic);
    if (!result) {
      return;
    }
    uiStore.getState().openCrystalTrial();
    onOpenChange(false);
  };

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
    const ref = uiStore.getState().selectedTopic;
    if (!ref) {
      return;
    }
    const progression = useProgressionStore.getState();
    const nextXp = progression.addXP(ref, DEV_XP_AMOUNT, { sessionId: 'dev-command-palette' });
    if (nextXp <= 0) {
      return;
    }
    appEventBus.emit('xp:gained', {
      subjectId: ref.subjectId,
      topicId: ref.topicId,
      amount: DEV_XP_AMOUNT,
      sessionId: 'dev-command-palette',
      cardId: 'dev-command-palette',
    });
    onOpenChange(false);
  };

  const handleDevSubtractXp = () => {
    const ref = uiStore.getState().selectedTopic;
    if (!ref) {
      return;
    }
    const progression = useProgressionStore.getState();
    const crystal = progression.activeCrystals.find(
      (c) => c.subjectId === ref.subjectId && c.topicId === ref.topicId,
    );
    if (!crystal) {
      return;
    }
    progression.addXP(ref, -DEV_XP_AMOUNT);
    appEventBus.emit('xp:gained', {
      subjectId: ref.subjectId,
      topicId: ref.topicId,
      amount: -DEV_XP_AMOUNT,
      sessionId: 'dev-command-palette',
      cardId: 'dev-command-palette',
    });
    onOpenChange(false);
  };

  const handleDevTriggerLevelUpAnimation = () => {
    if (!selectedTopic) {
      return;
    }
    const { isDiscoveryModalOpen, isStudyPanelOpen, isRitualModalOpen, isStudyTimelineOpen, isCrystalTrialOpen } =
      useUIStore.getState();
    crystalCeremonyStore
      .getState()
      .notifyLevelUp(selectedTopic, isDiscoveryModalOpen || isStudyPanelOpen || isRitualModalOpen || isStudyTimelineOpen || isCrystalTrialOpen);
    onOpenChange(false);
  };

  const handleDevXpBuffToggle = () => {
    useProgressionStore.getState().toggleBuffFromCatalog(DEV_XP_BUFF_ID, DEV_BUFF_SOURCE);
    onOpenChange(false);
  };

  const canDevAddXp = Boolean(selectedTopic);

  const handleStudyFilteredCards = () => {
    if (!canStartFilteredStudy || !onStartStudyWithCardTypes) {
      return;
    }
    onStartStudyWithCardTypes(studySelection);
    onOpenChange(false);
  };

  const handleSummarizeScreen = () => {
    if (!onSummarizeScreen) {
      return;
    }
    onSummarizeScreen();
    onOpenChange(false);
  };

  const handleOpenSubjectCurriculum = () => {
    if (!onOpenSubjectCurriculum) {
      return;
    }
    onOpenSubjectCurriculum();
    onOpenChange(false);
  };

  const commandMetadata: Record<PaletteCommandId, PaletteCommandMeta> = {
    'open-study-timeline': {
      id: 'open-study-timeline' as const,
      label: 'Open study timeline',
      value: 'timeline study history',
      icon: History,
      onSelect: () => handleCommandSelect('open-study-timeline', true, handleOpenTimeline),
      disabled: false,
    },
    'open-wisdom-altar': {
      id: 'open-wisdom-altar' as const,
      label: 'Open Wisdom Altar (Discovery)',
      value: 'discovery wisdom altar',
      icon: Landmark,
      onSelect: () => handleCommandSelect('open-wisdom-altar', true, handleOpenDiscovery),
      disabled: false,
    },
    'study-filtered-cards': {
      id: 'study-filtered-cards' as const,
      label: 'Study filtered cards (selected topic)',
      value: 'study filtered cards selected topic crystal flashcard choice mini game',
      icon: BookOpen,
      onSelect: () => handleCommandSelect('study-filtered-cards', canStartFilteredStudy, handleStudyFilteredCards),
      disabled: !canStartFilteredStudy,
    },
    'filter-flashcard': {
      id: 'filter-flashcard' as const,
      label: `Include ${BASE_CARD_TYPE_LABELS.FLASHCARD}`,
      value: `filter include ${BASE_CARD_TYPE_LABELS.FLASHCARD} FLASHCARD flashcard deck study filter toggle`,
      icon: studyCardFilter.base.FLASHCARD ? Check : Circle,
      onSelect: () =>
        handleCommandSelect('filter-flashcard', true, () => {
          setStudyCardFilter((prev) => ({
            ...prev,
            base: { ...prev.base, FLASHCARD: !prev.base.FLASHCARD },
          }));
        }),
      disabled: false,
    },
    'filter-single-choice': {
      id: 'filter-single-choice' as const,
      label: `Include ${BASE_CARD_TYPE_LABELS.SINGLE_CHOICE}`,
      value: 'filter include single choice SINGLE_CHOICE study filter toggle',
      icon: studyCardFilter.base.SINGLE_CHOICE ? Check : Circle,
      onSelect: () =>
        handleCommandSelect('filter-single-choice', true, () => {
          setStudyCardFilter((prev) => ({
            ...prev,
            base: { ...prev.base, SINGLE_CHOICE: !prev.base.SINGLE_CHOICE },
          }));
        }),
      disabled: false,
    },
    'filter-multi-choice': {
      id: 'filter-multi-choice' as const,
      label: `Include ${BASE_CARD_TYPE_LABELS.MULTI_CHOICE}`,
      value: 'filter include multiple choice MULTI_CHOICE study filter toggle',
      icon: studyCardFilter.base.MULTI_CHOICE ? Check : Circle,
      onSelect: () =>
        handleCommandSelect('filter-multi-choice', true, () => {
          setStudyCardFilter((prev) => ({
            ...prev,
            base: { ...prev.base, MULTI_CHOICE: !prev.base.MULTI_CHOICE },
          }));
        }),
      disabled: false,
    },
    'filter-category-sort': {
      id: 'filter-category-sort' as const,
      label: `Include ${MINI_GAME_TYPE_LABELS.CATEGORY_SORT}`,
      value: 'filter include mini game category sort CATEGORY_SORT study filter toggle',
      icon: studyCardFilter.mini.CATEGORY_SORT ? Check : Circle,
      onSelect: () =>
        handleCommandSelect('filter-category-sort', true, () => {
          setStudyCardFilter((prev) => ({
            ...prev,
            mini: { ...prev.mini, CATEGORY_SORT: !prev.mini.CATEGORY_SORT },
          }));
        }),
      disabled: false,
    },
    'filter-sequence-build': {
      id: 'filter-sequence-build' as const,
      label: `Include ${MINI_GAME_TYPE_LABELS.SEQUENCE_BUILD}`,
      value: 'filter include mini game sequence build SEQUENCE_BUILD study filter toggle',
      icon: studyCardFilter.mini.SEQUENCE_BUILD ? Check : Circle,
      onSelect: () =>
        handleCommandSelect('filter-sequence-build', true, () => {
          setStudyCardFilter((prev) => ({
            ...prev,
            mini: { ...prev.mini, SEQUENCE_BUILD: !prev.mini.SEQUENCE_BUILD },
          }));
        }),
      disabled: false,
    },
    'filter-connection-web': {
      id: 'filter-connection-web' as const,
      label: `Include ${MINI_GAME_TYPE_LABELS.CONNECTION_WEB}`,
      value: 'filter include mini game connection web CONNECTION_WEB study filter toggle',
      icon: studyCardFilter.mini.CONNECTION_WEB ? Check : Circle,
      onSelect: () =>
        handleCommandSelect('filter-connection-web', true, () => {
          setStudyCardFilter((prev) => ({
            ...prev,
            mini: { ...prev.mini, CONNECTION_WEB: !prev.mini.CONNECTION_WEB },
          }));
        }),
      disabled: false,
    },
    'summarize-screen': {
      id: 'summarize-screen' as const,
      label: 'Summarize screen with assistant',
      value: 'screen capture summarize screenshot assistant vision',
      icon: Camera,
      onSelect: () => handleCommandSelect('summarize-screen', canSummarizeScreen, handleSummarizeScreen),
      disabled: !canSummarizeScreen,
    },
    'new-subject-curriculum': {
      id: 'new-subject-curriculum' as const,
      label: 'New subject from prompt (curriculum graph)',
      value: 'new subject curriculum graph generate indexeddb',
      icon: Network,
      onSelect: () => handleCommandSelect('new-subject-curriculum', canOpenSubjectCurriculum, handleOpenSubjectCurriculum),
      disabled: !canOpenSubjectCurriculum,
    },
    'prepare-trial': {
      id: 'prepare-trial' as const,
      label: 'Prepare selected crystal trial for challenge',
      value: 'prepare trial ready selected crystal crystal trial',
      icon: ShieldCheck,
      onSelect: () => handleCommandSelect('prepare-trial', canPrepareTrialReady, handlePrepareTrialReady),
      disabled: !canPrepareTrialReady,
    },
    'force-complete-trial': {
      id: 'force-complete-trial' as const,
      label: 'Force complete selected crystal trial (correct answers)',
      value: 'force complete selected crystal trial correct answers debug',
      icon: Check,
      onSelect: () => handleCommandSelect('force-complete-trial', canForceTrialPass, handleForceTrialPass),
      disabled: !canForceTrialPass,
    },
    'add-xp': {
      id: 'add-xp' as const,
      label: 'Add +80 XP to selected crystal',
      value: 'add xp crystal dev',
      icon: Sparkles,
      onSelect: () => handleCommandSelect('add-xp', canDevAddXp, handleDevAddXp),
      disabled: !canDevAddXp,
    },
    'subtract-xp': {
      id: 'subtract-xp' as const,
      label: 'Subtract 80 XP from selected crystal',
      value: 'subtract xp crystal dev',
      icon: Minus,
      onSelect: () => handleCommandSelect('subtract-xp', canDevAddXp, handleDevSubtractXp),
      disabled: !canDevAddXp,
    },
    'trigger-level-up-animation': {
      id: 'trigger-level-up-animation' as const,
      label: 'Trigger selected crystal level-up animation',
      value: 'trigger crystal level up animation dev',
      icon: Sparkles,
      onSelect: () =>
        handleCommandSelect('trigger-level-up-animation', canTriggerLevelUpAnimation, handleDevTriggerLevelUpAnimation),
      disabled: !canTriggerLevelUpAnimation,
    },
    'toggle-xp-buff': {
      id: 'toggle-xp-buff' as const,
      label: devXpBuffActive ? 'Turn off 5× XP multiplier (dev)' : 'Turn on 5× XP multiplier (dev)',
      value: 'toggle xp multiplier buff dev',
      icon: Zap,
      onSelect: () => handleCommandSelect('toggle-xp-buff', isDebugMode, handleDevXpBuffToggle),
      disabled: !isDebugMode,
    },
  };

  const visibleRecentCommands = recentCommands
    .map((commandId) => commandMetadata[commandId as PaletteCommandId])
    .filter((command) => command != null)
    .filter((command) => {
      if (command.id === 'filter-flashcard' || command.id === 'filter-single-choice' || command.id === 'filter-multi-choice') {
        return onStartStudyWithCardTypes;
      }
      if (
        command.id === 'filter-category-sort' ||
        command.id === 'filter-sequence-build' ||
        command.id === 'filter-connection-web'
      ) {
        return onStartStudyWithCardTypes;
      }
      if (command.id === 'summarize-screen') {
        return Boolean(onSummarizeScreen);
      }
      if (command.id === 'new-subject-curriculum') {
        return Boolean(onOpenSubjectCurriculum);
      }
      if (command.id === 'prepare-trial' || command.id === 'force-complete-trial' || command.id === 'add-xp' || command.id === 'subtract-xp' || command.id === 'trigger-level-up-animation' || command.id === 'toggle-xp-buff') {
        return isDebugMode;
      }
      return true;
    });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <Command className="rounded-lg! border-none! bg-transparent! shadow-none!">
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          {visibleRecentCommands.length > 0 ? (
            <CommandGroup heading="Recent">
              {visibleRecentCommands.map((command) => (
                <CommandItem key={command.id} value={command.value} disabled={command.disabled} onSelect={command.onSelect}>
                  <command.icon className="size-4" />
                  <span>{command.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Study">
            <CommandItem value="timeline study history" onSelect={() => commandMetadata['open-study-timeline'].onSelect()}>
              <History className="size-4" />
              <span>Open study timeline</span>
            </CommandItem>
            <CommandItem value="discovery wisdom altar" onSelect={() => commandMetadata['open-wisdom-altar'].onSelect()}>
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
                  onSelect={() => commandMetadata['study-filtered-cards'].onSelect()}
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
                        if (type === 'FLASHCARD') {
                          commandMetadata['filter-flashcard'].onSelect();
                          return;
                        }
                        if (type === 'SINGLE_CHOICE') {
                          commandMetadata['filter-single-choice'].onSelect();
                          return;
                        }
                        commandMetadata['filter-multi-choice'].onSelect();
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
                        if (type === 'CATEGORY_SORT') {
                          commandMetadata['filter-category-sort'].onSelect();
                          return;
                        }
                        if (type === 'SEQUENCE_BUILD') {
                          commandMetadata['filter-sequence-build'].onSelect();
                          return;
                        }
                        commandMetadata['filter-connection-web'].onSelect();
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
                onSelect={() => commandMetadata['summarize-screen'].onSelect()}
              >
                <Camera className="size-4" />
                <span>Summarize screen with assistant</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
          {onOpenSubjectCurriculum ? (
            <CommandGroup heading="Curriculum">
              <CommandItem
                value="new subject curriculum graph generate indexeddb"
                onSelect={() => commandMetadata['new-subject-curriculum'].onSelect()}
              >
                <Network className="size-4" />
                <span>New subject from prompt (curriculum graph)</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
          {isDebugMode ? (
            <CommandGroup heading="Dev">
              <CommandItem
                value="prepare trial ready selected crystal crystal trial"
                disabled={!canPrepareTrialReady}
                onSelect={() => commandMetadata['prepare-trial'].onSelect()}
              >
                <ShieldCheck className="size-4" />
                <span>Prepare selected crystal trial for challenge</span>
              </CommandItem>
              <CommandItem
                value="force complete selected crystal trial correct answers debug"
                disabled={!canForceTrialPass}
                onSelect={() => commandMetadata['force-complete-trial'].onSelect()}
              >
                <Check className="size-4 text-primary" />
                <span>Force complete selected crystal trial (correct answers)</span>
              </CommandItem>
              <CommandItem
                value="add xp crystal dev"
                disabled={!canDevAddXp}
                onSelect={() => commandMetadata['add-xp'].onSelect()}
              >
                <Sparkles className="size-4" />
                <span>Add +80 XP to selected crystal</span>
              </CommandItem>
              <CommandItem
                value="subtract xp crystal dev"
                disabled={!canDevAddXp}
                onSelect={() => commandMetadata['subtract-xp'].onSelect()}
              >
                <Minus className="size-4" />
                <span>Subtract 80 XP from selected crystal</span>
              </CommandItem>
              <CommandItem
                value="trigger crystal level up animation dev"
                disabled={!canTriggerLevelUpAnimation}
                onSelect={() => commandMetadata['trigger-level-up-animation'].onSelect()}
              >
                <Sparkles className="size-4" />
                <span>Trigger selected crystal level-up animation</span>
              </CommandItem>
              <CommandItem value="toggle xp multiplier buff dev" onSelect={() => commandMetadata['toggle-xp-buff'].onSelect()}>
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
