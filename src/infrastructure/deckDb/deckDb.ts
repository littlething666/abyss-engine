import Dexie, { type Table } from 'dexie';

import { topicRefKey } from '@/lib/topicRef';
import type { DeckContentSource } from '@/types/repository';
import type { Card, Subject, SubjectGraph, TopicDetails } from '../../types/core';

export type { DeckContentSource } from '@/types/repository';

export function topicCompositeKey(subjectId: string, topicId: string): string {
  return topicRefKey({ subjectId, topicId });
}

/** Manifest row; may include themeId from JSON beyond core Subject fields. */
export type DeckSubjectRow = Subject & { themeId?: string; contentSource: DeckContentSource };

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface TopicRow {
  key: string;
  subjectId: string;
  topicId: string;
  details: TopicDetails;
}

export interface TopicCardsRow {
  key: string;
  subjectId: string;
  topicId: string;
  cards: Card[];
}

export class DeckDatabase extends Dexie {
  meta!: Table<MetaRow, string>;
  subjects!: Table<DeckSubjectRow, string>;
  graphs!: Table<SubjectGraph, string>;
  topics!: Table<TopicRow, string>;
  topicCards!: Table<TopicCardsRow, string>;

  constructor() {
    super('abyss-deck');
    this.version(2).stores({
      meta: 'key',
      subjects: 'id, contentSource',
      graphs: 'subjectId',
      topics: 'key, subjectId, topicId',
      topicCards: 'key, subjectId, topicId',
    });
  }
}

export const deckDb = new DeckDatabase();
