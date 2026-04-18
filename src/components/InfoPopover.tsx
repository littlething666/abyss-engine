'use client';

import React from 'react';
import { Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface InfoPopoverProps {
  /** Popover body — rich content (paragraphs, lists, markdown renderers, etc.). */
  children: React.ReactNode;
  /** Accessible label for the trigger button. */
  label?: string;
  /** Additional classes on the trigger button. */
  className?: string;
  /** Additional classes on the popover body. */
  contentClassName?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

const DEFAULT_LABEL = 'Show more info';

/**
 * Compact info-popover trigger: a small icon-button that opens a Popover
 * containing arbitrary instructional content. Use this to collapse lengthy
 * helper copy on mobile-dense surfaces without deleting it.
 *
 * Lives outside `src/components/ui/*` because it is a composition over the
 * existing Popover primitive, not a new primitive itself.
 */
export function InfoPopover({
  children,
  label = DEFAULT_LABEL,
  className,
  contentClassName,
  side = 'bottom',
  align = 'end',
}: InfoPopoverProps) {
  const triggerButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      className={cn('shrink-0', className)}
    >
      <Info className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );

  return (
    <Popover>
      <PopoverTrigger render={triggerButton} />
      <PopoverContent
        side={side}
        align={align}
        className={cn('w-72 text-sm text-muted-foreground', contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export default InfoPopover;
