'use client';

import { Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Applied to the icon while audio from this control is playing (see `app/globals.css`). */
export const TTS_ICON_SPEAKING_CLASSNAME = 'tts-icon-speaking';

export type LlmTtsToggleProps = {
  enabled: boolean;
  onToggle: () => void;
  /** When enabled, pulse the icon while speech is actively playing or queued from this surface. */
  speaking?: boolean;
};

/**
 * Small toggle for enabling/disabling read-aloud on an LLM inference surface.
 */
export function LlmTtsToggle({ enabled, onToggle, speaking = false }: LlmTtsToggleProps) {
  const showSpeakingMotion = Boolean(enabled && speaking);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={enabled ? 'Disable read aloud' : 'Enable read aloud'}
      aria-pressed={enabled}
      title={enabled ? 'Read aloud enabled' : 'Enable read aloud'}
      onClick={onToggle}
      className={cn(enabled && 'border-primary/60 bg-primary/10')}
    >
      {enabled ? (
        <span
          className={cn('inline-flex shrink-0', showSpeakingMotion && TTS_ICON_SPEAKING_CLASSNAME)}
          aria-hidden
        >
          <Volume2 className="text-primary" data-icon="inline-start" aria-hidden />
        </span>
      ) : (
        <VolumeX className="text-muted-foreground" data-icon="inline-start" aria-hidden />
      )}
    </Button>
  );
}
