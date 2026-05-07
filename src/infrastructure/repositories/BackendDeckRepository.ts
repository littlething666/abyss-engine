import type { ApiClient } from '../http/apiClient';
import type { Card, GeometryType, Subject, SubjectGraph, TopicDetails } from '../../types/core';
import type { DeckContentSource, IDeckRepository, Manifest, ManifestOptions } from '../../types/repository';

interface BackendDeckRepositoryDeps {
  http: ApiClient;
}

type BackendSubjectContentSource = DeckContentSource;

interface BackendSubjectRow {
  deviceId: string;
  subjectId: string;
  title: string;
  metadata: Record<string, unknown>;
  contentSource: BackendSubjectContentSource;
  createdByRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendManifestResponse {
  subjects: BackendSubjectRow[];
}

interface BackendGraphResponse {
  graph: Record<string, unknown>;
}

interface BackendTopicDetailsResponse {
  details: Record<string, unknown>;
}

interface BackendTopicCardsResponse {
  cards: BackendTopicCardRow[];
}

interface BackendTopicCardRow {
  cardId: string;
  card: Record<string, unknown>;
}

const USER_OWNED_CONTENT_SOURCES = new Set<BackendSubjectContentSource>(['generated', 'manual']);
const FRONTEND_CONTENT_SOURCES = new Set<BackendSubjectContentSource>(['bundled', 'generated', 'manual']);
const GEOMETRY_TYPES = new Set<GeometryType>(['box', 'cylinder', 'sphere', 'octahedron', 'plane']);

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireOptionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings when present`);
  }
  return value;
}

function requireGeometry(value: unknown, label: string): Subject['geometry'] {
  const record = requireRecord(value, label);
  const gridTile = requireString(record.gridTile, `${label}.gridTile`);
  if (!GEOMETRY_TYPES.has(gridTile as GeometryType)) {
    throw new Error(`${label}.gridTile must be one of ${[...GEOMETRY_TYPES].join(', ')}`);
  }
  return { gridTile: gridTile as GeometryType };
}

function requireSubjectMetadataEnvelope(metadata: Record<string, unknown>, subjectId: string): Subject {
  const subject = requireRecord(
    metadata.subject,
    `Learning Content manifest subject ${subjectId} metadata.subject`,
  );

  return {
    id: subjectId,
    name: '',
    description: requireString(subject.description, `Learning Content manifest subject ${subjectId} metadata.subject.description`),
    color: requireString(subject.color, `Learning Content manifest subject ${subjectId} metadata.subject.color`),
    geometry: requireGeometry(subject.geometry, `Learning Content manifest subject ${subjectId} metadata.subject.geometry`),
    topicIds: requireOptionalStringArray(subject.topicIds, `Learning Content manifest subject ${subjectId} metadata.subject.topicIds`),
    metadata: subject.metadata as Subject['metadata'],
  };
}

function manifestSubjectFromBackend(row: BackendSubjectRow): Subject & { contentSource: DeckContentSource } {
  const subjectId = requireString(row.subjectId, 'Learning Content manifest subject.subjectId');
  const title = requireString(row.title, `Learning Content manifest subject ${subjectId}.title`);
  if (!FRONTEND_CONTENT_SOURCES.has(row.contentSource)) {
    throw new Error(`Learning Content manifest subject ${subjectId} has unsupported contentSource "${row.contentSource}"`);
  }
  const base = requireSubjectMetadataEnvelope(requireRecord(row.metadata, `Learning Content manifest subject ${subjectId}.metadata`), subjectId);
  return {
    ...base,
    id: subjectId,
    name: title,
    contentSource: row.contentSource,
  };
}

function isVisibleSubject(
  row: BackendSubjectRow,
  includePregeneratedCurriculums: boolean,
): boolean {
  if (includePregeneratedCurriculums) return true;
  return USER_OWNED_CONTENT_SOURCES.has(row.contentSource);
}

function requireManifestResponse(value: unknown): BackendManifestResponse {
  const record = requireRecord(value, 'Learning Content manifest response');
  if (!Array.isArray(record.subjects)) {
    throw new Error('Learning Content manifest response.subjects must be an array');
  }
  return {
    subjects: record.subjects.map((subject, index) => {
      const row = requireRecord(subject, `Learning Content manifest response.subjects[${index}]`);
      return {
        deviceId: requireString(row.deviceId, `Learning Content manifest response.subjects[${index}].deviceId`),
        subjectId: requireString(row.subjectId, `Learning Content manifest response.subjects[${index}].subjectId`),
        title: requireString(row.title, `Learning Content manifest response.subjects[${index}].title`),
        metadata: requireRecord(row.metadata, `Learning Content manifest response.subjects[${index}].metadata`),
        contentSource: requireString(row.contentSource, `Learning Content manifest response.subjects[${index}].contentSource`) as BackendSubjectContentSource,
        createdByRunId: row.createdByRunId === null ? null : requireString(row.createdByRunId, `Learning Content manifest response.subjects[${index}].createdByRunId`),
        createdAt: requireString(row.createdAt, `Learning Content manifest response.subjects[${index}].createdAt`),
        updatedAt: requireString(row.updatedAt, `Learning Content manifest response.subjects[${index}].updatedAt`),
      };
    }),
  };
}

function requireGraphResponse(value: unknown): BackendGraphResponse {
  const record = requireRecord(value, 'Learning Content subject graph response');
  return { graph: requireRecord(record.graph, 'Learning Content subject graph response.graph') };
}

function requireDetailsResponse(value: unknown): BackendTopicDetailsResponse {
  const record = requireRecord(value, 'Learning Content topic details response');
  return { details: requireRecord(record.details, 'Learning Content topic details response.details') };
}

function requireCardsResponse(value: unknown): BackendTopicCardsResponse {
  const record = requireRecord(value, 'Learning Content topic cards response');
  if (!Array.isArray(record.cards)) {
    throw new Error('Learning Content topic cards response.cards must be an array');
  }
  return {
    cards: record.cards.map((card, index) => {
      const row = requireRecord(card, `Learning Content topic cards response.cards[${index}]`);
      return {
        cardId: requireString(row.cardId, `Learning Content topic cards response.cards[${index}].cardId`),
        card: requireRecord(row.card, `Learning Content topic cards response.cards[${index}].card`),
      };
    }),
  };
}

function cardFromBackend(row: BackendTopicCardRow): Card {
  const card = row.card as unknown as Card;
  if (card.id !== row.cardId) {
    throw new Error(`Learning Content card row id mismatch: row.cardId "${row.cardId}" does not match card.id "${String(card.id)}"`);
  }
  return card;
}

/**
 * Backend Learning Content Store adapter. All HTTP remains isolated in this
 * infrastructure repository; hooks/features continue to consume IDeckRepository.
 */
export class BackendDeckRepository implements IDeckRepository {
  private readonly http: ApiClient;

  constructor(deps: BackendDeckRepositoryDeps) {
    this.http = deps.http;
  }

  async getManifest(options: ManifestOptions = {}): Promise<Manifest> {
    const includePregeneratedCurriculums = options.includePregeneratedCurriculums ?? false;
    const payload = requireManifestResponse(await this.http.get<unknown>('/v1/library/manifest'));
    return {
      subjects: payload.subjects
        .filter((subject) => isVisibleSubject(subject, includePregeneratedCurriculums))
        .map(manifestSubjectFromBackend),
    };
  }

  async getSubjectGraph(subjectId: string): Promise<SubjectGraph> {
    const payload = requireGraphResponse(
      await this.http.get<unknown>(`/v1/subjects/${pathSegment(subjectId)}/graph`),
    );
    return payload.graph as unknown as SubjectGraph;
  }

  async getTopicDetails(subjectId: string, topicId: string): Promise<TopicDetails> {
    const payload = requireDetailsResponse(
      await this.http.get<unknown>(
        `/v1/subjects/${pathSegment(subjectId)}/topics/${pathSegment(topicId)}/details`,
      ),
    );
    return payload.details as unknown as TopicDetails;
  }

  async getTopicCards(subjectId: string, topicId: string): Promise<Card[]> {
    const payload = requireCardsResponse(
      await this.http.get<unknown>(
        `/v1/subjects/${pathSegment(subjectId)}/topics/${pathSegment(topicId)}/cards`,
      ),
    );
    return payload.cards.map(cardFromBackend);
  }
}
