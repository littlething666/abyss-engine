/** Test shim for Cloudflare Workflows terminal error APIs. */
export class NonRetryableError extends Error {
  constructor(message: string, name?: string) {
    super(message);
    this.name = name ?? 'NonRetryableError';
  }
}
