'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type StudyMermaidPreviewProps = {
  code: string;
};

let mermaidInitialized = false;

function useMermaidDiagramRender(
  containerRef: React.RefObject<HTMLDivElement | null>,
  code: string,
): string | null {
  const [renderError, setRenderError] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    const trimmed = code.trim();
    if (!el || !trimmed) {
      return;
    }

    let cancelled = false;
    seqRef.current += 1;
    const seq = seqRef.current;

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
          });
          mermaidInitialized = true;
        }
        if (cancelled || seq !== seqRef.current) {
          return;
        }

        const renderId = `study-mmd-${seq}-${Math.random().toString(36).slice(2, 10)}`;
        const { svg, bindFunctions } = await mermaid.render(renderId, trimmed, el);
        if (cancelled || seq !== seqRef.current) {
          return;
        }
        el.innerHTML = svg;
        bindFunctions?.(el);
        setRenderError(null);
      } catch (e) {
        if (cancelled || seq !== seqRef.current) {
          return;
        }
        el.innerHTML = '';
        setRenderError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (el) {
        el.innerHTML = '';
      }
    };
  }, [code]);

  return renderError;
}

function StudyMermaidFullscreenPane({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderError = useMermaidDiagramRender(containerRef, code);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      {renderError && (
        <p className="text-destructive mb-2 text-sm" data-testid="study-mermaid-fullscreen-render-error" role="alert">
          {renderError}
        </p>
      )}
      <div
        ref={containerRef}
        className="flex min-h-[50vh] flex-1 justify-center py-2 [&_svg]:max-h-[min(85vh,100%)] [&_svg]:max-w-full"
        data-testid="study-mermaid-svg-root-fullscreen"
      />
    </div>
  );
}

const FULLSCREEN_OVERLAY_CLASS = 'z-[200] bg-black/40 supports-backdrop-filter:backdrop-blur-xs';
const FULLSCREEN_POPUP_CLASS = cn(
  'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0',
  'fixed top-0 left-0 z-[201] flex h-dvh max-h-dvh w-full max-w-none flex-col gap-3 rounded-none border-0 bg-background p-4 text-sm shadow-lg outline-none duration-100 sm:p-6',
);
const FULLSCREEN_CLOSE_BUTTON_CLASS = 'absolute top-2 right-2 z-[202]';

/**
 * Renders Mermaid source into SVG via dynamic import. Uses strict security level.
 * Tap the preview (or use keyboard) to open a full-screen view.
 */
export function StudyMermaidPreview({ code }: StudyMermaidPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const renderError = useMermaidDiagramRender(containerRef, code);

  return (
    <div className="w-full overflow-x-auto">
      {renderError && (
        <p className="text-destructive mb-2 text-sm" data-testid="study-mermaid-render-error" role="alert">
          {renderError}
        </p>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setFullscreenOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFullscreenOpen(true);
          }
        }}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Enlarge diagram to full screen"
        data-testid="study-mermaid-open-fullscreen"
      >
        <div
          ref={containerRef}
          className="flex justify-center [&_svg]:max-h-[min(50vh,28rem)] [&_svg]:max-w-full"
          data-testid="study-mermaid-svg-root"
        />
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Tap diagram to view full screen
      </p>

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogPortal>
          <DialogOverlay className={FULLSCREEN_OVERLAY_CLASS} />
          <DialogPrimitive.Popup className={FULLSCREEN_POPUP_CLASS}>
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  className={FULLSCREEN_CLOSE_BUTTON_CLASS}
                  size="icon-sm"
                  type="button"
                />
              }
            >
              <XIcon className="size-4" aria-hidden />
              <span className="sr-only">Close full screen diagram</span>
            </DialogPrimitive.Close>
            <DialogHeader className="shrink-0 pr-10 text-left">
              <DialogTitle>Diagram</DialogTitle>
              <DialogDescription className="sr-only">Full screen view of the study diagram</DialogDescription>
            </DialogHeader>
            {fullscreenOpen ? <StudyMermaidFullscreenPane code={code} /> : null}
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
