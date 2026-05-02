'use client';

import { Brain } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Small toggle button (brain icon) for enabling/disabling model reasoning per surface.
 */
export type LlmReasoningToggleProps = {
  enabled: boolean;
  onToggle: () => void;
  /** When true, the surface model does not support OpenRouter `reasoning`. */
  disabled?: boolean;
};

/**
 * Small toggle button (brain icon) for enabling/disabling model reasoning per surface.
 */
export function LlmReasoningToggle({ enabled, onToggle, disabled = false }: LlmReasoningToggleProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      disabled={disabled}
      aria-label={
        disabled
          ? 'Reasoning not supported for this model'
          : enabled
            ? 'Disable reasoning'
            : 'Enable reasoning'
      }
      aria-pressed={enabled}
      title={
        disabled ? 'Reasoning not supported for this model' : enabled ? 'Reasoning enabled' : 'Enable reasoning'
      }
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={cn(enabled && !disabled && 'border-primary/60 bg-primary/10')}
    >
      <Brain
        className={cn('h-3.5 w-3.5', enabled ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden
      />
    </Button>
  );
}
