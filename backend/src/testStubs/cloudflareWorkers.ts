/**
 * Test shim for Cloudflare Workflow runtime APIs.
 * This module allows backend workflow files to be imported in Vitest
 * without the Cloudflare Workers runtime package being present in Node.
 */

export type WorkflowEvent<T = unknown> = { payload: T };

export class WorkflowStep {
  async do<T>(
    _name: string,
    configOrCallback: unknown,
    maybeCallback?: () => Promise<T> | T,
  ): Promise<T> {
    const callback = (maybeCallback ?? configOrCallback) as () => Promise<T> | T;
    return callback();
  }
}

export class WorkflowEntrypoint<Bindings = Record<string, never>, State = unknown> {
  env: Bindings;
  state: State;

  constructor(context?: { env?: Bindings; state?: State }) {
    this.env = context?.env as Bindings;
    this.state = context?.state as State;
  }

  async run(_event: { payload: unknown }, _step: WorkflowStep): Promise<void> {}
}
