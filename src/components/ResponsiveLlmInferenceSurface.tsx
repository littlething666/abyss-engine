'use client';

import type { ReactNode } from 'react';

import MathMarkdownRenderer from './MathMarkdownRenderer';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { cn } from '@/lib/utils';

export const LLM_INFERENCE_SURFACE_Z_CLASS = 'z-[60]';

/** Use with `closest()` so parent `Dialog` layers ignore portaled inference UI as “outside”. */
export const LLM_INFERENCE_SURFACE_OUTSIDE_GUARD_SELECTOR = '[data-llm-inference-surface]';

export type ResponsiveLlmInferenceDescription =
  | { kind: 'srOnly'; text: string }
  | { kind: 'markdown'; source: string };

export type ResponsiveLlmInferenceSurfaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDesktop: boolean;
  title: string;
  description: ResponsiveLlmInferenceDescription;
  onDismissOutside: () => void;
  desktopContentClassName: string;
  sheetMaxHeightClassName: string;
  sheetBodyScrollClassName: string;
  children: ReactNode;
};

/**
 * Non-modal nested Dialog (desktop) or bottom Sheet (mobile) for LLM output.
 * `modal={false}` avoids nested Radix aria-hidden / focus conflicts with the parent study panel.
 */
export function ResponsiveLlmInferenceSurface({
  open,
  onOpenChange,
  isDesktop,
  title,
  description,
  onDismissOutside,
  desktopContentClassName,
  sheetMaxHeightClassName,
  sheetBodyScrollClassName,
  children,
}: ResponsiveLlmInferenceSurfaceProps) {
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
        <DialogContent
          data-llm-inference-surface=""
          className={cn(LLM_INFERENCE_SURFACE_Z_CLASS, desktopContentClassName)}
          onPointerDownOutside={onDismissOutside}
          onInteractOutside={onDismissOutside}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description.kind === 'srOnly' ? (
              <DialogDescription className="sr-only">{description.text}</DialogDescription>
            ) : (
              <DialogDescription asChild>
                <MathMarkdownRenderer
                  source={description.source}
                  className="text-lg text-muted-foreground markdown-body markdown-body--inline break-all"
                />
              </DialogDescription>
            )}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        data-llm-inference-surface=""
        side="bottom"
        className={cn(
          LLM_INFERENCE_SURFACE_Z_CLASS,
          'gap-0 p-0',
          sheetMaxHeightClassName,
        )}
        onPointerDownOutside={onDismissOutside}
        onInteractOutside={onDismissOutside}
      >
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
          {description.kind === 'srOnly' ? (
            <SheetDescription className="sr-only">{description.text}</SheetDescription>
          ) : (
            <SheetDescription asChild>
              <MathMarkdownRenderer
                source={description.source}
                className="text-lg text-muted-foreground markdown-body markdown-body--inline break-all"
              />
            </SheetDescription>
          )}
        </SheetHeader>
        <div className={cn('no-scrollbar overflow-y-auto px-4', sheetBodyScrollClassName)}>
          {children}
        </div>
        <SheetFooter className="border-t bg-background pt-2">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
