'use client';

/**
 * Abyss sheet: Base UI Dialog with drag-to-dismiss for bottom sheets.
 *
 * Wraps `@base-ui/react/dialog` with an extra drag-to-dismiss gesture on the header grip
 * (bottom sheets only, opt-in via `headerDragToDismiss` + `onHeaderDragDismiss` + controlled `sheetOpen`).
 * Overlay opacity ramps with drag offset, popup follows via inline transform.
 * When the drag exceeds the dismiss threshold, the popup animates off-screen then calls `onHeaderDragDismiss`.
 *
 * Public API kept stable: AbyssSheet, AbyssSheetContent, AbyssSheetHeader plus re-exports for SheetClose,
 * SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger.
 *
 * Sheet sub-components are re-exported from `./sheet` (single source of truth).
 */

import * as React from 'react';
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { animate, useMotionValue } from 'motion/react';

import { cn } from '@/lib/utils';
import {
  isSheetHeaderDragPassthroughTarget,
  shouldDismissSheetDrag,
} from '@/lib/sheetHeaderDragDismiss';
import { Button } from '@/components/ui/button';
import {
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { GripHorizontal, XIcon } from 'lucide-react';

const SHEET_OVERLAY_CLASS =
  'fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs data-[drag-dismiss-exit]:transition-none';

/**
 * Side slide/fade animation uses Base UI's data-starting-style / data-ending-style pattern.
 * When drag-dismiss completes, `data-drag-dismiss-exit` disables the transition so the inline
 * transform set by the drag handlers stays put through unmount (no snap-back and no double-translate).
 */
const SHEET_CONTENT_BASE =
  'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-[drag-dismiss-exit]:transition-none';

type SheetHeaderDragDismissContextValue = {
  gripDragHandlers: {
    onPointerDown: React.PointerEventHandler<HTMLDivElement>;
    onPointerMove: React.PointerEventHandler<HTMLDivElement>;
    onPointerUp: React.PointerEventHandler<HTMLDivElement>;
    onPointerCancel: React.PointerEventHandler<HTMLDivElement>;
  };
  gripInteractionDisabled: boolean;
};

const SheetHeaderDragDismissContext = React.createContext<SheetHeaderDragDismissContextValue | null>(
  null,
);

function overlayOpacityForDrag(dragY: number): number {
  const t = Math.min(1, Math.max(0, dragY / 160));
  return 1 - t * 0.55;
}

function composeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref != null) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    }
  };
}

export type AbyssSheetProps = SheetPrimitive.Root.Props;

export function AbyssSheet({ children, ...props }: AbyssSheetProps) {
  return (
    <SheetPrimitive.Root data-slot="sheet" {...props}>
      {children}
    </SheetPrimitive.Root>
  );
}

export type AbyssSheetContentProps = SheetPrimitive.Popup.Props & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
  /** Bottom sheets only: drag the header grip down to dismiss (use with `AbyssSheetHeader`). */
  headerDragToDismiss?: boolean;
  onHeaderDragDismiss?: () => void;
  /** When using header drag dismiss, pass the same `open` as the sheet root to reset transform when closing. */
  sheetOpen?: boolean;
};

