'use client';

import { Brain } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type LlmThinkingToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

/**
 * Small toggle button (brain icon) for enabling/disabling model thinking per surface.
 */
export function LlmThinkingToggle({ enabled, onToggle }: LlmThinkingToggleProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      aria-label={enabled ? 'Disable thinking' : 'Enable thinking'}
      aria-pressed={enabled}
      title={enabled ? 'Thinking enabled' : 'Enable thinking'}
      onClick={onToggle}
      className={cn(enabled && 'border-primary/60 bg-primary/10')}
    >
      <Brain
        className={cn('h-3.5 w-3.5', enabled ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden
      />
    </Button>
  );
}
