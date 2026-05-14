import type { PipelineKind } from '../repositories/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  runId?: string;
  deviceId?: string;
  pipelineKind?: PipelineKind;
  workflowName?: string;
  stage?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  child(ctx: LogContext): Logger;
}

export function createLogger(base: LogContext = {}): Logger {
  const emit = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    const payload = {
      ts: new Date().toISOString(),
      level,
      service: 'abyss-durable-orchestrator',
      event,
      ...base,
      ...fields,
    };

    if (level === 'error') console.error(payload);
    else if (level === 'warn') console.warn(payload);
    else console.log(payload);
  };

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    child: (ctx) => createLogger({ ...base, ...ctx }),
  };
}

export function errorFields(err: unknown): { errorName: string | null; errorMessage: string } {
  return {
    errorName: err instanceof Error ? err.name : null,
    errorMessage: err instanceof Error ? err.message : String(err),
  };
}
