'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useUIStore } from '@/store/uiStore';
import { useFeatureFlagsStore } from '@/store/featureFlagsStore';
import {
  AGENT_PERSONALITY_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  useStudySettingsStore,
} from '@/store/studySettingsStore';
import {
  ALL_PROVIDER_IDS,
  ALL_SURFACE_IDS,
  PROVIDER_DISPLAY_LABELS,
  SURFACE_DISPLAY_LABELS,
} from '@/types/llmInference';
import type { InferenceSurfaceId, LlmInferenceProviderId } from '@/types/llmInference';
import { useInferenceTtsToggle } from '@/hooks/useInferenceTtsToggle';
import { useMentorStore } from '@/features/mentor/mentorStore';

const CURRICULUM_SURFACE_IDS = [
  'subjectGenerationTopics',
  'subjectGenerationEdges',
] as const satisfies readonly InferenceSurfaceId[];

const CONTENT_SHEET_CLASSNAME = '!w-full sm:max-w-xl overflow-y-auto';
const SECTION_SPACING = 'pt-5';
const ROW_CLASSNAME = 'flex items-center justify-between gap-2';
const SELECT_CLASSNAME = 'w-44 shrink-0';
const KNOWN_INDEXED_DB_NAMES = ['abyss-deck', 'abyss-content-generation-logs'] as const;

function listIndexedDbNames(): Promise<string[]> {
  if (typeof window === 'undefined' || !window.indexedDB || typeof window.indexedDB.databases !== 'function') {
    return Promise.resolve([...KNOWN_INDEXED_DB_NAMES]);
  }

  return window.indexedDB
    .databases()
    .then((databases) => {
      const names = databases.map((db) => db?.name).filter((name): name is string => typeof name === 'string' && name.length > 0);
      if (names.length === 0) {
        return [...KNOWN_INDEXED_DB_NAMES];
      }
      const unique = new Set(names);
      for (const name of KNOWN_INDEXED_DB_NAMES) {
        unique.add(name);
      }
      return [...unique];
    })
    .catch(() => {
      return [...KNOWN_INDEXED_DB_NAMES];
    });
}

