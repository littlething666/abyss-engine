import type { StudyFormulaExplainContext, StudyLlmMessage, StudyLlmRequest } from './studyLlmTypes';
import type { StudyLlmPolicy } from './studyLlmPolicy';

function interpolatePromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => values[key] ?? '');
}

function nonEmpty(value: string, fallback: string): string {
  return value.trim() || fallback;
}

const QUESTION_EXPLAIN_PROMPT = `<system_prompt>
{{personality}}

Instructions:
1. **Intuition**: Provide a mental model or analogy for the question.
2. **Explanation**: Explain the study question clearly for a learner but don't give the answer to the Card question.
3. **Math**: If the question involves math, use plain language or standard notation where helpful.

Output Constraint:
- Provide only the requested information.
- Use bold formatting for the headings.
- Use markdown formatting for the text.
- Be concise and to the point.
</system_prompt>

Topic: {{topic}}

Card question:
{{question}}

Prompt version: {{promptVersion}}
`;

const FORMULA_EXPLAIN_PROMPT = `<system_prompt>
You are a professional tutor.
The learner tapped a formula on a study card.

Instructions:
1. **Pronunciation**: Write a pronunciation of the formula.
2. **Symbols**: Write the symbols and their meanings.
3. **Explanation**: Explain what quantities and relationships it expresses in plain language but don't give the answer to Card question.

Output Constraint:
- Provide only the requested information.
- Use bold style for the headings.
- Use markdown formatting for the text.
- Be concise and to the point.
</system_prompt>

Topic: {{topic}}

Card question (for context):
{{question}}

{{contextLabel}}

LaTeX formula:
{{formula}}

What does this formula mean?

Prompt version: {{promptVersion}}
`;

const FORMULA_CONTEXT_LABELS: Record<StudyFormulaExplainContext, string> = {
  question: 'The formula appears in the card question.',
  answer: 'The formula appears on the revealed answer side of the card.',
  option: 'The formula appears in one of the multiple-choice options.',
};

export function buildStudyLlmMessages(request: StudyLlmRequest, policy: StudyLlmPolicy): StudyLlmMessage[] {
  if (request.kind === 'study-question-explain') {
    return [
      {
        role: 'system',
        content: interpolatePromptTemplate(QUESTION_EXPLAIN_PROMPT, {
          topic: nonEmpty(request.intent.topicLabel, 'Unknown topic'),
          question: nonEmpty(request.intent.questionText, '(empty question)'),
          personality: nonEmpty(request.intent.agentPersonality, 'You are a concise, practical tutor.'),
          promptVersion: policy.promptVersion,
        }),
      },
    ];
  }

  return [
    {
      role: 'system',
      content: interpolatePromptTemplate(FORMULA_EXPLAIN_PROMPT, {
        topic: nonEmpty(request.intent.topicLabel, 'Unknown topic'),
        question: nonEmpty(request.intent.cardQuestionText, '(empty question)'),
        contextLabel: FORMULA_CONTEXT_LABELS[request.intent.context],
        formula: nonEmpty(request.intent.latex, '(empty formula)'),
        promptVersion: policy.promptVersion,
      }),
    },
  ];
}
