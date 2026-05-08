import { nowIso, parseJsonObject, stringifyJson } from '../repositories/d1';
import {
  validateCrystalTrialQuestionsEnvelope,
  validateSubjectGraphEnvelope,
  validateSubjectMetadataEnvelope,
  validateTopicCardEnvelope,
  validateTopicCardRowInvariants,
  validateTopicDetailsEnvelope,
} from './envelopeValidation';
import type {
  CrystalTrialSetContent,
  JsonObject,
  LearningContentManifest,
  LearningContentSubject,
  PutCrystalTrialSetInput,
  PutSubjectGraphInput,
  PutTopicCardsInput,
  PutTopicDetailsInput,
  SubjectGraphContent,
  TopicCardContent,
  TopicDetailsContent,
  UpsertSubjectInput,
} from './types';

interface SubjectRow {
  device_id: string;
  subject_id: string;
  title: string;
  metadata_json: string;
  content_source: LearningContentSubject['contentSource'];
  created_by_run_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SubjectGraphRow {
  device_id: string;
  subject_id: string;
  graph_json: string;
  content_hash: string;
  updated_by_run_id: string;
  updated_at: string;
}

interface TopicContentRow {
  device_id: string;
  subject_id: string;
  topic_id: string;
  details_json: string;
  content_hash: string;
  status: TopicDetailsContent['status'];
  updated_by_run_id: string;
  updated_at: string;
}

interface TopicCardRow {
  device_id: string;
  subject_id: string;
  topic_id: string;
  card_id: string;
  card_json: string;
  difficulty: number;
  source_artifact_kind: string;
  created_by_run_id: string;
  created_at: string;
}

interface CrystalTrialSetRow {
  device_id: string;
  subject_id: string;
  topic_id: string;
  target_level: number;
  card_pool_hash: string;
  questions_json: string;
  content_hash: string;
  created_by_run_id: string;
  created_at: string;
}

export interface ILearningContentRepo {
  getManifest(deviceId: string): Promise<LearningContentManifest>;
  upsertSubject(input: UpsertSubjectInput): Promise<void>;
  getSubjectGraph(deviceId: string, subjectId: string): Promise<SubjectGraphContent | null>;
  putSubjectGraph(input: PutSubjectGraphInput): Promise<void>;
  getTopicDetails(deviceId: string, subjectId: string, topicId: string): Promise<TopicDetailsContent | null>;
  putTopicDetails(input: PutTopicDetailsInput): Promise<void>;
  getTopicCards(deviceId: string, subjectId: string, topicId: string): Promise<TopicCardContent[]>;
  upsertTopicCards(input: PutTopicCardsInput): Promise<void>;
  getCrystalTrialSet(
    deviceId: string,
    subjectId: string,
    topicId: string,
    targetLevel: number,
    cardPoolHash: string,
  ): Promise<CrystalTrialSetContent | null>;
  putCrystalTrialSet(input: PutCrystalTrialSetInput): Promise<void>;
}

function subjectFromRow(row: SubjectRow): LearningContentSubject {
  return {
    deviceId: row.device_id,
    subjectId: row.subject_id,
    title: row.title,
    metadata: validateSubjectMetadataEnvelope(parseJsonObject(row.metadata_json, 'subjects.metadata_json')),
    contentSource: row.content_source,
    createdByRunId: row.created_by_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function subjectGraphFromRow(row: SubjectGraphRow): SubjectGraphContent {
  return {
    deviceId: row.device_id,
    subjectId: row.subject_id,
    graph: validateSubjectGraphEnvelope(parseJsonObject(row.graph_json, 'subject_graphs.graph_json')),
    contentHash: row.content_hash,
    updatedByRunId: row.updated_by_run_id,
    updatedAt: row.updated_at,
  };
}

function topicDetailsFromRow(row: TopicContentRow): TopicDetailsContent {
  return {
    deviceId: row.device_id,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    details: validateTopicDetailsEnvelope(parseJsonObject(row.details_json, 'topic_contents.details_json')),
    contentHash: row.content_hash,
    status: row.status,
    updatedByRunId: row.updated_by_run_id,
    updatedAt: row.updated_at,
  };
}

function topicCardFromRow(row: TopicCardRow): TopicCardContent {
  validateTopicCardRowInvariants(row.difficulty, row.source_artifact_kind);
  return {
    deviceId: row.device_id,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    cardId: row.card_id,
    card: validateTopicCardEnvelope(parseJsonObject(row.card_json, 'topic_cards.card_json'), row.card_id),
    difficulty: row.difficulty,
    sourceArtifactKind: row.source_artifact_kind,
    createdByRunId: row.created_by_run_id,
    createdAt: row.created_at,
  };
}

function crystalTrialSetFromRow(row: CrystalTrialSetRow): CrystalTrialSetContent {
  return {
    deviceId: row.device_id,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    targetLevel: row.target_level,
    cardPoolHash: row.card_pool_hash,
    questions: validateCrystalTrialQuestionsEnvelope(parseJsonObject(row.questions_json, 'crystal_trial_sets.questions_json')),
    contentHash: row.content_hash,
    createdByRunId: row.created_by_run_id,
    createdAt: row.created_at,
  };
}

function requireNonEmptyRows(rows: readonly unknown[], operation: string): void {
  if (rows.length === 0) throw new Error(`${operation} requires at least one row`);
}

export function createLearningContentRepo(db: D1Database): ILearningContentRepo {
  return {
    async getManifest(deviceId) {
      const { results } = await db.prepare(`
        select * from subjects where device_id = ? order by created_at asc
      `).bind(deviceId).all<SubjectRow>();
      return { subjects: (results ?? []).map(subjectFromRow) };
    },

    async upsertSubject(input) {
      const metadata = validateSubjectMetadataEnvelope(input.metadata ?? {});

      const now = nowIso();
      await db.prepare(`
        insert into subjects (
          device_id, subject_id, title, metadata_json, content_source,
          created_by_run_id, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(device_id, subject_id) do update set
          title = excluded.title,
          metadata_json = excluded.metadata_json,
          content_source = excluded.content_source,
          created_by_run_id = excluded.created_by_run_id,
          updated_at = excluded.updated_at
      `).bind(
        input.deviceId,
        input.subjectId,
        input.title,
        stringifyJson(metadata, 'subjects.metadata_json'),
        input.contentSource,
        input.createdByRunId ?? null,
        now,
        now,
      ).run();
    },

    async getSubjectGraph(deviceId, subjectId) {
      const row = await db.prepare(`
        select * from subject_graphs where device_id = ? and subject_id = ?
      `).bind(deviceId, subjectId).first<SubjectGraphRow>();
      return row ? subjectGraphFromRow(row) : null;
    },

    async putSubjectGraph(input) {
      const graph = validateSubjectGraphEnvelope(input.graph);
      const now = nowIso();
      await db.prepare(`
        insert into subject_graphs (
          device_id, subject_id, graph_json, content_hash, updated_by_run_id, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?)
        on conflict(device_id, subject_id) do update set
          graph_json = excluded.graph_json,
          content_hash = excluded.content_hash,
          updated_by_run_id = excluded.updated_by_run_id,
          updated_at = excluded.updated_at
      `).bind(
        input.deviceId,
        input.subjectId,
        stringifyJson(graph, 'subject_graphs.graph_json'),
        input.contentHash,
        input.updatedByRunId,
        now,
        now,
      ).run();
    },

    async getTopicDetails(deviceId, subjectId, topicId) {
      const row = await db.prepare(`
        select * from topic_contents
        where device_id = ? and subject_id = ? and topic_id = ?
      `).bind(deviceId, subjectId, topicId).first<TopicContentRow>();
      return row ? topicDetailsFromRow(row) : null;
    },

    async putTopicDetails(input) {
      const details = validateTopicDetailsEnvelope(input.details);
      const now = nowIso();
      await db.prepare(`
        insert into topic_contents (
          device_id, subject_id, topic_id, details_json, content_hash,
          status, updated_by_run_id, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(device_id, subject_id, topic_id) do update set
          details_json = excluded.details_json,
          content_hash = excluded.content_hash,
          status = excluded.status,
          updated_by_run_id = excluded.updated_by_run_id,
          updated_at = excluded.updated_at
      `).bind(
        input.deviceId,
        input.subjectId,
        input.topicId,
        stringifyJson(details, 'topic_contents.details_json'),
        input.contentHash,
        input.status,
        input.updatedByRunId,
        now,
        now,
      ).run();
    },

    async getTopicCards(deviceId, subjectId, topicId) {
      const { results } = await db.prepare(`
        select * from topic_cards
        where device_id = ? and subject_id = ? and topic_id = ?
        order by created_at asc
      `).bind(deviceId, subjectId, topicId).all<TopicCardRow>();
      return (results ?? []).map(topicCardFromRow);
    },

    async upsertTopicCards(input) {
      requireNonEmptyRows(input.cards, 'upsertTopicCards');
      const cards = input.cards.map((card) => {
        validateTopicCardRowInvariants(card.difficulty, card.sourceArtifactKind);
        return { ...card, card: validateTopicCardEnvelope(card.card, card.cardId) };
      });
      const now = nowIso();
      await db.batch(cards.map((card) => db.prepare(`
        insert into topic_cards (
          device_id, subject_id, topic_id, card_id, card_json, difficulty,
          source_artifact_kind, created_by_run_id, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(device_id, subject_id, topic_id, card_id) do update set
          card_json = excluded.card_json,
          difficulty = excluded.difficulty,
          source_artifact_kind = excluded.source_artifact_kind,
          created_by_run_id = excluded.created_by_run_id
      `).bind(
        input.deviceId,
        input.subjectId,
        input.topicId,
        card.cardId,
        stringifyJson(card.card, 'topic_cards.card_json'),
        card.difficulty,
        card.sourceArtifactKind,
        input.createdByRunId,
        now,
      )));
    },

    async getCrystalTrialSet(deviceId, subjectId, topicId, targetLevel, cardPoolHash) {
      const row = await db.prepare(`
        select * from crystal_trial_sets
        where device_id = ? and subject_id = ? and topic_id = ?
          and target_level = ? and card_pool_hash = ?
      `).bind(deviceId, subjectId, topicId, targetLevel, cardPoolHash).first<CrystalTrialSetRow>();
      return row ? crystalTrialSetFromRow(row) : null;
    },

    async putCrystalTrialSet(input) {
      const questions = validateCrystalTrialQuestionsEnvelope(input.questions);
      const now = nowIso();
      await db.prepare(`
        insert into crystal_trial_sets (
          device_id, subject_id, topic_id, target_level, card_pool_hash,
          questions_json, content_hash, created_by_run_id, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(device_id, subject_id, topic_id, target_level, card_pool_hash) do update set
          questions_json = excluded.questions_json,
          content_hash = excluded.content_hash,
          created_by_run_id = excluded.created_by_run_id
      `).bind(
        input.deviceId,
        input.subjectId,
        input.topicId,
        input.targetLevel,
        input.cardPoolHash,
        stringifyJson(questions, 'crystal_trial_sets.questions_json'),
        input.contentHash,
        input.createdByRunId,
        now,
      ).run();
    },
  };
}
