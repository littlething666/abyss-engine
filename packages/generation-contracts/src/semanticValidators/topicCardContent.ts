import type { TopicCardContentArtifactPayload } from '../schemas';
import { validateCardContentByType } from './cardContentShape';
import type { SemanticValidator } from './types';

/** Semantic validator for one planned study-card content artifact. */
export const validateTopicCardContentArtifact: SemanticValidator<
  TopicCardContentArtifactPayload
> = (payload) => {
  if (payload.card.type === 'CLOZE') {
    return {
      ok: false,
      failureCode: 'validation:semantic-card-content-shape',
      message: 'topic-card-content does not materialize CLOZE cards into the deck read model',
      path: 'card.type',
    };
  }

  const contentErr = validateCardContentByType(payload.card.type, payload.card.content);
  if (contentErr !== null) {
    return {
      ok: false,
      failureCode: 'validation:semantic-card-content-shape',
      message: `card (type ${payload.card.type}) has invalid content: ${contentErr}`,
      path: 'card.content',
    };
  }
  return { ok: true };
};
