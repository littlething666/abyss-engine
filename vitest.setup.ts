import 'fake-indexeddb/auto';

import { vi } from 'vitest';

// Enables React `act()` in Vitest jsdom (see react.dev/link/wrap-tests-with-act).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** React dev warning when state updates flush outside `act` (common with Radix Presence/FocusScope portals). */
const REACT_ACT_WARNING =
  /An update to .+ inside a test was not wrapped in act\(\.\.\.\)/;
const REACT_ACT_DOC = 'wrap-tests-with-act';

function isBenignReactActConsoleMessage(args: unknown[]): boolean {
  const text = args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : String(a)))
    .join('');
  return REACT_ACT_WARNING.test(text) && text.includes(REACT_ACT_DOC);
}

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (isBenignReactActConsoleMessage(args)) {
    return;
  }
  originalConsoleError(...args);
};

const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (isBenignReactActConsoleMessage(args)) {
    return;
  }
  originalConsoleWarn(...args);
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(callback, 0) as unknown as number;
};

global.cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};

// Mock ResizeObserver / IntersectionObserver as real constructors (`new X(...)`),
// not `vi.fn()` factories — Vitest 4 + Floating UI require constructible globals.
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

class IntersectionObserverMock {
  readonly root: Element | Document | null = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
  constructor(
    _callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}
}

globalThis.IntersectionObserver =
  IntersectionObserverMock as typeof IntersectionObserver;
