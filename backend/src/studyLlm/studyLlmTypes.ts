export type StudyFormulaExplainContext = 'question' | 'answer' | 'option';

export type StudyLlmRequest =
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

export type StudyLlmRequestKind = StudyLlmRequest['kind'];

export type StudyLlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type StudyLlmStreamEvent =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done' };
