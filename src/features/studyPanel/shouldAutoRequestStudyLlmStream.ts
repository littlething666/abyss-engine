export type StudyLlmStreamAutoRequestInput = {
  isPending: boolean;
  assistantText: string | null;
  errorMessage: string | null;
};

/** Whether opening a study LLM surface should start (or retry) a stream. */
export function shouldAutoRequestStudyLlmStream({
  isPending,
  assistantText,
  errorMessage,
}: StudyLlmStreamAutoRequestInput): boolean {
  return !isPending && (assistantText === null || errorMessage !== null);
}