export const AbyssSheetContent = React.forwardRef<HTMLDivElement, AbyssSheetContentProps>(
  function AbyssSheetContent(
    {
      className,
      children,
      side = 'right',
      showCloseButton = true,
      headerDragToDismiss = false,
      onHeaderDragDismiss,
      sheetOpen,
      ...props
    },
    forwardedRef,
  ) {
    const primaryContentRef = React.useRef<HTMLDivElement | null>(null);
    const overlayElRef = React.useRef<HTMLDivElement | null>(null);
    const composedContentRef = React.useMemo(
      () => composeRefs<HTMLDivElement>(forwardedRef, primaryContentRef),
      [forwardedRef],
    );

    const dragY = useMotionValue(0);
    const draggingRef = React.useRef(false);
    const startYRef = React.useRef(0);
    const lastMoveYRef = React.useRef(0);
    const lastMoveTRef = React.useRef(0);
    const dismissRef = React.useRef(onHeaderDragDismiss);
    dismissRef.current = onHeaderDragDismiss;

    const headerDragActive =
      Boolean(headerDragToDismiss && onHeaderDragDismiss && side === 'bottom');

    const [sheetDragSuppressTransition, setSheetDragSuppressTransition] = React.useState(false);
    const [dragDismissExit, setDragDismissExit] = React.useState(false);
    const dragDismissExitRef = React.useRef(false);
    const dragDismissAnimRef = React.useRef<{ stop: () => void } | null>(null);

    React.useEffect(() => {
      if (!headerDragActive) setSheetDragSuppressTransition(false);
    }, [headerDragActive]);

    React.useEffect(() => {
      return () => {
        dragDismissAnimRef.current?.stop();
      };
    }, []);

    React.useEffect(() => {
      if (sheetOpen !== true) return;
      dragDismissExitRef.current = false;
      setDragDismissExit(false);
    }, [sheetOpen]);

    React.useEffect(() => {
      if (process.env.NODE_ENV !== 'production' && headerDragToDismiss && side !== 'bottom') {
        // eslint-disable-next-line no-console -- dev-only guidance
        console.warn('AbyssSheetContent: headerDragToDismiss only applies when side="bottom".');
      }
      if (process.env.NODE_ENV !== 'production' && headerDragToDismiss && !onHeaderDragDismiss) {
        // eslint-disable-next-line no-console -- dev-only guidance
        console.warn('AbyssSheetContent: headerDragToDismiss requires onHeaderDragDismiss.');
      }
    }, [headerDragToDismiss, onHeaderDragDismiss, side]);

    React.useLayoutEffect(() => {
      if (!headerDragActive) return;
      if (sheetOpen === false) {
        dragDismissAnimRef.current?.stop();
        dragDismissAnimRef.current = null;
        setSheetDragSuppressTransition(false);
        const heldDragExit = dragDismissExitRef.current;
        if (!heldDragExit) {
          dragY.set(0);
          const el = primaryContentRef.current;
          if (el) el.style.transform = '';
          const ov = overlayElRef.current;
          if (ov) ov.style.opacity = '';
          dragDismissExitRef.current = false;
          setDragDismissExit(false);
        }
      }
    }, [headerDragActive, sheetOpen, dragY]);

    React.useEffect(() => {
      if (!headerDragActive) return;
      const unsub = dragY.on('change', (v) => {
        const y = Math.max(0, v);
        const el = primaryContentRef.current;
        if (el) {
          el.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : '';
        }
        const ov = overlayElRef.current;
        if (ov) {
          ov.style.opacity = String(overlayOpacityForDrag(y));
        }
      });
      return () => {
        unsub();
      };
    }, [headerDragActive, dragY]);

    const onGripPointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!headerDragActive) return;
        if (dragDismissExitRef.current) return;
        if (e.button !== 0) return;
        if (isSheetHeaderDragPassthroughTarget(e.target)) return;
        draggingRef.current = true;
        setSheetDragSuppressTransition(true);
        startYRef.current = e.clientY;
        lastMoveYRef.current = e.clientY;
        lastMoveTRef.current = performance.now();
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      [headerDragActive],
    );

    const onGripPointerMove = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!headerDragActive || !draggingRef.current) return;
        const dy = e.clientY - startYRef.current;
        dragY.set(Math.max(0, dy));
        lastMoveYRef.current = e.clientY;
        lastMoveTRef.current = performance.now();
      },
      [headerDragActive, dragY],
    );

    const finishGripPointer = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!headerDragActive || !draggingRef.current) return;
        draggingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        const now = performance.now();
        const dt = Math.max(1 / 60, now - lastMoveTRef.current);
        const vy = (e.clientY - lastMoveYRef.current) / dt;
        const dy = dragY.get();
        if (shouldDismissSheetDrag(dy, vy)) {
          dragDismissExitRef.current = true;
          setDragDismissExit(true);
          const el = primaryContentRef.current;
          const viewportH =
            typeof window !== 'undefined'
              ? window.visualViewport?.height ?? window.innerHeight
              : 640;
          const rect = el?.getBoundingClientRect();
          const marginPx = 16;
          const extra =
            rect !== undefined
              ? Math.max(0, viewportH - rect.top + marginPx)
              : viewportH;
          const target = dy + extra;
          dragDismissAnimRef.current?.stop();
          dragDismissAnimRef.current = animate(dragY, target, {
            type: 'tween',
            duration: 0.22,
            ease: 'easeOut',
            onComplete: () => {
              dismissRef.current?.();
            },
          });
        } else {
          setSheetDragSuppressTransition(false);
          void animate(dragY, 0, { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 });
        }
      },
      [headerDragActive, dragY],
    );

    const onGripPointerUp = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        finishGripPointer(e);
      },
      [finishGripPointer],
    );

    const onGripPointerCancel = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        finishGripPointer(e);
      },
      [finishGripPointer],
    );

    const dragContext = React.useMemo<SheetHeaderDragDismissContextValue | null>(() => {
      if (!headerDragActive) return null;
      return {
        gripDragHandlers: {
          onPointerDown: onGripPointerDown,
          onPointerMove: onGripPointerMove,
          onPointerUp: onGripPointerUp,
          onPointerCancel: onGripPointerCancel,
        },
        gripInteractionDisabled: dragDismissExit,
      };
    }, [
      headerDragActive,
      dragDismissExit,
      onGripPointerDown,
      onGripPointerMove,
      onGripPointerUp,
      onGripPointerCancel,
    ]);

    const overlayCallbackRef = React.useCallback((node: HTMLDivElement | null) => {
      overlayElRef.current = node;
    }, []);

    const dragDismissAttrs = dragDismissExit ? { 'data-drag-dismiss-exit': '' } : {};

    return (
      <SheetPrimitive.Portal data-slot="sheet-portal">
        <SheetPrimitive.Backdrop
          ref={headerDragActive ? overlayCallbackRef : undefined}
          data-slot="sheet-overlay"
          className={cn(SHEET_OVERLAY_CLASS)}
          {...dragDismissAttrs}
        />
        <SheetPrimitive.Popup
          data-slot="sheet-content"
          data-side={side}
          className={cn(
            SHEET_CONTENT_BASE,
            headerDragActive && 'will-change-transform',
            headerDragActive && sheetDragSuppressTransition && 'transition-none',
            className,
          )}
          ref={composedContentRef}
          {...props}
          {...dragDismissAttrs}
        >
          {dragContext ? (
            <SheetHeaderDragDismissContext.Provider value={dragContext}>
              {children}
            </SheetHeaderDragDismissContext.Provider>
          ) : (
            children
          )}
          {showCloseButton && (
            <SheetPrimitive.Close
              data-slot="sheet-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute top-3 right-3"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          )}
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    );
  },
);

export function AbyssSheetHeader({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const ctx = React.useContext(SheetHeaderDragDismissContext);
  const gripHandlers = ctx?.gripDragHandlers;
  const gripLocked = ctx?.gripInteractionDisabled ?? false;
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'flex flex-col gap-0.5 p-4',
        gripHandlers && 'touch-none select-none',
        gripLocked && 'pointer-events-none',
        className,
      )}
      aria-label={gripHandlers ? 'Drag down to close' : undefined}
      {...props}
      {...(gripHandlers ?? {})}
    >
      {gripHandlers ? (
        <div
          data-slot="sheet-drag-grip"
          className="-mt-1 mb-0 flex h-3 w-full shrink-0 items-center justify-center pointer-events-none"
          aria-hidden
        >
          <GripHorizontal
            className="pointer-events-none size-3.5 text-muted-foreground/75"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export { SheetClose, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
