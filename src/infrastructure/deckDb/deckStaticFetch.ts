import type { Card, SubjectGraph, TopicDetails } from '../../types/core';
import type { Manifest } from '../../types/repository';

function deckDataBaseUrl(): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data`;
}

export async function fetchDeckJson<T>(paths: string[]): Promise<T> {
  for (const path of paths) {
    const response = await fetch(path);
    if (response.ok) {
      return response.json() as Promise<T>;
    }
  }

  throw new Error(`Failed to load JSON from paths: ${paths.join(', ')}`);
}

export async function fetchManifest(): Promise<Manifest> {
  return fetchDeckJson<Manifest>([`${deckDataBaseUrl()}/subjects/manifest.json`]);
}

export async function fetchSubjectGraph(subjectId: string): Promise<SubjectGraph> {
  const response = await fetch(`${deckDataBaseUrl()}/subjects/${subjectId}/graph.json`);
  if (!response.ok) {
    throw new Error(`Failed to load graph for subject ${subjectId}`);
  }
  return response.json() as Promise<SubjectGraph>;
}

export async function fetchTopicDetails(subjectId: string, topicId: string): Promise<TopicDetails> {
  return fetchDeckJson<TopicDetails>([
    `${deckDataBaseUrl()}/subjects/${subjectId}/topics/${topicId}.json`,
    `${deckDataBaseUrl()}/subjects/${subjectId}/topics/${topicId}/topic.json`,
  ]);
}

export function parseTopicCardsPayload(payload: unknown): Card[] {
  if (Array.isArray(payload)) {
    return payload as Card[];
  }

  if (typeof payload === 'object' && payload !== null && 'cards' in payload) {
    const maybeCards = (payload as { cards?: unknown }).cards;
    if (Array.isArray(maybeCards)) {
      return maybeCards as Card[];
    }
  }

  return [];
}

export async function fetchTopicCards(subjectId: string, topicId: string): Promise<Card[]> {
  const paths = [
    `${deckDataBaseUrl()}/subjects/${subjectId}/cards/${topicId}.json`,
    `${deckDataBaseUrl()}/subjects/${subjectId}/topics/${topicId}/cards.json`,
  ];
  for (const path of paths) {
    const response = await fetch(path);
    if (response.ok) {
      const payload = (await response.json()) as unknown;
      return parseTopicCardsPayload(payload);
    }
  }
  return [];
}
