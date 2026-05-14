import type { StudyLlmStreamEvent } from './studyLlmTypes';

const encoder = new TextEncoder();

export function encodeStudyLlmSseEvent(event: StudyLlmStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}
