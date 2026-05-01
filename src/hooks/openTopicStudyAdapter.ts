/**
 * Mentor `open_topic_study` effect adapter.
 *
 * The mentor feature deliberately does NOT import
 * `@/features/progression` or `@/store/uiStore` — it owns only the
 * effect *type*. This adapter lives at the presentation/composition
 * layer (consumed from `app/page.tsx` via `MentorDialogOverlay`'s
 * `onOpenTopicStudy` prop) and translates the effect into existing
 * progression + UI actions:
 *
 *   1. Mark the requested crystal as the selected topic (UI store).
 *   2. If the topic has cards available, start a fresh study session
 *      against those cards (progression store).
 *   3. Open the study panel modal (UI store).
 *
 * Cards are provided lazily via `getCardsForTopic` so the adapter does
 * not depend on the React-Query layer that owns card fetching. When no
 * cards are available (topic still pre-generation, content cache miss),
 * the adapter still selects the topic + opens the panel; the panel
 * renders an empty / loading state owned by the study panel itself.
 *
 * Generic over the card row type so the adapter is testable in
 * isolation without pulling the deck-content type tree into this file.
 */

export type OpenTopicStudyParams = {
  subjectId: string;
  topicId: string;
};

export type OpenTopicStudyTopicRef = {
  subjectId: string;
  topicId: string;
};

export type OpenTopicStudyAdapterDeps<TCard> = {
  selectTopic: (topic: OpenTopicStudyTopicRef) => void;
  startTopicStudySession: (
    topic: OpenTopicStudyTopicRef,
    cards: ReadonlyArray<TCard>,
  ) => void;
  openStudyPanel: () => void;
  getCardsForTopic: (topic: OpenTopicStudyTopicRef) => ReadonlyArray<TCard>;
};

export function applyOpenTopicStudyEffect<TCard>(
  params: OpenTopicStudyParams,
  deps: OpenTopicStudyAdapterDeps<TCard>,
): void {
  const topic: OpenTopicStudyTopicRef = {
    subjectId: params.subjectId,
    topicId: params.topicId,
  };
  deps.selectTopic(topic);
  const cards = deps.getCardsForTopic(topic);
  if (cards.length > 0) {
    deps.startTopicStudySession(topic, cards);
  }
  deps.openStudyPanel();
}
