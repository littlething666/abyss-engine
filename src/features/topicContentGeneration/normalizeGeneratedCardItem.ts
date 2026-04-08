/**
 * Maps common LLM field aliases to the canonical Card content shapes expected by
 * {@link validateGeneratedCard}. Does not mutate the original value.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function normalizeGeneratedCardItem(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw;
  }
  const type = raw.type;
  const content = raw.content;
  if (!isRecord(content) || typeof type !== 'string') {
    return raw;
  }

  if (type === 'FLASHCARD') {
    const hasFrontBack = typeof content.front === 'string' && typeof content.back === 'string';
    if (!hasFrontBack && typeof content.question === 'string' && typeof content.answer === 'string') {
      return {
        ...raw,
        content: {
          front: content.question,
          back: content.answer,
        },
      };
    }
  }

  if (type === 'SINGLE_CHOICE') {
    const next: Record<string, unknown> = { ...content };
    if (typeof next.correctAnswer !== 'string' && typeof next.answer === 'string') {
      next.correctAnswer = next.answer;
      delete next.answer;
    }
    if (typeof next.explanation !== 'string') {
      next.explanation = '';
    }
    return { ...raw, content: next };
  }

  if (type === 'MULTI_CHOICE') {
    const next: Record<string, unknown> = { ...content };
    if (!Array.isArray(next.correctAnswers) && Array.isArray(next.answer)) {
      next.correctAnswers = next.answer;
      delete next.answer;
    }
    if (typeof next.explanation !== 'string') {
      next.explanation = '';
    }
    return { ...raw, content: next };
  }

  return raw;
}