async function deleteIndexedDb(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Failed to delete IndexedDB database: ${name}`));
    };
  });
}

async function pruneStorage(): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage || !window.indexedDB) {
    return;
  }

  window.localStorage.clear();

  const names = await listIndexedDbNames();
  for (const name of names) {
    await deleteIndexedDb(name);
  }
}

function SurfaceBindingRow({ surfaceId }: { surfaceId: InferenceSurfaceId }) {
  const binding = useStudySettingsStore((s) => s.surfaceProviders[surfaceId]);
  const configs = useStudySettingsStore((s) => s.openRouterConfigs);
  const setSurfaceProvider = useStudySettingsStore((s) => s.setSurfaceProvider);
  const setSurfaceConfigId = useStudySettingsStore((s) => s.setSurfaceConfigId);

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSurfaceProvider(surfaceId, event.currentTarget.value as LlmInferenceProviderId);
  };

  const handleConfigChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSurfaceConfigId(surfaceId, event.currentTarget.value);
  };

  return (
    <div className="flex flex-col gap-1.5 py-1.5">
      <div className={ROW_CLASSNAME}>
        <span className="text-sm text-foreground truncate">{SURFACE_DISPLAY_LABELS[surfaceId]}</span>
        <NativeSelect
          value={binding.provider}
          onChange={handleProviderChange}
          aria-label={`Provider for ${SURFACE_DISPLAY_LABELS[surfaceId]}`}
          className={SELECT_CLASSNAME}
        >
          {ALL_PROVIDER_IDS.map((id) => (
            <NativeSelectOption key={id} value={id}>
              {PROVIDER_DISPLAY_LABELS[id]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {binding.provider === 'openrouter' ? (
        <div className={ROW_CLASSNAME}>
          <span className="text-xs text-muted-foreground pl-3">Config</span>
          <NativeSelect
            value={binding.openRouterConfigId ?? ''}
            onChange={handleConfigChange}
            aria-label={`Config for ${SURFACE_DISPLAY_LABELS[surfaceId]}`}
            className={SELECT_CLASSNAME}
          >
            {configs.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      ) : null}
    </div>
  );
}

function OpenRouterConfigList() {
  const configs = useStudySettingsStore((s) => s.openRouterConfigs);
  const addConfig = useStudySettingsStore((s) => s.addOpenRouterConfig);
  const updateConfig = useStudySettingsStore((s) => s.updateOpenRouterConfig);
  const deleteConfig = useStudySettingsStore((s) => s.deleteOpenRouterConfig);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [draftReasoning, setDraftReasoning] = useState(false);
  const [draftStreaming, setDraftStreaming] = useState(true);

  const handleAdd = () => {
    const model = draftModel.trim();
    if (!model) return;
    addConfig({
      label: draftLabel.trim() || model,
      model,
      enableReasoning: draftReasoning,
      enableStreaming: draftStreaming,
    });
    setDraftLabel('');
    setDraftModel('');
    setDraftReasoning(false);
    setDraftStreaming(true);
  };

  return (
    <div className="space-y-2">
      {configs.map((c) => (
        <div key={c.id} className="flex items-center gap-2 border rounded-md p-2">
          <Input
            value={c.label}
            onChange={(e) => updateConfig(c.id, { label: e.currentTarget.value })}
            aria-label={`Label for ${c.model}`}
            className="w-32"
          />
          <Input
            value={c.model}
            onChange={(e) => updateConfig(c.id, { model: e.currentTarget.value })}
            aria-label={`Model id for ${c.label}`}
            className="flex-1 font-mono text-xs"
          />
          <div className="flex items-center gap-1" title="Reasoning">
            <span className="text-xs text-muted-foreground">Reasoning</span>
            <Switch
              checked={c.enableReasoning}
              onCheckedChange={(v) => updateConfig(c.id, { enableReasoning: v })}
              aria-label={`Enable reasoning for ${c.label}`}
            />
          </div>
          <div className="flex items-center gap-1" title="Streaming">
            <span className="text-xs text-muted-foreground">Streaming</span>
            <Switch
              checked={c.enableStreaming}
              onCheckedChange={(v) => updateConfig(c.id, { enableStreaming: v })}
              aria-label={`Enable streaming for ${c.label}`}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => deleteConfig(c.id)}
            aria-label={`Delete ${c.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2 border border-dashed rounded-md p-2">
        <Input
          placeholder="Label"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.currentTarget.value)}
          className="w-32"
          aria-label="New config label"
        />
        <Input
          placeholder="e.g. anthropic/claude-sonnet-4"
          value={draftModel}
          onChange={(e) => setDraftModel(e.currentTarget.value)}
          className="flex-1 font-mono text-xs"
          aria-label="New config model id"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Reasoning</span>
          <Switch
            checked={draftReasoning}
            onCheckedChange={setDraftReasoning}
            aria-label="Enable reasoning for new config"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Streaming</span>
          <Switch
            checked={draftStreaming}
            onCheckedChange={setDraftStreaming}
            aria-label="Enable streaming for new config"
          />
        </div>
        <Button type="button" variant="outline" size="icon-sm" onClick={handleAdd} aria-label="Add config">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function PreferencesSection() {
  const pomodoroVisible = useFeatureFlagsStore((s) => s.pomodoroVisible);
  const pregeneratedCurriculumsVisible = useFeatureFlagsStore((s) => s.pregeneratedCurriculumsVisible);
  const ritualVisible = useFeatureFlagsStore((s) => s.ritualVisible);
  const sfxEnabled = useFeatureFlagsStore((s) => s.sfxEnabled);
  const setPomodoroVisible = useFeatureFlagsStore((s) => s.setPomodoroVisible);
  const setPregeneratedCurriculumsVisible = useFeatureFlagsStore((s) => s.setPregeneratedCurriculumsVisible);
  const setRitualVisible = useFeatureFlagsStore((s) => s.setRitualVisible);
  const setSfxEnabled = useFeatureFlagsStore((s) => s.setSfxEnabled);
  const tts = useInferenceTtsToggle();
  const mentorNarrationEnabled = useMentorStore((s) => s.narrationEnabled);
  const setMentorNarrationEnabled = useMentorStore((s) => s.setNarrationEnabled);
  const showStudyHistoryControls = useStudySettingsStore((s) => s.showStudyHistoryControls);
  const setShowStudyHistoryControls = useStudySettingsStore((s) => s.setShowStudyHistoryControls);

  return (
    <section className={SECTION_SPACING}>
      <Badge variant="outline">⚙️ Preferences</Badge>
      <div className="pt-3 space-y-3">
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Study narrator</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Controls narration for study-panel explain and formula read-aloud lines.
            </p>
          </div>
          <Switch
            checked={tts.enableTts}
            onCheckedChange={() => tts.toggleTts()}
            aria-label="Enable study narrator"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Mentor narration</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Toggle narration for mentor dialog lines. This is independent from the study narrator.
            </p>
          </div>
          <Switch
            checked={mentorNarrationEnabled}
            onCheckedChange={setMentorNarrationEnabled}
            aria-label="Mentor narration"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Show study history controls</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Enables Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z inside the study panel for correcting
              accidental ratings. Off by default to keep the study card minimal.
            </p>
          </div>
          <Switch
            checked={showStudyHistoryControls}
            onCheckedChange={setShowStudyHistoryControls}
            aria-label="Show study history controls"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Pomodoro timer</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Show the focus timer in the scene HUD.
            </p>
          </div>
          <Switch
            checked={pomodoroVisible}
            onCheckedChange={setPomodoroVisible}
            aria-label="Show Pomodoro timer"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Pregenerated curricula</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Show bundled starter curricula on the topic-grid landing.
            </p>
          </div>
          <Switch
            checked={pregeneratedCurriculumsVisible}
            onCheckedChange={setPregeneratedCurriculumsVisible}
            aria-label="Show pregenerated curricula"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Ritual</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Reveal the daily ritual surface in the HUD.
            </p>
          </div>
          <Switch
            checked={ritualVisible}
            onCheckedChange={setRitualVisible}
            aria-label="Show ritual"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Sound effects</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Play interaction-level UI sound effects.
            </p>
          </div>
          <Switch
            checked={sfxEnabled}
            onCheckedChange={setSfxEnabled}
            aria-label="Enable sound effects"
          />
        </div>
      </div>
    </section>
  );
}

