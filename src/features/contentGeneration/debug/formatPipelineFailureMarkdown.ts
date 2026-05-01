import type { PipelineFailureDebugBundle } from '@/types/pipelineFailureDebug';

function longestConsecutiveBacktickRun(s: string): number {
  let max = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch === '`') {
      cur += 1;
      max = Math.max(max, cur);
    } else {
      cur = 0;
    }
  }
  return max;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

function sectionBodies(bundle: PipelineFailureDebugBundle): string {
  const parts: string[] = [
    bundle.error ?? '',
    bundle.parseError ?? '',
    stableStringify({
      model: bundle.model,
      ...(bundle.requestParams ?? {}),
    }),
    stableStringify(bundle.llmRequestMessages),
    bundle.llmRawResponse,
    bundle.llmReasoningText ?? '',
    stableStringify(bundle.providerMetadata),
    stableStringify(bundle.validationFailures),
    stableStringify(bundle.qualityReport),
    stableStringify(bundle.groundingSummary),
    stableStringify(bundle.groundingSources),
  ];
  return parts.join('\n');
}

function makeFence(lang: string, body: string, fence: string): string {
  const opener = lang ? `${fence}${lang}\n` : `${fence}\n`;
  return `${opener}${body}\n${fence}`;
}

/**
 * Formats a pipeline failure as a single markdown document. Uses one dynamic
 * fence width (longer than any contiguous backtick run in all section bodies)
 * so raw model output cannot terminate fenced regions early.
 */
export function formatPipelineFailureMarkdown(bundle: PipelineFailureDebugBundle): string {
  const bodies = sectionBodies(bundle);
  const innerFenceLen = Math.max(3, longestConsecutiveBacktickRun(bodies) + 1);
  const fence = '`'.repeat(innerFenceLen);

  const errorBody = bundle.error ?? '(none)';
  const parseBody = bundle.parseError ?? '(none)';
  const modelParamsBody = stableStringify({
    model: bundle.model,
    ...(bundle.requestParams ?? {}),
  });
  const messagesBody =
    bundle.llmRequestMessages === null || bundle.llmRequestMessages === undefined
      ? '_(none — pipeline failed before messages were recorded)_'
      : stableStringify(bundle.llmRequestMessages);
  const rawBody = bundle.llmRawResponse.trim() === '' ? '(empty)' : bundle.llmRawResponse;
  const reasoningBody =
    bundle.llmReasoningText && bundle.llmReasoningText.trim() !== ''
      ? bundle.llmReasoningText
      : '(none)';
  const providerBody = stableStringify(bundle.providerMetadata);
  const validationBody = stableStringify(bundle.validationFailures);
  const qualityBody = stableStringify(bundle.qualityReport);
  const groundingSummaryBody = stableStringify(bundle.groundingSummary);
  const groundingSourcesBody = stableStringify(bundle.groundingSources);

  const lines: string[] = [
    '# Abyss Pipeline Failure',
    '',
    '## Summary',
    '',
    `- **Schema Version:** \`${bundle.schemaVersion}\``,
    `- **Pipeline ID:** \`${bundle.pipelineId ?? 'null'}\``,
    `- **Job ID:** \`${bundle.jobId ?? 'null'}\``,
    `- **Job Kind:** \`${bundle.jobKind ?? 'null'}\``,
    `- **Status:** \`${bundle.status}\``,
    `- **Subject:** \`${bundle.subjectId ?? 'null'}\``,
    `- **Topic:** \`${bundle.topicId ?? 'null'}\``,
    `- **Topic Label:** \`${bundle.topicLabel ?? 'null'}\``,
    `- **Stage:** \`${bundle.pipelineStage ?? 'null'}\``,
    `- **Failed Stage:** \`${bundle.failedStage ?? 'null'}\``,
    `- **Retry Of:** \`${bundle.retryOf ?? 'null'}\``,
    `- **Retry Chain Depth:** \`${bundle.retryChainDepth}\``,
    `- **Started At:** \`${bundle.startedAt !== null ? new Date(bundle.startedAt).toISOString() : 'null'}\``,
    `- **Finished At:** \`${bundle.finishedAt !== null ? new Date(bundle.finishedAt).toISOString() : 'null'}\``,
    `- **Duration Ms:** \`${bundle.durationMs ?? 'null'}\``,
    '',
    '## Error',
    '',
    makeFence('txt', errorBody, fence),
    '',
    '## Parse Error',
    '',
    makeFence('txt', parseBody, fence),
    '',
    '## Model & Request Params',
    '',
    makeFence('json', modelParamsBody, fence),
    '',
    '## LLM Request Messages',
    '',
    makeFence('json', messagesBody, fence),
    '',
    '## LLM Raw Response',
    '',
    makeFence('txt', rawBody, fence),
    '',
    '## LLM Reasoning Text',
    '',
    makeFence('txt', reasoningBody, fence),
    '',
    '## Provider Metadata',
    '',
    makeFence('json', providerBody, fence),
    '',
    '## Validation Failures',
    '',
    makeFence('json', validationBody, fence),
    '',
    '## Quality Report',
    '',
    makeFence('json', qualityBody, fence),
    '',
    '## Grounding Summary',
    '',
    makeFence('json', groundingSummaryBody, fence),
    '',
    '## Grounding Sources',
    '',
    makeFence('json', groundingSourcesBody, fence),
    '',
  ];

  return lines.join('\n');
}
