'use client';

import type { ReactNode } from 'react';
import { useRef } from 'react';

import MathMarkdownRenderer from './MathMarkdownRenderer';
import { Button } from './ui/button';
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import {
  AbyssSheet,
  AbyssSheetContent,
  AbyssSheetHeader,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/abyss-sheet';
import { useRegisterModalBodyScrollShard } from '@/components/ui/modal-body-scroll-lock';
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
  /** Optional action element rendered inline after the title (e.g. thinking toggle). */
  headerAction?: ReactNode;
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
  headerAction,
  children,
}: ResponsiveLlmInferenceSurfaceProps) {
  const desktopSurfaceRef = useRef<HTMLDivElement>(null);
  const sheetSurfaceRef = useRef<HTMLDivElement>(null);

  useRegisterModalBodyScrollShard(desktopSurfaceRef, open && isDesktop);
  useRegisterModalBodyScrollShard(sheetSurfaceRef, open && !isDesktop);

  if (isDesktop) {
    return (
      <AbyssDialog open={open} onOpenChange={onOpenChange} modal={false}>
        <AbyssDialogContent
          ref={desktopSurfaceRef}
          data-llm-inference-surface=""
          className={cn(LLM_INFERENCE_SURFACE_Z_CLASS, desktopContentClassName)}
          onPointerDownOutside={onDismissOutside}
          onInteractOutside={onDismissOutside}
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{title}</DialogTitle>
              {headerAction}
            </div>
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
        </AbyssDialogContent>
      </AbyssDialog>
    );
  }

  return (
    <AbyssSheet open={open} onOpenChange={onOpenChange} modal={false}>
      <AbyssSheetContent
        ref={sheetSurfaceRef}
        data-llm-inference-surface=""
        side="bottom"
        sheetOpen={open}
        headerDragToDismiss
        onHeaderDragDismiss={() => onOpenChange(false)}
        className={cn(
          LLM_INFERENCE_SURFACE_Z_CLASS,
          'gap-0 p-0',
          sheetMaxHeightClassName,
        )}
        onPointerDownOutside={onDismissOutside}
        onInteractOutside={onDismissOutside}
      >
        <AbyssSheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <SheetTitle>{title}</SheetTitle>
            {headerAction}
          </div>
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
        </AbyssSheetHeader>
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
      </AbyssSheetContent>
    </AbyssSheet>
  );
}
