import type { WorkflowStep } from 'cloudflare:workers';
import type { Logger } from '../../observability/logger';
import { errorFields } from '../../observability/logger';

export async function observedStep<T>(
  step: WorkflowStep,
  logger: Logger,
  name: string,
  options: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const spanId = crypto.randomUUID();
  const startedAt = Date.now();
  const stepLogger = logger.child({ spanId, stage: name });

  stepLogger.info('workflow.step.start', { stepName: name });

  try {
    const result = await step.do(name, options as never, fn as never);
    stepLogger.info('workflow.step.success', {
      stepName: name,
      durationMs: Date.now() - startedAt,
    });
    return result as T;
  } catch (err) {
    stepLogger.error('workflow.step.failure', {
      stepName: name,
      durationMs: Date.now() - startedAt,
      ...errorFields(err),
    });
    throw err;
  }
}
