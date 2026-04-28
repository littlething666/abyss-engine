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
  const mentorTtsMuted = useMentorStore((s) => s.ttsMuted);
  const setMentorTtsMuted = useMentorStore((s) => s.setTtsMuted);

  return (
    <section className={SECTION_SPACING}>
      <Badge variant="outline">⚙️ Preferences</Badge>
      <div className="pt-3 space-y-3">
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Text-to-speech</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Master switch for narration across all AI surfaces.
            </p>
          </div>
          <Switch
            checked={tts.enableTts}
            onCheckedChange={() => tts.toggleTts()}
            aria-label="Enable text-to-speech"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Mentor narration</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Mute the witty mentor&apos;s voice. The global Text-to-speech master switch above must also be on.
            </p>
          </div>
          <Switch
            checked={!mentorTtsMuted}
            onCheckedChange={(v) => setMentorTtsMuted(!v)}
            aria-label="Mentor narration"
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
              Show bundled starter curricula alongside the ones you generate yourself.
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
            <span className="text-sm text-foreground">Attunement ritual</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Expose the Ritual entry point inside the Wisdom Altar.
            </p>
          </div>
          <Switch
            checked={ritualVisible}
            onCheckedChange={setRitualVisible}
            aria-label="Show Ritual button"
          />
        </div>
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Sound effects</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Global master for feedback chimes, coin pickups, and level-up cues.
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

export function GlobalSettingsSheet() {
  const open = useUIStore((s) => s.isGlobalSettingsOpen);
  const close = useUIStore((s) => s.closeGlobalSettings);
  const targetAudience = useStudySettingsStore((s) => s.targetAudience);
  const setTargetAudience = useStudySettingsStore((s) => s.setTargetAudience);
  const agentPersonality = useStudySettingsStore((s) => s.agentPersonality);
  const setAgentPersonality = useStudySettingsStore((s) => s.setAgentPersonality);
  const localModelId = useStudySettingsStore((s) => s.localModelId);
  const setLocalModelId = useStudySettingsStore((s) => s.setLocalModelId);
  const openRouterResponseHealing = useStudySettingsStore((s) => s.openRouterResponseHealing);
  const setOpenRouterResponseHealing = useStudySettingsStore((s) => s.setOpenRouterResponseHealing);
  const [isPruneDialogOpen, setIsPruneDialogOpen] = useState(false);
  const [pruneError, setPruneError] = useState<string | null>(null);
  const [isPruning, setIsPruning] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) close();
  };

  const handlePruneDialogOpen = () => {
    setPruneError(null);
    setIsPruneDialogOpen(true);
  };

  const handlePruneStorage = async () => {
    if (isPruning) return;
    setIsPruning(true);
    setPruneError(null);

    try {
      await pruneStorage();
      setIsPruneDialogOpen(false);
      close();
      window.location.reload();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to prune storage. Please try again or restart the app.';
      setPruneError(message);
      setIsPruning(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className={CONTENT_SHEET_CLASSNAME}>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription className="sr-only">
            Configure LLM provider routing, OpenRouter model configs, and study defaults.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4">
          <PreferencesSection />

          <section className={SECTION_SPACING}>
            <Badge variant="outline">✨ Study defaults</Badge>
            <div className="space-y-2 pt-3">
              <label className="text-sm text-muted-foreground">Target Audience</label>
              <NativeSelect
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.currentTarget.value)}
                aria-label="global-settings-target-audience"
                className="w-full"
              >
                {TARGET_AUDIENCE_OPTIONS.map((o) => (
                  <NativeSelectOption key={o} value={o}>{o}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2 pt-3">
              <label className="text-sm text-muted-foreground">Agent Personality</label>
              <NativeSelect
                value={agentPersonality}
                onChange={(e) => setAgentPersonality(e.currentTarget.value)}
                aria-label="global-settings-agent-personality"
                className="w-full"
              >
                {AGENT_PERSONALITY_OPTIONS.map((o) => (
                  <NativeSelectOption key={o} value={o}>{o}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </section>

          <section className={SECTION_SPACING}>
            <Badge variant="outline">🔀 Provider routing</Badge>
            <div className="pt-3 space-y-1">
              {ALL_SURFACE_IDS.map((surfaceId) => {
                if (surfaceId === 'subjectGenerationTopics') {
                  return (
                    <div key="curriculum-generation" className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground pt-2">
                        Curriculum Generation
                      </p>
                      {CURRICULUM_SURFACE_IDS.map((id) => (
                        <SurfaceBindingRow key={id} surfaceId={id} />
                      ))}
                    </div>
                  );
                }
                if (surfaceId === 'subjectGenerationEdges') {
                  return null;
                }
                return <SurfaceBindingRow key={surfaceId} surfaceId={surfaceId} />;
              })}
            </div>
          </section>

          <section className={SECTION_SPACING}>
            <Badge variant="outline">🌐 OpenRouter model configs</Badge>
            <p className="text-xs text-muted-foreground pt-1 pb-2">
              OpenRouter requests are routed via the Cloudflare Worker proxy; the API key is held server-side.
            </p>
            <div className={`${ROW_CLASSNAME} pb-3`}>
              <div className="min-w-0">
                <span className="text-sm text-foreground">JSON response healing</span>
                <p className="text-xs text-muted-foreground pt-0.5">
                  For topic, subject, and Crystal Trial generation on OpenRouter: request{' '}
                  <span className="font-mono">json_object</span> output and the OpenRouter{' '}
                  <span className="font-mono">response-healing</span> plugin when enabled. Uses non-streaming
                  completions for those jobs.
                </p>
              </div>
              <Switch
                checked={openRouterResponseHealing}
                onCheckedChange={setOpenRouterResponseHealing}
                aria-label="OpenRouter JSON response healing"
              />
            </div>
            <OpenRouterConfigList />
          </section>

          <section className={SECTION_SPACING}>
            <Badge variant="outline">💻 Local provider</Badge>
            <p className="text-xs text-muted-foreground pt-1">
              Local URL is configured via <span className="font-mono">NEXT_PUBLIC_LLM_CHAT_URL</span> (read-only).
            </p>
            <div className="space-y-1 pt-3">
              <label className="text-sm text-muted-foreground">Local model id</label>
              <Input
                value={localModelId}
                onChange={(e) => setLocalModelId(e.currentTarget.value)}
                placeholder="Leave empty to use NEXT_PUBLIC_LLM_MODEL"
                aria-label="global-settings-local-model"
                className="w-full font-mono text-xs"
              />
            </div>
          </section>

          <section className={SECTION_SPACING}>
            <Badge variant="outline">🧹 Storage management</Badge>
            <div className="space-y-1 pt-3">
              <p className="text-xs text-muted-foreground">
                Prune all persisted client-side data in localStorage and IndexedDB.
              </p>
              <div className={ROW_CLASSNAME}>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handlePruneDialogOpen}
                  disabled={isPruning}
                  aria-label="Open prune storage confirmation dialog"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Prune storage
                </Button>
              </div>
            </div>
          </section>
        </div>
      </SheetContent>

      <AlertDialog open={isPruneDialogOpen} onOpenChange={setIsPruneDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prune browser storage?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all localStorage and IndexedDB data for this browser profile.
              You will be signed out of local sessions and all cached study state will be lost.
              Reload is required after pruning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pruneError ? <p className="text-xs text-destructive pt-1">{pruneError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPruning} onClick={() => setIsPruneDialogOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handlePruneStorage}
              disabled={isPruning}
            >
              {isPruning ? 'Pruning...' : 'Confirm prune'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
