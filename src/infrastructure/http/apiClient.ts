/**
 * Base HTTP fetch wrapper for the durable generation Worker API.
 *
 * Phase 1 PR-E: Adds `X-Abyss-Device` header to every request and
 * provides typed JSON request/response methods. This client is
 * consumed ONLY by `DurableGenerationRunRepository`; it must never
 * be imported by features, components, or hooks (enforced by
 * `durableGenerationBoundary.test.ts`).
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ApiClientOptions {
  /** Base URL of the Worker (e.g. `https://abyss-worker.example.com`). */
  baseUrl: string;
  /** Per-device identity; never a security boundary (Plan v3 Q2). */
  deviceId: string;
  /** Request timeout in ms. Defaults to 30s. */
  timeoutMs?: number;
}

export interface ApiClient {
  /** Read-only access for SSE wiring and derived URLs. */
  readonly baseUrl: string;
  readonly deviceId: string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown, opts?: { headers?: Record<string, string> }): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
}

class ApiClientImpl implements ApiClient {
  public readonly baseUrl: string;
  public readonly deviceId: string;
  private readonly timeoutMs: number;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.deviceId = opts.deviceId;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'x-abyss-device': this.deviceId,
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...extraHeaders,
      };

      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ac.signal,
      });

      if (!res.ok) {
        let errorBody: unknown;
        try {
          errorBody = await res.json();
        } catch {
          errorBody = null;
        }
        const apiErr: ApiError = Object.assign(
          new Error(`HTTP ${res.status}: ${res.statusText}`),
          {
            status: res.status,
            body: errorBody,
          },
        );
        throw apiErr;
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(`Request to ${url} timed out after ${this.timeoutMs}ms`, 408);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(
    path: string,
    body: unknown,
    opts?: { headers?: Record<string, string> },
  ): Promise<T> {
    return this.request<T>('POST', path, body, opts?.headers);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body ?? null;
  }
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  return new ApiClientImpl(opts);
}
