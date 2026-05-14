'use client';

import React, { useState } from 'react';

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
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useUIStore } from '@/store/uiStore';
import { useFeatureFlagsStore } from '@/store/featureFlagsStore';
import {
  AGENT_PERSONALITY_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  useStudySettingsStore,
} from '@/store/studySettingsStore';
import { useInferenceTtsToggle } from '@/hooks/useInferenceTtsToggle';
import { useMentorStore } from '@/features/mentor/mentorStore';

const CONTENT_SHEET_CLASSNAME = '!w-full sm:max-w-xl overflow-y-auto p-4';
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
      <div className="pt-3 flex flex-col gap-3">
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
      <p className="pt-2 text-xs text-muted-foreground">
        Study explanations are generated through the backend Worker; model and provider policy are not configurable in browser settings.
      </p>
      <div className="pt-3 flex flex-col gap-3">
        <div className={ROW_CLASSNAME}>
          <div className="min-w-0">
            <span className="text-sm text-foreground">Target audience</span>
            <p className="text-xs text-muted-foreground pt-0.5">
              Sent as product context for backend-owned study explanation prompts.
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

function DangerZoneSection({ onPrune }: { onPrune: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className={SECTION_SPACING}>
      <Badge variant="destructive">⚠️ Danger zone</Badge>
      <div className="pt-3 flex flex-col gap-2">
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
  const isOpen = useUIStore((s) => s.isGlobalSettingsOpen);
  const openGlobalSettings = useUIStore((s) => s.openGlobalSettings);
  const closeGlobalSettings = useUIStore((s) => s.closeGlobalSettings);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      openGlobalSettings();
    } else {
      closeGlobalSettings();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className={CONTENT_SHEET_CLASSNAME}>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Adjust app preferences and study defaults.</SheetDescription>
        </SheetHeader>
        <PreferencesSection />
        <StudyDefaultsSection />
        <DangerZoneSection onPrune={closeGlobalSettings} />
      </SheetContent>
    </Sheet>
  );
}

export default GlobalSettingsSheet;
