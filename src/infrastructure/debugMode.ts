const DEBUG_QUERY_KEY = 'debug';
const DEBUG_QUERY_VALUE = '1';

const DEFAULT_DEBUG_MODE = false;

let cachedDebugMode: boolean | null = null;
let cachedSearchSignature: string | null = null;

type DebugSearchParamsInput = URLSearchParams | string | null | undefined;

function normalizeSearchParams(searchParams: DebugSearchParamsInput): string {
  if (searchParams === null || searchParams === undefined) {
    return '';
  }
  if (searchParams instanceof URLSearchParams) {
    return searchParams.toString();
  }
  return searchParams;
}

function parseDebugMode(searchParams: string): boolean {
  return new URLSearchParams(searchParams).get(DEBUG_QUERY_KEY) === DEBUG_QUERY_VALUE;
}

export function initializeDebugMode(searchParams: DebugSearchParamsInput): void {
  const normalized = normalizeSearchParams(searchParams);

  if (cachedSearchSignature === normalized) {
    return;
  }
  cachedDebugMode = parseDebugMode(normalized);
  cachedSearchSignature = normalized;
}

export function isDebugModeEnabled(): boolean {
  return cachedDebugMode ?? DEFAULT_DEBUG_MODE;
}

export function resetDebugModeForTests(): void {
  cachedDebugMode = null;
  cachedSearchSignature = null;
}
