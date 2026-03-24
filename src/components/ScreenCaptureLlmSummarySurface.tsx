'use client';

import MathMarkdownRenderer from './MathMarkdownRenderer';
import { ResponsiveLlmInferenceSurface } from './ResponsiveLlmInferenceSurface';

const SCREEN_SUMMARY_DESCRIPTION =
  'Summarizes a screen or window you share using the browser screen capture dialog, streamed from the assistant.';

export type ScreenCaptureLlmSummarySurfaceProps = {
  isDesktop: boolean;
  surfaceOpen: boolean;
  onSurfaceOpenChange: (open: boolean) => void;
  onDismissOutside: () => void;
  isPending: boolean;
  assistantText: string | null;
  errorMessage: string | null;
};

export function ScreenCaptureLlmSummarySurface({
  isDesktop,
  surfaceOpen,
  onSurfaceOpenChange,
  onDismissOutside,
  isPending,
  assistantText,
  errorMessage,
}: ScreenCaptureLlmSummarySurfaceProps) {
  return (
    <ResponsiveLlmInferenceSurface
      open={surfaceOpen}
      onOpenChange={onSurfaceOpenChange}
      isDesktop={isDesktop}
      title="Screen summary"
      description={{ kind: 'srOnly', text: SCREEN_SUMMARY_DESCRIPTION }}
      onDismissOutside={onDismissOutside}
      desktopContentClassName="sm:max-w-lg"
      sheetMaxHeightClassName="data-[side=bottom]:max-h-[75vh]"
      sheetBodyScrollClassName="max-h-[min(50vh,36rem)]"
    >
      <div className="max-h-[min(50vh,36rem)] overflow-y-auto pb-2 text-sm">
        {errorMessage && !isPending && (
          <p className="text-destructive" data-testid="screen-capture-llm-error">
            {errorMessage}
          </p>
        )}
        {isPending && !(assistantText && assistantText.length > 0) && (
          <p className="text-muted-foreground" data-testid="screen-capture-llm-loading">
            Capturing or summarizing…
          </p>
        )}
        {assistantText && assistantText.length > 0 && (
          <div className="min-h-[1em]">
            <MathMarkdownRenderer
              source={assistantText}
              className="text-foreground markdown-body markdown-body--block text-sm"
            />
            {isPending && (
              <span
                className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-foreground/50 align-middle"
                aria-hidden
              />
            )}
          </div>
        )}
      </div>
    </ResponsiveLlmInferenceSurface>
  );
}
