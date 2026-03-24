'use client';

import { useCallback, useMemo, useRef } from 'react';

import { stripMarkdownJsonFenceForDisplay } from '@/lib/llmResponseText';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveLlmInferenceSurface } from './ResponsiveLlmInferenceSurface';

const CURRICULUM_STREAM_DESCRIPTION =
  'Live stream of the assistant response while the curriculum graph JSON is generated.';

export type AscentWeaverCurriculumInferenceSurfaceProps = {
  isDesktop: boolean;
  surfaceOpen: boolean;
  onSurfaceOpenChange: (open: boolean) => void;
  onDismissOutside: () => void;
  isPending: boolean;
  assistantText: string;
  errorMessage: string | null;
};

/**
 * Streams raw assistant output (typically JSON) while AscentWeaver generates a curriculum graph.
 */
export function AscentWeaverCurriculumInferenceSurface({
  isDesktop,
  surfaceOpen,
  onSurfaceOpenChange,
  onDismissOutside,
  isPending,
  assistantText,
  errorMessage,
}: AscentWeaverCurriculumInferenceSurfaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const displayText = useMemo(() => stripMarkdownJsonFenceForDisplay(assistantText), [assistantText]);

  const handleSelectAll = useCallback(() => {
    const el = textareaRef.current;
    if (!el || displayText.length === 0) {
      return;
    }
    el.focus();
    el.select();
  }, [displayText]);

  return (
    <ResponsiveLlmInferenceSurface
      open={surfaceOpen}
      onOpenChange={onSurfaceOpenChange}
      isDesktop={isDesktop}
      title="Curriculum generation"
      description={{ kind: 'srOnly', text: CURRICULUM_STREAM_DESCRIPTION }}
      onDismissOutside={onDismissOutside}
      desktopContentClassName="sm:max-w-2xl"
      sheetMaxHeightClassName="data-[side=bottom]:max-h-[80vh]"
      sheetBodyScrollClassName="max-h-[min(55vh,40rem)]"
    >
      <div className="max-h-[min(55vh,40rem)] overflow-y-auto pb-2 text-sm">
        {errorMessage && !isPending ? (
          <p className="text-destructive" data-testid="ascent-weaver-llm-error">
            {errorMessage}
          </p>
        ) : null}
        {isPending && displayText.length === 0 ? (
          <p className="text-muted-foreground" data-testid="ascent-weaver-llm-loading">
            Generating curriculum…
          </p>
        ) : null}
        {displayText.length > 0 ? (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 touch-manipulation sm:min-h-9"
                disabled={displayText.length === 0}
                onClick={handleSelectAll}
              >
                Select all
              </Button>
              {isPending ? (
                <span className="text-xs text-muted-foreground">Receiving…</span>
              ) : null}
            </div>
            <Textarea
              ref={textareaRef}
              readOnly
              value={displayText}
              aria-busy={isPending}
              aria-label="Generated curriculum output"
              data-testid="ascent-weaver-curriculum-output"
              className="min-h-[12rem] max-h-[min(45vh,28rem)] resize-y overflow-y-auto font-mono text-xs leading-normal"
            />
          </div>
        ) : null}
      </div>
    </ResponsiveLlmInferenceSurface>
  );
}
