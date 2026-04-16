'use client';

/**
 * Abyss dialog: extends Radix dialog with optional `lockScroll` when `modal={false}` (body scroll lock +
 * shards for nested portaled surfaces). Keep overlay/content classNames aligned with `./dialog`.
 */

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { RemoveScroll } from 'react-remove-scroll';
import { createSlot } from '@radix-ui/react-slot';
import { useComposedRefs } from '@radix-ui/react-compose-refs';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import {
  DialogOverlay,
  DialogPortal,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/radix-dialog';
import {
  ModalBodyScrollLockProvider,
  useModalBodyScrollLockContext,
} from '@/components/ui/modal-body-scroll-lock';

const OVERLAY_CLASS =
  'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 pointer-events-auto';

const RemoveScrollSlot = createSlot('AbyssDialog.RemoveScroll');

export type AbyssDialogProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  lockScroll?: boolean;
};

export function AbyssDialog({
  lockScroll = false,
  modal,
  open,
  defaultOpen,
  children,
  ...props
}: AbyssDialogProps) {
  const modalResolved = modal !== false;

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (modalResolved && lockScroll) {
      // eslint-disable-next-line no-console -- dev-only guidance
      console.warn('AbyssDialog: lockScroll is ignored when modal is true (default).');
    }
  }, [modalResolved, lockScroll]);

  const dialogOpen = open !== undefined ? Boolean(open) : Boolean(defaultOpen);

  return (
    <ModalBodyScrollLockProvider
      modal={modalResolved}
      lockScroll={lockScroll}
      dialogOpen={dialogOpen}
      barrierSource="dialog"
    >
      <DialogPrimitive.Root data-slot="dialog" modal={modal} open={open} defaultOpen={defaultOpen} {...props}>
        {children}
      </DialogPrimitive.Root>
    </ModalBodyScrollLockProvider>
  );
}

export type AbyssDialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
};

export const AbyssDialogContent = React.forwardRef<HTMLDivElement, AbyssDialogContentProps>(
  function AbyssDialogContent(
    { className, children, showCloseButton = true, ...props },
    forwardedRef,
  ) {
    const lockCtx = useModalBodyScrollLockContext();
    const modalResolved = lockCtx?.modal ?? true;
    const useCustomBodyLock = Boolean(
      lockCtx?.lockScroll && !modalResolved && lockCtx.barrierSource === 'dialog',
    );

    const primaryContentRef = React.useRef<HTMLDivElement | null>(null);
    const composedRefs = useComposedRefs(forwardedRef, primaryContentRef);

    const shards = React.useMemo(() => {
      const extra = lockCtx?.shardRefs ?? [];
      return [primaryContentRef, ...extra];
    }, [lockCtx?.shardRefs, primaryContentRef]);

    const content = (
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-background p-4 text-sm ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className,
        )}
        ref={composedRefs}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    );

    if (useCustomBodyLock) {
      const dialogOpen = lockCtx?.dialogOpen ?? true;
      return (
        <DialogPortal>
          <RemoveScroll as={RemoveScrollSlot} allowPinchZoom shards={shards}>
            <div
              data-slot="dialog-overlay"
              data-state={dialogOpen ? 'open' : 'closed'}
              className={cn(OVERLAY_CLASS)}
              aria-hidden
            />
          </RemoveScroll>
          {content}
        </DialogPortal>
      );
    }

    return (
      <DialogPortal>
        <DialogOverlay />
        {content}
      </DialogPortal>
    );
  },
);

export {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
};
