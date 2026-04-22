'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import MathMarkdownRenderer from './MathMarkdownRenderer';
import { cn } from '@/lib/utils';

/**
 * Collapsible block that displays model reasoning tokens.
 * Auto-opens when reasoning text arrives; auto-collapses when streaming completes.
 */
export type LlmReasoningBlockProps = {
  reasoningText: string | null;
  isPending: boolean;
};

/**
 * Collapsible block that displays model reasoning tokens.
 * Auto-opens when reasoning text arrives; auto-collapses when streaming completes.
 */
export function LlmReasoningBlock({ reasoningText, isPending }: LlmReasoningBlockProps) {
  const [open, setOpen] = useState(false);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    if (isPending && reasoningText && reasoningText.length > 0) {
      setOpen(true);
      wasStreamingRef.current = true;
    }
  }, [isPending, reasoningText]);

  useEffect(() => {
    if (wasStreamingRef.current && !isPending) {
      setOpen(false);
      wasStreamingRef.current = false;
    }
  }, [isPending]);

  if (!reasoningText || reasoningText.length === 0) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50">
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 transition-transform duration-200',
            open && 'rotate-0',
            !open && '-rotate-90',
          )}
          aria-hidden
        />
        <span className="font-medium">Reasoning</span>
        {isPending && (
          <span
            className="ml-0.5 inline-block h-2 w-0.5 animate-pulse bg-muted-foreground/50 align-middle"
            aria-hidden
          />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-40 overflow-y-auto rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <MathMarkdownRenderer
            source={reasoningText}
            className="markdown-body markdown-body--block text-xs text-muted-foreground"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
