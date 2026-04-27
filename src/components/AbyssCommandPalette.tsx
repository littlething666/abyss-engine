'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Circle,
  History,
  Landmark,
  Minus,
  Network,
  Settings,
  Sparkles,
  ShieldCheck,
  Volume2,
  VolumeX,
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
import { useFeatureFlagsStore } from '@/store/featureFlagsStore';
import { calculateLevelFromXP, MAX_CRYSTAL_LEVEL } from '@/features/progression/progressionUtils';
import { generateTrialQuestions } from '@/features/crystalTrial/generateTrialQuestions';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';

const DEV_XP_BUFF_ID = 'dev_xp_multiplier_5x' as const;
const DEV_BUFF_SOURCE = 'command_palette' as const;
const DEV_XP_AMOUNT = 80;

const CARD_TYPE_FILTER_STORAGE_KEY = 'abyss.commandPalette.cardTypeFilter';
const RECENT_COMMANDS_STORAGE_KEY = 'abyss.commandPalette.recentCommands';
const RECENT_COMMAND_LIMIT = 3;

const BASE_CARD_TYPES_ORDER: readonly BaseStudyCardType[] = ['FLASHCARD', 'SINGLE_CHOICE', 'MULTI_CHOICE'] as const;
const MINI_GAME_TYPES_ORDER: readonly MiniGameType[] = ['CATEGORY_SORT', 'SEQUENCE_BUILD', 'CONNECTION_WEB'] as const;

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
  'open-global-settings',
  'toggle-sfx',
  'study-filtered-cards',
  'filter-flashcard',
  'filter-single-choice',
  'filter-multi-choice',
  'filter-category-sort',
  'filter-sequence-build',
  'filter-connection-web',
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

function isPaletteCommandId(v: unknown): v is PaletteCommandId {
  return typeof v === 'string' && RECENT_COMMAND_SET.has(v);
}

