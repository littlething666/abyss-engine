/**
 * Canonical, source-owned keys for session-scoped generation failure acknowledgement.
 * Downstream UI must not parse labels or errors to infer these identities.
 */

const JOB_PREFIX = 'cg:job:' as const;
const RETRY_ROUTING_PREFIX = 'cg:retry-routing:' as const;

export function failureKeyForJob(jobId: string): string {
  return `${JOB_PREFIX}${jobId}`;
}

export function failureKeyForRetryRoutingInstance(failureInstanceId: string): string {
  return `${RETRY_ROUTING_PREFIX}${failureInstanceId}`;
}
