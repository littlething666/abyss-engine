export type StudyFormulaExplainContext = 'question' | 'answer' | 'option';

export type StudyLlmIntent =
  | {
      kind: 'study-question-explain';
      intent: {
        topicLabel: string;
        questionText: string;
        agentPersonality: string;
      };
    }
  | {
      kind: 'study-formula-explain';
      intent: {
        topicLabel: string;
        cardQuestionText: string;
        latex: string;
        context: StudyFormulaExplainContext;
      };
    };

export type StudyLlmChunk =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string };

export interface StudyLlmClient {
  stream(intent: StudyLlmIntent, signal?: AbortSignal): AsyncIterable<StudyLlmChunk>;
}

let client: StudyLlmClient | null = null;

export function registerStudyLlmClient(nextClient: StudyLlmClient): void {
  client = nextClient;
}

export function getStudyLlmClient(): StudyLlmClient {
  if (!client) {
    throw new Error('Study LLM client is not registered. Call ensureStudyLlmClientRegistered() during app bootstrap.');
  }
  return client;
}

export function resetStudyLlmClientForTests(): void {
  client = null;
}
