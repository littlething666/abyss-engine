'use client';

import { useCallback } from 'react';
import { Copy } from 'lucide-react';
import { toast } from '@/infrastructure/toast';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CopyableLlmTextBlockProps = {
  /** Always written to the clipboard. */
  copyText: string;
  /** When set, rendered instead of `copyText` (e.g. stripped markdown). Clipboard still uses `copyText`. */
  displayText?: string;
  /** When `copyText` is empty, show this in the body; clipboard still copies `copyText`. */
  emptyDisplay?: string;
  className?: string;
  preClassName?: string;
  'aria-label'?: string;
  /** Applied to the scrollable `<pre>` (primary content region). */
  'data-testid'?: string;
  copyButtonTestId?: string;
  'aria-busy'?: boolean;
};

export function CopyableLlmTextBlock({
  copyText,
  displayText,
  emptyDisplay,
  className,
  preClassName,
  'aria-label': ariaLabel = 'LLM text',
  'data-testid': dataTestId,
  copyButtonTestId = 'copyable-llm-text-copy',
  'aria-busy': ariaBusy,
}: CopyableLlmTextBlockProps) {
  const isEmptyCopy = copyText.length === 0;
  const visible =
    isEmptyCopy && emptyDisplay !== undefined ? emptyDisplay : (displayText ?? copyText);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(copyText).then(
      () => {
        toast.success('Copied to clipboard');
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Could not copy';
        toast.error(message);
      },
    );
  }, [copyText]);

  return (
    <div className={cn('relative', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute right-1.5 top-1.5 z-10 min-h-10 min-w-10 touch-manipulation sm:right-2 sm:top-2 sm:min-h-9 sm:min-w-9"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        data-testid={copyButtonTestId}
      >
        <Copy className="size-4" aria-hidden />
      </Button>
      <pre
        className={cn(
          'border-border min-h-0 overflow-auto rounded border bg-muted/40 py-2 pr-12 pl-2 text-xs break-words whitespace-pre-wrap',
          preClassName,
        )}
        aria-label={ariaLabel}
        aria-busy={ariaBusy}
        data-testid={dataTestId}
      >
        {visible}
      </pre>
    </div>
  );
}
