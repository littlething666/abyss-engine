import { isDebugModeEnabled } from '@/infrastructure/debugMode';
import { toast as sonnerToast } from 'sonner';

function logToast(kind: 'toast' | 'success' | 'error', args: readonly unknown[]): void {
  if (!isDebugModeEnabled()) {
    return;
  }

  console.debug(`[Abyss][toast:${kind}]`, ...args);
}

const toast = Object.assign(
  ((...args: Parameters<typeof sonnerToast>) => {
    logToast('toast', args);
    return sonnerToast(...args);
  }) as typeof sonnerToast,
  {
    success: (...args: Parameters<typeof sonnerToast.success>) => {
      logToast('success', args);
      return sonnerToast.success(...args);
    },
    error: (...args: Parameters<typeof sonnerToast.error>) => {
      logToast('error', args);
      return sonnerToast.error(...args);
    },
  },
);

export { toast };
