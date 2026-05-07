import type { SupabaseClient } from '@supabase/supabase-js';
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
  metadata_json: JsonObject;
  content_source: LearningContentSubject['contentSource'];
  created_by_run_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SubjectGraphRow {
  device_id: string;
  subject_id: string;
  graph_json: JsonObject;
  content_hash: string;
  updated_by_run_id: string;
  updated_at: string;
}

interface TopicContentRow {
  device_id: string;
  subject_id: string;
  topic_id: string;
  details_json: JsonObject;
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
  card_json: JsonObject;
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
  questions_json: JsonObject;
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
    metadata: row.metadata_json,
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
    graph: row.graph_json,
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
    details: row.details_json,
    contentHash: row.content_hash,
    status: row.status,
    updatedByRunId: row.updated_by_run_id,
    updatedAt: row.updated_at,
  };
}

function topicCardFromRow(row: TopicCardRow): TopicCardContent {
  return {
    deviceId: row.device_id,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    cardId: row.card_id,
    card: row.card_json,
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
    questions: row.questions_json,
    contentHash: row.content_hash,
    createdByRunId: row.created_by_run_id,
    createdAt: row.created_at,
  };
}

function requireNonEmptyRows(rows: readonly unknown[], operation: string): void {
  if (rows.length === 0) {
    throw new Error(`${operation} requires at least one row`);
  }
}

export function createLearningContentRepo(db: SupabaseClient): ILearningContentRepo {
  return {
    async getManifest(deviceId) {
      const { data, error } = await db
        .from('subjects')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return { subjects: ((data as SubjectRow[] | null) ?? []).map(subjectFromRow) };
    },

    async upsertSubject(input) {
      const { error } = await db.from('subjects').upsert({
        device_id: input.deviceId,
        subject_id: input.subjectId,
        title: input.title,
        metadata_json: input.metadata ?? {},
        content_source: input.contentSource,
        created_by_run_id: input.createdByRunId ?? null,
      });
      if (error) throw error;
    },

    async getSubjectGraph(deviceId, subjectId) {
      const { data, error } = await db
        .from('subject_graphs')
        .select('*')
        .eq('device_id', deviceId)
        .eq('subject_id', subjectId)
        .maybeSingle();

      if (error) throw error;
      return data ? subjectGraphFromRow(data as SubjectGraphRow) : null;
    },

    async putSubjectGraph(input) {
      const { error } = await db.from('subject_graphs').upsert({
        device_id: input.deviceId,
        subject_id: input.subjectId,
        graph_json: input.graph,
        content_hash: input.contentHash,
        updated_by_run_id: input.updatedByRunId,
      });
      if (error) throw error;
    },

    async getTopicDetails(deviceId, subjectId, topicId) {
      const { data, error } = await db
        .from('topic_contents')
        .select('*')
        .eq('device_id', deviceId)
        .eq('subject_id', subjectId)
        .eq('topic_id', topicId)
        .maybeSingle();

      if (error) throw error;
      return data ? topicDetailsFromRow(data as TopicContentRow) : null;
    },

    async putTopicDetails(input) {
      const { error } = await db.from('topic_contents').upsert({
        device_id: input.deviceId,
        subject_id: input.subjectId,
        topic_id: input.topicId,
        details_json: input.details,
        content_hash: input.contentHash,
        status: input.status,
        updated_by_run_id: input.updatedByRunId,
      });
      if (error) throw error;
    },

    async getTopicCards(deviceId, subjectId, topicId) {
      const { data, error } = await db
        .from('topic_cards')
        .select('*')
        .eq('device_id', deviceId)
        .eq('subject_id', subjectId)
        .eq('topic_id', topicId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return ((data as TopicCardRow[] | null) ?? []).map(topicCardFromRow);
    },

    async upsertTopicCards(input) {
      requireNonEmptyRows(input.cards, 'upsertTopicCards');
      const rows = input.cards.map((card) => ({
        device_id: input.deviceId,
        subject_id: input.subjectId,
        topic_id: input.topicId,
        card_id: card.cardId,
        card_json: card.card,
        difficulty: card.difficulty,
        source_artifact_kind: card.sourceArtifactKind,
        created_by_run_id: input.createdByRunId,
      }));

      const { error } = await db.from('topic_cards').upsert(rows);
      if (error) throw error;
    },

    async getCrystalTrialSet(deviceId, subjectId, topicId, targetLevel, cardPoolHash) {
      const { data, error } = await db
        .from('crystal_trial_sets')
        .select('*')
        .eq('device_id', deviceId)
        .eq('subject_id', subjectId)
        .eq('topic_id', topicId)
        .eq('target_level', targetLevel)
        .eq('card_pool_hash', cardPoolHash)
        .maybeSingle();

      if (error) throw error;
      return data ? crystalTrialSetFromRow(data as CrystalTrialSetRow) : null;
    },

    async putCrystalTrialSet(input) {
      const { error } = await db.from('crystal_trial_sets').upsert({
        device_id: input.deviceId,
        subject_id: input.subjectId,
        topic_id: input.topicId,
        target_level: input.targetLevel,
        card_pool_hash: input.cardPoolHash,
        questions_json: input.questions,
        content_hash: input.contentHash,
        created_by_run_id: input.createdByRunId,
      });
      if (error) throw error;
    },
  };
}
