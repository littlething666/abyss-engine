import { describe, expect, it } from 'vitest';

import { validateStudyLlmRequest } from './studyLlmValidation';

describe('validateStudyLlmRequest', () => {
  it('accepts compact question explain intent', () => {
    expect(validateStudyLlmRequest({
      kind: 'study-question-explain',
      intent: {
        topicLabel: 'Limits',
        questionText: 'What is a derivative?',
        agentPersonality: 'Concise tutor',
      },
    })).toEqual({
      kind: 'study-question-explain',
      intent: {
        topicLabel: 'Limits',
        questionText: 'What is a derivative?',
        agentPersonality: 'Concise tutor',
      },
    });
  });

  it('accepts compact formula explain intent', () => {
    expect(validateStudyLlmRequest({
      kind: 'study-formula-explain',
      intent: {
        topicLabel: 'Algebra',
        cardQuestionText: 'Solve for x.',
        latex: 'x^2',
        context: 'question',
      },
    })).toEqual({
      kind: 'study-formula-explain',
      intent: {
        topicLabel: 'Algebra',
        cardQuestionText: 'Solve for x.',
        latex: 'x^2',
        context: 'question',
      },
    });
  });

  it('rejects provider request-shape fields anywhere in the body', () => {
    expect(() => validateStudyLlmRequest({
      kind: 'study-question-explain',
      intent: {
        topicLabel: 'Limits',
        questionText: 'What is a derivative?',
        agentPersonality: 'Concise tutor',
        messages: [{ role: 'user', content: 'leak' }],
      },
    })).toThrow("provider/request-shape field 'messages'");

    expect(() => validateStudyLlmRequest({
      kind: 'study-question-explain',
      intent: {
        topicLabel: 'Limits',
        questionText: 'What is a derivative?',
        agentPersonality: 'Concise tutor',
      },
      model: 'browser-model',
    })).toThrow("provider/request-shape field 'model'");
  });

  it('rejects empty required strings and unknown kinds', () => {
    expect(() => validateStudyLlmRequest({
      kind: 'study-question-explain',
      intent: {
        topicLabel: 'Limits',
        questionText: '',
        agentPersonality: 'Concise tutor',
      },
    })).toThrow("requires non-empty string '$.intent.questionText'");

    expect(() => validateStudyLlmRequest({
      kind: 'other',
      intent: {},
    })).toThrow('kind is not supported');
  });
});