function loadRecentCommandsFromStorage(): PaletteCommandId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: PaletteCommandId[] = [];
    const seen = new Set<PaletteCommandId>();
    for (const id of parsed) {
      if (!isPaletteCommandId(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= RECENT_COMMAND_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}

function saveRecentCommandsToStorage(commands: PaletteCommandId[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(RECENT_COMMANDS_STORAGE_KEY, JSON.stringify(commands)); } catch {}
}

interface StudyCardFilterState {
  base: Record<BaseStudyCardType, boolean>;
  mini: Record<MiniGameType, boolean>;
}

function createDefaultStudyCardFilter(): StudyCardFilterState {
  return {
    base: { FLASHCARD: true, SINGLE_CHOICE: true, MULTI_CHOICE: true },
    mini: { CATEGORY_SORT: true, SEQUENCE_BUILD: true, CONNECTION_WEB: true },
  };
}

function loadStudyCardFilterFromStorage(): StudyCardFilterState {
  const fallback = createDefaultStudyCardFilter();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(CARD_TYPE_FILTER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { v?: number; base?: Partial<StudyCardFilterState['base']>; mini?: Partial<StudyCardFilterState['mini']> };
    if (parsed?.v === 2) {
      return {
        base: { ...fallback.base, ...parsed.base },
        mini: { ...fallback.mini, ...parsed.mini },
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function saveStudyCardFilterToStorage(filter: StudyCardFilterState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CARD_TYPE_FILTER_STORAGE_KEY, JSON.stringify({ v: 2, base: filter.base, mini: filter.mini }));
  } catch {}
}

export interface AbyssCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDebugMode: boolean;
  onOpenSubjectCurriculum?: () => void;
  onStartStudyWithCardTypes?: (selection: StudyCardFilterSelection) => void;
}

function matchesDevXpBuff(b: { buffId: string; source?: string }) {
  return b.buffId === DEV_XP_BUFF_ID && (b.source ?? 'legacy') === DEV_BUFF_SOURCE;
}

export function AbyssCommandPalette({
  open,
  onOpenChange,
  isDebugMode,
  onOpenSubjectCurriculum,
  onStartStudyWithCardTypes,
}: AbyssCommandPaletteProps) {
  const selectedTopic = useUIStore((s) => s.selectedTopic);
  const devXpBuffActive = useProgressionStore((s) => s.activeBuffs.some(matchesDevXpBuff));
  const activeCrystals = useProgressionStore((s) => s.activeCrystals);
  const trialStatus = useCrystalTrialStore((s) => (selectedTopic ? s.getTrialStatus(selectedTopic) : 'idle'));
  const sfxEnabled = useFeatureFlagsStore((s) => s.sfxEnabled);
  const toggleSfxEnabled = useFeatureFlagsStore((s) => s.toggleSfxEnabled);
  const [studyCardFilter, setStudyCardFilter] = useState(createDefaultStudyCardFilter);
  const skipNextCardFilterSaveRef = useRef(true);
  const [recentCommands, setRecentCommands] = useState<PaletteCommandId[]>(() => loadRecentCommandsFromStorage());
  const selectedCrystal = activeCrystals.find(
    (c) => selectedTopic?.subjectId === c.subjectId && selectedTopic?.topicId === c.topicId,
  );
  const selectedCrystalLevel = selectedCrystal ? calculateLevelFromXP(selectedCrystal.xp) : null;
  const canPrepareTrialReady =
    Boolean(selectedTopic) && selectedCrystal != null && selectedCrystalLevel !== null &&
    selectedCrystalLevel < MAX_CRYSTAL_LEVEL &&
    (trialStatus === 'idle' || trialStatus === 'failed' || trialStatus === 'cooldown');
  const canForceTrialPass = Boolean(selectedTopic) && (trialStatus === 'awaiting_player' || trialStatus === 'in_progress');
  const canTriggerLevelUpAnimation = Boolean(selectedTopic && selectedCrystal);

  const rememberRecentCommand = (commandId: PaletteCommandId) => {
    setRecentCommands((previous) => [commandId, ...previous.filter((id) => id !== commandId)].slice(0, RECENT_COMMAND_LIMIT));
  };

  const handleCommandSelect = (commandId: PaletteCommandId, enabled: boolean, action: () => void) => {
    if (!enabled) return;
    rememberRecentCommand(commandId);
    onOpenChange(false);
    action();
  };

  useEffect(() => { saveRecentCommandsToStorage(recentCommands); }, [recentCommands]);
  useEffect(() => { setStudyCardFilter(loadStudyCardFilterFromStorage()); }, []);
  useEffect(() => {
    if (skipNextCardFilterSaveRef.current) { skipNextCardFilterSaveRef.current = false; return; }
    saveStudyCardFilterToStorage(studyCardFilter);
  }, [studyCardFilter]);

  const enabledBaseTypes = useMemo(() => BASE_CARD_TYPES_ORDER.filter((t) => studyCardFilter.base[t]), [studyCardFilter.base]);
  const enabledMiniGameTypes = useMemo(() => MINI_GAME_TYPES_ORDER.filter((t) => studyCardFilter.mini[t]), [studyCardFilter.mini]);
  const studySelection = useMemo((): StudyCardFilterSelection => ({ enabledBaseTypes, enabledMiniGameTypes }), [enabledBaseTypes, enabledMiniGameTypes]);
  const canStartFilteredStudy = Boolean(selectedTopic) && (enabledBaseTypes.length > 0 || enabledMiniGameTypes.length > 0) && Boolean(onStartStudyWithCardTypes);
  const canOpenSubjectCurriculum = Boolean(onOpenSubjectCurriculum);

  const handlePrepareTrialReady = () => {
    if (!selectedTopic) return;
    if (!selectedCrystal || selectedCrystalLevel == null || selectedCrystalLevel >= MAX_CRYSTAL_LEVEL) return;
    const trialStore = useCrystalTrialStore.getState();
    const currentTrialStatus = trialStore.getTrialStatus(selectedTopic);
    if (currentTrialStatus === 'cooldown') trialStore.clearCooldown(selectedTopic);
    if (currentTrialStatus === 'idle') {
      appEventBus.emit('crystal:trial-pregenerate', {
        subjectId: selectedTopic.subjectId, topicId: selectedTopic.topicId,
        currentLevel: selectedCrystalLevel, targetLevel: selectedCrystalLevel + 1,
      });
      onOpenChange(false);
      return;
    }
    if (currentTrialStatus === 'failed' || currentTrialStatus === 'cooldown') {
      trialStore.invalidateAndRegenerate(selectedTopic, {
        subjectId: selectedTopic.subjectId, topicId: selectedTopic.topicId, targetLevel: selectedCrystalLevel + 1,
      });
      void generateTrialQuestions({
        chat: getChatCompletionsRepositoryForSurface('crystalTrial'),
        deckRepository,
        subjectId: selectedTopic.subjectId, topicId: selectedTopic.topicId,
        currentLevel: selectedCrystalLevel,
      });
      onOpenChange(false);
    }
  };

  const handleForceTrialPass = () => {
    if (!selectedTopic || !canForceTrialPass) return;
    const result = useCrystalTrialStore.getState().forceCompleteWithCorrectAnswers(selectedTopic);
    if (!result) return;
    uiStore.getState().openCrystalTrial();
    onOpenChange(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (open) { event.preventDefault(); onOpenChange(false); return; }
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const handleOpenTimeline = () => { uiStore.getState().openStudyTimeline(); onOpenChange(false); };
  const handleOpenDiscovery = () => { uiStore.getState().openDiscoveryModal(); onOpenChange(false); };
  const handleOpenGlobalSettings = () => { uiStore.getState().openGlobalSettings(); onOpenChange(false); };
  const handleToggleSfx = () => { toggleSfxEnabled(); onOpenChange(false); };

  const handleDevAddXp = () => {
    const ref = uiStore.getState().selectedTopic;
    if (!ref) return;
    const progression = useProgressionStore.getState();
    const nextXp = progression.addXP(ref, DEV_XP_AMOUNT, { sessionId: 'dev-command-palette' });
    if (nextXp <= 0) return;
    appEventBus.emit('xp:gained', {
      subjectId: ref.subjectId, topicId: ref.topicId, amount: DEV_XP_AMOUNT,
      sessionId: 'dev-command-palette', cardId: 'dev-command-palette',
    });
    onOpenChange(false);
  };

  const handleDevSubtractXp = () => {
    const ref = uiStore.getState().selectedTopic;
    if (!ref) return;
    const progression = useProgressionStore.getState();
    const crystal = progression.activeCrystals.find((c) => c.subjectId === ref.subjectId && c.topicId === ref.topicId);
    if (!crystal) return;
    progression.addXP(ref, -DEV_XP_AMOUNT);
    appEventBus.emit('xp:gained', {
      subjectId: ref.subjectId, topicId: ref.topicId, amount: -DEV_XP_AMOUNT,
      sessionId: 'dev-command-palette', cardId: 'dev-command-palette',
    });
    onOpenChange(false);
  };

  const handleDevTriggerLevelUpAnimation = () => {
    if (!selectedTopic) return;
    const { isDiscoveryModalOpen, isStudyPanelOpen, isRitualModalOpen, isStudyTimelineOpen, isCrystalTrialOpen } = useUIStore.getState();
    crystalCeremonyStore.getState().notifyLevelUp(
      selectedTopic,
      isDiscoveryModalOpen || isStudyPanelOpen || isRitualModalOpen || isStudyTimelineOpen || isCrystalTrialOpen,
    );
    onOpenChange(false);
  };

  const handleDevXpBuffToggle = () => {
    useProgressionStore.getState().toggleBuffFromCatalog(DEV_XP_BUFF_ID, DEV_BUFF_SOURCE);
    onOpenChange(false);
  };

  const canDevAddXp = Boolean(selectedTopic);

  const handleStudyFilteredCards = () => {
    if (!canStartFilteredStudy || !onStartStudyWithCardTypes) return;
    onStartStudyWithCardTypes(studySelection);
    onOpenChange(false);
  };
  const handleOpenSubjectCurriculum = () => { if (!onOpenSubjectCurriculum) return; onOpenSubjectCurriculum(); onOpenChange(false); };

  const sfxLabel = sfxEnabled ? 'Turn off sound effects' : 'Turn on sound effects';
  const SfxIcon = sfxEnabled ? Volume2 : VolumeX;

  const commandMetadata: Record<PaletteCommandId, PaletteCommandMeta> = {
    'open-study-timeline': { id: 'open-study-timeline', label: 'Open study timeline', value: 'timeline study history', icon: History, onSelect: () => handleCommandSelect('open-study-timeline', true, handleOpenTimeline), disabled: false },
    'open-wisdom-altar': { id: 'open-wisdom-altar', label: 'Open Wisdom Altar (Discovery)', value: 'discovery wisdom altar', icon: Landmark, onSelect: () => handleCommandSelect('open-wisdom-altar', true, handleOpenDiscovery), disabled: false },
    'open-global-settings': { id: 'open-global-settings', label: 'Open settings', value: 'open settings llm openrouter provider routing', icon: Settings, onSelect: () => handleCommandSelect('open-global-settings', true, handleOpenGlobalSettings), disabled: false },
    'toggle-sfx': { id: 'toggle-sfx', label: sfxLabel, value: 'toggle sound effects sfx audio mute unmute', icon: SfxIcon, onSelect: () => handleCommandSelect('toggle-sfx', true, handleToggleSfx), disabled: false },
    'study-filtered-cards': { id: 'study-filtered-cards', label: 'Study filtered cards (selected topic)', value: 'study filtered cards selected topic crystal flashcard choice mini game', icon: BookOpen, onSelect: () => handleCommandSelect('study-filtered-cards', canStartFilteredStudy, handleStudyFilteredCards), disabled: !canStartFilteredStudy },
    'filter-flashcard': { id: 'filter-flashcard', label: 'Include ' + BASE_CARD_TYPE_LABELS.FLASHCARD, value: 'filter include FLASHCARD', icon: studyCardFilter.base.FLASHCARD ? Check : Circle, onSelect: () => handleCommandSelect('filter-flashcard', true, () => setStudyCardFilter((p) => ({ ...p, base: { ...p.base, FLASHCARD: !p.base.FLASHCARD } }))), disabled: false },
    'filter-single-choice': { id: 'filter-single-choice', label: 'Include ' + BASE_CARD_TYPE_LABELS.SINGLE_CHOICE, value: 'filter include SINGLE_CHOICE', icon: studyCardFilter.base.SINGLE_CHOICE ? Check : Circle, onSelect: () => handleCommandSelect('filter-single-choice', true, () => setStudyCardFilter((p) => ({ ...p, base: { ...p.base, SINGLE_CHOICE: !p.base.SINGLE_CHOICE } }))), disabled: false },
    'filter-multi-choice': { id: 'filter-multi-choice', label: 'Include ' + BASE_CARD_TYPE_LABELS.MULTI_CHOICE, value: 'filter include MULTI_CHOICE', icon: studyCardFilter.base.MULTI_CHOICE ? Check : Circle, onSelect: () => handleCommandSelect('filter-multi-choice', true, () => setStudyCardFilter((p) => ({ ...p, base: { ...p.base, MULTI_CHOICE: !p.base.MULTI_CHOICE } }))), disabled: false },
    'filter-category-sort': { id: 'filter-category-sort', label: 'Include ' + MINI_GAME_TYPE_LABELS.CATEGORY_SORT, value: 'filter include CATEGORY_SORT', icon: studyCardFilter.mini.CATEGORY_SORT ? Check : Circle, onSelect: () => handleCommandSelect('filter-category-sort', true, () => setStudyCardFilter((p) => ({ ...p, mini: { ...p.mini, CATEGORY_SORT: !p.mini.CATEGORY_SORT } }))), disabled: false },
    'filter-sequence-build': { id: 'filter-sequence-build', label: 'Include ' + MINI_GAME_TYPE_LABELS.SEQUENCE_BUILD, value: 'filter include SEQUENCE_BUILD', icon: studyCardFilter.mini.SEQUENCE_BUILD ? Check : Circle, onSelect: () => handleCommandSelect('filter-sequence-build', true, () => setStudyCardFilter((p) => ({ ...p, mini: { ...p.mini, SEQUENCE_BUILD: !p.mini.SEQUENCE_BUILD } }))), disabled: false },
    'filter-connection-web': { id: 'filter-connection-web', label: 'Include ' + MINI_GAME_TYPE_LABELS.CONNECTION_WEB, value: 'filter include CONNECTION_WEB', icon: studyCardFilter.mini.CONNECTION_WEB ? Check : Circle, onSelect: () => handleCommandSelect('filter-connection-web', true, () => setStudyCardFilter((p) => ({ ...p, mini: { ...p.mini, CONNECTION_WEB: !p.mini.CONNECTION_WEB } }))), disabled: false },
    'new-subject-curriculum': { id: 'new-subject-curriculum', label: 'New subject from prompt (curriculum graph)', value: 'new subject curriculum graph generate indexeddb', icon: Network, onSelect: () => handleCommandSelect('new-subject-curriculum', canOpenSubjectCurriculum, handleOpenSubjectCurriculum), disabled: !canOpenSubjectCurriculum },
    'prepare-trial': { id: 'prepare-trial', label: 'Prepare selected crystal trial for challenge', value: 'prepare trial ready selected crystal crystal trial', icon: ShieldCheck, onSelect: () => handleCommandSelect('prepare-trial', canPrepareTrialReady, handlePrepareTrialReady), disabled: !canPrepareTrialReady },
    'force-complete-trial': { id: 'force-complete-trial', label: 'Force complete selected crystal trial (correct answers)', value: 'force complete selected crystal trial correct answers debug', icon: Check, onSelect: () => handleCommandSelect('force-complete-trial', canForceTrialPass, handleForceTrialPass), disabled: !canForceTrialPass },
    'add-xp': { id: 'add-xp', label: 'Add +80 XP to selected crystal', value: 'add xp crystal dev', icon: Sparkles, onSelect: () => handleCommandSelect('add-xp', canDevAddXp, handleDevAddXp), disabled: !canDevAddXp },
    'subtract-xp': { id: 'subtract-xp', label: 'Subtract 80 XP from selected crystal', value: 'subtract xp crystal dev', icon: Minus, onSelect: () => handleCommandSelect('subtract-xp', canDevAddXp, handleDevSubtractXp), disabled: !canDevAddXp },
    'trigger-level-up-animation': { id: 'trigger-level-up-animation', label: 'Trigger selected crystal level-up animation', value: 'trigger crystal level up animation dev', icon: Sparkles, onSelect: () => handleCommandSelect('trigger-level-up-animation', canTriggerLevelUpAnimation, handleDevTriggerLevelUpAnimation), disabled: !canTriggerLevelUpAnimation },
    'toggle-xp-buff': { id: 'toggle-xp-buff', label: devXpBuffActive ? 'Turn off 5× XP multiplier (dev)' : 'Turn on 5× XP multiplier (dev)', value: 'toggle xp multiplier buff dev', icon: Zap, onSelect: () => handleCommandSelect('toggle-xp-buff', isDebugMode, handleDevXpBuffToggle), disabled: !isDebugMode },
  };

  const visibleRecentCommands = recentCommands
    .map((id) => commandMetadata[id])
    .filter((c) => c != null)
    .filter((c) => {
      if (c.id.startsWith('filter-')) return Boolean(onStartStudyWithCardTypes);
      if (c.id === 'new-subject-curriculum') return Boolean(onOpenSubjectCurriculum);
      if (c.id === 'prepare-trial' || c.id === 'force-complete-trial' || c.id === 'add-xp' || c.id === 'subtract-xp' || c.id === 'trigger-level-up-animation' || c.id === 'toggle-xp-buff') return isDebugMode;
      return true;
    });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <Command className="rounded-lg border">
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          {visibleRecentCommands.length > 0 ? (
            <CommandGroup heading="Recent">
              {visibleRecentCommands.map((c) => (
                <CommandItem key={c.id} value={c.value} disabled={c.disabled} onSelect={c.onSelect}>
                  <c.icon className="size-4" />
                  <span>{c.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Study">
            <CommandItem value={commandMetadata['open-study-timeline'].value} onSelect={commandMetadata['open-study-timeline'].onSelect}>
              <History className="size-4" /><span>{commandMetadata['open-study-timeline'].label}</span>
            </CommandItem>
            <CommandItem value={commandMetadata['open-wisdom-altar'].value} onSelect={commandMetadata['open-wisdom-altar'].onSelect}>
              <Landmark className="size-4" /><span>{commandMetadata['open-wisdom-altar'].label}</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem value={commandMetadata['open-global-settings'].value} onSelect={commandMetadata['open-global-settings'].onSelect}>
              <Settings className="size-4" /><span>{commandMetadata['open-global-settings'].label}</span>
            </CommandItem>
            <CommandItem value={commandMetadata['toggle-sfx'].value} onSelect={commandMetadata['toggle-sfx'].onSelect}>
              <SfxIcon className="size-4" /><span>{commandMetadata['toggle-sfx'].label}</span>
            </CommandItem>
          </CommandGroup>
          {onStartStudyWithCardTypes ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Card type filter">
                <CommandItem value={commandMetadata['study-filtered-cards'].value} disabled={!canStartFilteredStudy} onSelect={commandMetadata['study-filtered-cards'].onSelect}>
                  <BookOpen className="size-4" /><span>{commandMetadata['study-filtered-cards'].label}</span>
                </CommandItem>
                {BASE_CARD_TYPES_ORDER.map((type) => {
                  const key = type === 'FLASHCARD' ? 'filter-flashcard' : type === 'SINGLE_CHOICE' ? 'filter-single-choice' : 'filter-multi-choice';
                  const meta = commandMetadata[key as PaletteCommandId];
                  return (
                    <CommandItem key={type} value={meta.value} onSelect={meta.onSelect}>
                      <meta.icon className="size-4" /><span>{meta.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandGroup heading="Mini games">
                {MINI_GAME_TYPES_ORDER.map((type) => {
                  const key = type === 'CATEGORY_SORT' ? 'filter-category-sort' : type === 'SEQUENCE_BUILD' ? 'filter-sequence-build' : 'filter-connection-web';
                  const meta = commandMetadata[key as PaletteCommandId];
                  return (
                    <CommandItem key={type} value={meta.value} onSelect={meta.onSelect}>
                      <meta.icon className="size-4" /><span>{meta.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          ) : null}
          {onOpenSubjectCurriculum ? (
            <CommandGroup heading="Curriculum">
              <CommandItem value={commandMetadata['new-subject-curriculum'].value} onSelect={commandMetadata['new-subject-curriculum'].onSelect}>
                <Network className="size-4" /><span>{commandMetadata['new-subject-curriculum'].label}</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
          {isDebugMode ? (
            <CommandGroup heading="Dev">
              <CommandItem value={commandMetadata['prepare-trial'].value} disabled={!canPrepareTrialReady} onSelect={commandMetadata['prepare-trial'].onSelect}>
                <ShieldCheck className="size-4" /><span>{commandMetadata['prepare-trial'].label}</span>
              </CommandItem>
              <CommandItem value={commandMetadata['force-complete-trial'].value} disabled={!canForceTrialPass} onSelect={commandMetadata['force-complete-trial'].onSelect}>
                <Check className="size-4 text-primary" /><span>{commandMetadata['force-complete-trial'].label}</span>
              </CommandItem>
              <CommandItem value={commandMetadata['add-xp'].value} disabled={!canDevAddXp} onSelect={commandMetadata['add-xp'].onSelect}>
                <Sparkles className="size-4" /><span>{commandMetadata['add-xp'].label}</span>
              </CommandItem>
              <CommandItem value={commandMetadata['subtract-xp'].value} disabled={!canDevAddXp} onSelect={commandMetadata['subtract-xp'].onSelect}>
                <Minus className="size-4" /><span>{commandMetadata['subtract-xp'].label}</span>
              </CommandItem>
              <CommandItem value={commandMetadata['trigger-level-up-animation'].value} disabled={!canTriggerLevelUpAnimation} onSelect={commandMetadata['trigger-level-up-animation'].onSelect}>
                <Sparkles className="size-4" /><span>{commandMetadata['trigger-level-up-animation'].label}</span>
              </CommandItem>
              <CommandItem value={commandMetadata['toggle-xp-buff'].value} onSelect={commandMetadata['toggle-xp-buff'].onSelect}>
                <Zap className="size-4" /><span>{commandMetadata['toggle-xp-buff'].label}</span>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
