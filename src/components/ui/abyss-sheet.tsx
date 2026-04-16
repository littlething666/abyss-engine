'use client';

/**
 * Abyss sheet: same `lockScroll` + shard behavior as `abyss-dialog.tsx`. Keep classNames aligned with `./sheet`.
 * When nested inside `AbyssDialog` (or another sheet that already provided scroll lock context), no inner provider is added.
 */

import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { RemoveScroll } from 'react-remove-scroll';
import { createSlot } from '@radix-ui/react-slot';
import { useComposedRefs } from '@radix-ui/react-compose-refs';
import { animate, useMotionValue } from 'motion/react';

import { cn } from '@/lib/utils';
import {
  isSheetHeaderDragPassthroughTarget,
  shouldDismissSheetDrag,
} from '@/lib/sheetHeaderDragDismiss';
import { Button } from '@/components/ui/button';
import { GripHorizontal, XIcon } from 'lucide-react';
import {
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/radix-sheet';
import {
  ModalBodyScrollLockProvider,
  useModalBodyScrollLockContext,
} from '@/components/ui/modal-body-scroll-lock';

const SHEET_OVERLAY_CLASS =
  'fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0';

/** Exit slide/fade when `data-drag-dismiss-exit` is absent. With drag-dismiss flush, Radix closes with `animate-none` so Presence unmounts without resetting transform. */
const SHEET_CONTENT_BASE =
  'fixed z-50 flex flex-col gap-4 bg-background bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10 data-[drag-dismiss-exit]:data-[state=closed]:animate-none';

const RemoveScrollSlot = createSlot('AbyssSheet.RemoveScroll');

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

export type AbyssSheetProps = React.ComponentProps<typeof SheetPrimitive.Root> & {
  lockScroll?: boolean;
};

export function AbyssSheet({
  lockScroll = false,
  modal,
  open,
  defaultOpen,
  children,
  ...props
}: AbyssSheetProps) {
  const parentLock = useModalBodyScrollLockContext();
  const modalResolved = modal !== false;

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (modalResolved && lockScroll) {
      // eslint-disable-next-line no-console -- dev-only guidance
      console.warn('AbyssSheet: lockScroll is ignored when modal is true (default).');
    }
  }, [modalResolved, lockScroll]);

  const dialogOpen = open !== undefined ? Boolean(open) : Boolean(defaultOpen);

  const root = (
    <SheetPrimitive.Root data-slot="sheet" modal={modal} open={open} defaultOpen={defaultOpen} {...props}>
      {children}
    </SheetPrimitive.Root>
  );

  if (parentLock) {
    return root;
  }

  return (
    <ModalBodyScrollLockProvider
      modal={modalResolved}
      lockScroll={lockScroll}
      dialogOpen={dialogOpen}
      barrierSource="sheet"
    >
      {root}
    </ModalBodyScrollLockProvider>
  );
}

export type AbyssSheetContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & {
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
    const lockCtx = useModalBodyScrollLockContext();
    const modalResolved = lockCtx?.modal ?? true;
    const useCustomBodyLock = Boolean(
      lockCtx?.lockScroll && !modalResolved && lockCtx.barrierSource === 'sheet',
    );

    const primaryContentRef = React.useRef<HTMLDivElement | null>(null);
    const overlayElRef = React.useRef<HTMLDivElement | null>(null);
    const composedRefs = useComposedRefs(forwardedRef, primaryContentRef);

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

    const shards = React.useMemo(() => {
      const extra = lockCtx?.shardRefs ?? [];
      return [primaryContentRef, ...extra];
    }, [lockCtx?.shardRefs, primaryContentRef]);

    const content = (
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          SHEET_CONTENT_BASE,
          headerDragActive && 'will-change-transform',
          headerDragActive && sheetDragSuppressTransition && 'transition-none',
          className,
        )}
        ref={composedRefs}
        {...props}
        {...(dragDismissExit ? { 'data-drag-dismiss-exit': '' } : {})}
      >
        {dragContext ? (
          <SheetHeaderDragDismissContext.Provider value={dragContext}>
            {children}
          </SheetHeaderDragDismissContext.Provider>
        ) : (
          children
        )}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    );

    const overlayRef = React.useCallback((node: HTMLDivElement | null) => {
      overlayElRef.current = node;
    }, []);

    if (useCustomBodyLock) {
      const dialogOpen = lockCtx?.dialogOpen ?? true;
      return (
        <SheetPrimitive.Portal data-slot="sheet-portal">
          <RemoveScroll as={RemoveScrollSlot} allowPinchZoom shards={shards}>
            <div
              ref={headerDragActive ? overlayRef : undefined}
              data-slot="sheet-overlay"
              data-state={dialogOpen ? 'open' : 'closed'}
              className={cn(SHEET_OVERLAY_CLASS)}
              style={{ pointerEvents: 'auto' }}
              aria-hidden
            />
          </RemoveScroll>
          {content}
        </SheetPrimitive.Portal>
      );
    }

    return (
      <SheetPrimitive.Portal data-slot="sheet-portal">
        <SheetPrimitive.Overlay
          ref={headerDragActive ? overlayRef : undefined}
          data-slot="sheet-overlay"
          className={cn(SHEET_OVERLAY_CLASS)}
        />
        {content}
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
