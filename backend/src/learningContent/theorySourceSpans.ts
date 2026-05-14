import type { JsonObject } from './types';
import { stableLearningContentId } from './deterministicIds';

export type TopicTheorySourceSpanKind = 'core-concept' | 'theory' | 'key-takeaway' | 'syllabus-question';

export interface TopicTheorySourceSpan {
  spanId: string;
  subjectId: string;
  topicId: string;
  kind: TopicTheorySourceSpanKind;
  index: number;
  difficulty?: number;
  text: string;
}

export interface BuildTopicTheorySourceSpansInput {
  subjectId: string;
  topicId: string;
  payload: Record<string, unknown>;
}

export interface SelectRelevantTheorySourceSpansInput {
  spans: readonly TopicTheorySourceSpan[];
  queries: readonly string[];
  maxChars?: number;
}

const DEFAULT_MAX_SELECTED_CHARS = 2800;
const MIN_TOKEN_LENGTH = 3;

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

function splitTheoryParagraphs(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z0-9])/u)
    .map((entry) => entry.trim().replace(/\s+/g, ' '))
    .filter((entry) => entry.length > 0);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter((entry): entry is string => entry !== null);
}

function tokenize(value: string): Set<string> {
  const tokens = value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
  return new Set(tokens);
}

async function buildSpan(
  subjectId: string,
  topicId: string,
  kind: TopicTheorySourceSpanKind,
  index: number,
  text: string,
  difficulty?: number,
): Promise<TopicTheorySourceSpan> {
  return {
    spanId: await stableLearningContentId(
      'theory_span',
      'topic-theory-source-span:v1',
      subjectId,
      topicId,
      kind,
      index,
      difficulty ?? null,
      text,
    ),
    subjectId,
    topicId,
    kind,
    index,
    ...(difficulty === undefined ? {} : { difficulty }),
    text,
  };
}

export async function buildTopicTheorySourceSpans(
  input: BuildTopicTheorySourceSpansInput,
): Promise<TopicTheorySourceSpan[]> {
  const spans: TopicTheorySourceSpan[] = [];
  const add = async (kind: TopicTheorySourceSpanKind, index: number, text: string | null, difficulty?: number) => {
    if (!text) return;
    spans.push(await buildSpan(input.subjectId, input.topicId, kind, index, text, difficulty));
  };

  await add('core-concept', 0, stringValue(input.payload.coreConcept));

  for (const [index, text] of splitTheoryParagraphs(input.payload.theory).entries()) {
    await add('theory', index, text);
  }

  for (const [index, text] of stringArray(input.payload.keyTakeaways).entries()) {
    await add('key-takeaway', index, text);
  }

  const questionsByDifficulty = input.payload.coreQuestionsByDifficulty;
  if (questionsByDifficulty && typeof questionsByDifficulty === 'object' && !Array.isArray(questionsByDifficulty)) {
    for (const [difficultyKey, questions] of Object.entries(questionsByDifficulty)) {
      const difficulty = Number.parseInt(difficultyKey, 10);
      if (!Number.isInteger(difficulty)) continue;
      for (const [index, text] of stringArray(questions).entries()) {
        await add('syllabus-question', index, text, difficulty);
      }
    }
  }

  return spans;
}

function priority(kind: TopicTheorySourceSpanKind): number {
  if (kind === 'core-concept') return 4;
  if (kind === 'key-takeaway') return 3;
  if (kind === 'theory') return 2;
  return 1;
}

export function selectRelevantTheorySourceSpans(
  input: SelectRelevantTheorySourceSpansInput,
): TopicTheorySourceSpan[] {
  const maxChars = input.maxChars ?? DEFAULT_MAX_SELECTED_CHARS;
  const queryTokens = tokenize(input.queries.join(' '));

  const scored = input.spans.map((span, sourceOrder) => {
    const spanTokens = tokenize(span.text);
    let overlap = 0;
    for (const token of queryTokens) {
      if (spanTokens.has(token)) overlap += 1;
    }
    return {
      span,
      sourceOrder,
      score: overlap * 10 + priority(span.kind),
    };
  }).sort((a, b) => b.score - a.score || a.sourceOrder - b.sourceOrder);

  const selected: TopicTheorySourceSpan[] = [];
  const seen = new Set<string>();
  let usedChars = 0;

  for (const { span } of scored) {
    if (seen.has(span.spanId)) continue;
    const nextChars = usedChars + span.text.length;
    if (selected.length > 0 && nextChars > maxChars) continue;
    selected.push(span);
    seen.add(span.spanId);
    usedChars = nextChars;
    if (usedChars >= maxChars) break;
  }

  return selected.sort((a, b) => {
    const kindOrder = priority(b.kind) - priority(a.kind);
    return kindOrder || a.index - b.index;
  });
}

export function formatTheorySourceSpansForPrompt(spans: readonly TopicTheorySourceSpan[]): string {
  return spans.map((span) => {
    const difficulty = span.difficulty === undefined ? '' : ` difficulty ${span.difficulty}`;
    return `[${span.spanId} | ${span.kind}${difficulty}] ${span.text}`;
  }).join('\n');
}

export function topicTheorySourceSpansAsJson(spans: readonly TopicTheorySourceSpan[]): JsonObject[] {
  return spans.map((span) => ({ ...span }));
}