function StudyDefaultsSection() {
  const targetAudience = useStudySettingsStore((s) => s.targetAudience);
  const setTargetAudience = useStudySettingsStore((s) => s.setTargetAudience);
  const agentPersonality = useStudySettingsStore((s) => s.agentPersonality);
  const setAgentPersonality = useStudySettingsStore((s) => s.setAgentPersonality);

  return (
    <section className={SECTION_SPACING}>
      <Badge variant="outline">🎓 Study defaults</Badge>
      <div className="pt-3 space-y-3">
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Target audience</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Used by the topic system prompt to calibrate explanations.
            </p>
          </div>
          <NativeSelect
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.currentTarget.value)}
            aria-label="Target audience"
            className={SELECT_CLASSNAME}
          >
            {TARGET_AUDIENCE_OPTIONS.map((opt) => (
              <NativeSelectOption key={opt} value={opt}>
                {opt}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Agent personality</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Voice and pacing of the study panel narrator.
            </p>
          </div>
          <NativeSelect
            value={agentPersonality}
            onChange={(e) => setAgentPersonality(e.currentTarget.value)}
            aria-label="Agent personality"
            className={SELECT_CLASSNAME}
          >
            {AGENT_PERSONALITY_OPTIONS.map((opt) => (
              <NativeSelectOption key={opt} value={opt}>
                {opt}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
    </section>
  );
}

function CurriculumProvidersSection() {
  return (
    <section className={SECTION_SPACING}>
      <Badge variant="outline">🧬 Curriculum providers</Badge>
      <div className="pt-3">
        {CURRICULUM_SURFACE_IDS.map((surfaceId) => (
          <SurfaceBindingRow key={surfaceId} surfaceId={surfaceId} />
        ))}
      </div>
    </section>
  );
}

function StudyProvidersSection() {
  return (
    <section className={SECTION_SPACING}>
      <Badge variant="outline">🧠 Study providers</Badge>
      <div className="pt-3">
        {ALL_SURFACE_IDS.filter((id) => !CURRICULUM_SURFACE_IDS.includes(id as typeof CURRICULUM_SURFACE_IDS[number])).map((surfaceId) => (
          <SurfaceBindingRow key={surfaceId} surfaceId={surfaceId} />
        ))}
      </div>
    </section>
  );
}

function OpenRouterSection() {
  return (
    <section className={SECTION_SPACING}>
      <Badge variant="outline">🔌 OpenRouter configs</Badge>
      <div className="pt-3">
        <OpenRouterConfigList />
      </div>
    </section>
  );
}

function DangerZoneSection({ onPrune }: { onPrune: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className={SECTION_SPACING}>
      <Badge variant="destructive">⚠️ Danger zone</Badge>
      <div className="pt-3 space-y-2">
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          onClick={() => setConfirmOpen(true)}
        >
          Reset all local data
        </Button>
        <p className="text-xs text-muted-foreground">
          Clears localStorage and IndexedDB for this app. The page will reload.
        </p>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes all of your local progress, settings, and generated content stored in this browser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                void pruneStorage().then(() => {
                  if (typeof window !== 'undefined') {
                    window.location.reload();
                  }
                  onPrune();
                });
              }}
            >
              Reset
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function GlobalSettingsSheet() {
  const isOpen = useUIStore((s) => s.globalSettingsOpen);
  const setOpen = useUIStore((s) => s.setGlobalSettingsOpen);

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent side="right" className={CONTENT_SHEET_CLASSNAME}>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Adjust app preferences and study defaults.</SheetDescription>
        </SheetHeader>
        <PreferencesSection />
        <StudyDefaultsSection />
        <CurriculumProvidersSection />
        <StudyProvidersSection />
        <OpenRouterSection />
        <DangerZoneSection onPrune={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export default GlobalSettingsSheet;
