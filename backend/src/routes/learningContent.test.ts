import { describe, expect, it } from 'vitest';
import { contentHash } from '../contracts/generationContracts';
import app from '../index';
import { createFakeD1, q } from '../testStubs/fakeD1';
import type { Env } from '../env';

const DEVICE_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_DEVICE_ID = '00000000-0000-0000-0000-000000000002';

const validSubjectMetadata = {
  subject: { description: 'Math fundamentals', color: '#38bdf8', geometry: { gridTile: 'sphere' } },
};

const validSubjectGraph = {
  subjectId: 'math',
  title: 'Mathematics',
  nodes: [{ topicId: 'limits', title: 'Limits', iconName: 'Sigma', tier: 1, prerequisites: [] }],
};

function deviceRow(deviceId: string) {
  return { id: deviceId, created_at: '2026-05-07T00:00:00Z', last_seen_at: '2026-05-07T00:00:00Z' };
}

function workflowStub() {
  return { create: async () => ({ id: 'workflow-stub' }) };
}

function topicCardRow(overrides: Partial<Record<string, unknown>> = {}) {
  const cardId = String(overrides.card_id ?? 'card-1');
  const conceptId = String(overrides.concept_id ?? 'concept-1');
  const cardSpecId = overrides.card_spec_id === undefined ? 'card-spec-1' : overrides.card_spec_id;
  const miniGameSpecId = overrides.mini_game_spec_id === undefined ? null : overrides.mini_game_spec_id;
  const questionSignature = String(overrides.question_signature ?? `qsig-${cardId}`);
  const card = overrides.card_json
    ? undefined
    : {
        id: cardId,
        conceptId,
        ...(typeof cardSpecId === 'string' ? { cardSpecId } : {}),
        ...(typeof miniGameSpecId === 'string' ? { miniGameSpecId } : {}),
        questionSignature,
        type: 'FLASHCARD',
      };
  return {
    device_id: DEVICE_ID,
    subject_id: 'math',
    topic_id: 'limits',
    card_id: cardId,
    concept_id: conceptId,
    card_spec_id: cardSpecId,
    mini_game_spec_id: miniGameSpecId,
    question_signature: questionSignature,
    card_json: card ? JSON.stringify(card) : overrides.card_json,
    difficulty: 2,
    source_artifact_kind: 'topic-study-cards',
    created_by_run_id: 'run-cards',
    created_at: '2026-05-07T00:00:00Z',
    ...overrides,
  };
}

function envWithDb(db: D1Database): Env {
  return {
    LLM_API_KEY: 'sk-or-test',
    ALLOWED_ORIGINS: 'https://abyss.globesoul.com',
    GENERATION_DB: db,
    CRYSTAL_TRIAL_WORKFLOW: workflowStub(),
    TOPIC_EXPANSION_WORKFLOW: workflowStub(),
    SUBJECT_GRAPH_WORKFLOW: workflowStub(),
    TOPIC_CONTENT_WORKFLOW: workflowStub(),
  };
}

async function fetchLearningContent(path: string, db: D1Database, deviceId = DEVICE_ID): Promise<Response> {
  const request = new Request(new URL(path, 'https://fakehost').toString(), {
    headers: { 'x-abyss-device': deviceId },
  });
  return app.fetch(request, envWithDb(db));
}

describe('Learning Content Store routes', () => {
  it('returns a device-scoped library manifest', async () => {
    const { db, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q([
        {
          device_id: DEVICE_ID,
          subject_id: 'math',
          title: 'Mathematics',
          metadata_json: JSON.stringify(validSubjectMetadata),
          content_source: 'generated',
          created_by_run_id: 'run-1',
          created_at: '2026-05-07T00:00:00Z',
          updated_at: '2026-05-07T00:00:00Z',
        },
      ]),
    ]);

    const response = await fetchLearningContent('/v1/library/manifest', db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subjects: [
        {
          deviceId: DEVICE_ID,
          subjectId: 'math',
          title: 'Mathematics',
          metadata: validSubjectMetadata,
          contentSource: 'generated',
          createdByRunId: 'run-1',
          createdAt: '2026-05-07T00:00:00Z',
          updatedAt: '2026-05-07T00:00:00Z',
        },
      ],
    });
    expect(calls[1].args).toEqual([DEVICE_ID]);
  });

  it('returns a Subject Graph and scopes lookup by request device', async () => {
    const { db, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        graph_json: JSON.stringify(validSubjectGraph),
        content_hash: 'cnt_graph',
        updated_by_run_id: 'run-graph',
        updated_at: '2026-05-07T00:00:00Z',
      }),
    ]);

    const response = await fetchLearningContent('/v1/subjects/math/graph', db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deviceId: DEVICE_ID,
      subjectId: 'math',
      graph: validSubjectGraph,
      contentHash: 'cnt_graph',
    });
    expect(calls[1].args).toEqual([DEVICE_ID, 'math']);
  });

  it('returns 404 for Subject Graph rows outside the request device scope', async () => {
    const { db, calls } = createFakeD1([
      q(deviceRow(OTHER_DEVICE_ID)),
      q(null, 0),
    ]);

    const response = await fetchLearningContent('/v1/subjects/math/graph', db, OTHER_DEVICE_ID);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'not_found' });
    expect(calls[1].args).toEqual([OTHER_DEVICE_ID, 'math']);
  });

  it('returns Topic Content details from the backend read model', async () => {
    const { db, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        topic_id: 'limits',
        details_json: JSON.stringify({ coreConcept: 'Limits describe approach.' }),
        content_hash: 'cnt_details',
        status: 'ready',
        updated_by_run_id: 'run-topic',
        updated_at: '2026-05-07T00:00:00Z',
      }),
    ]);

    const response = await fetchLearningContent('/v1/subjects/math/topics/limits/details', db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deviceId: DEVICE_ID,
      subjectId: 'math',
      topicId: 'limits',
      details: { coreConcept: 'Limits describe approach.' },
      status: 'ready',
    });
    expect(calls[1].args).toEqual([DEVICE_ID, 'math', 'limits']);
  });

  it('returns 404 for missing Topic Content details', async () => {
    const { db } = createFakeD1([q(deviceRow(DEVICE_ID)), q(null, 0)]);

    const response = await fetchLearningContent('/v1/subjects/math/topics/limits/details', db);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'not_found' });
  });

  it('returns device-scoped Topic Content statuses for a published subject', async () => {
    const { db, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        graph_json: JSON.stringify(validSubjectGraph),
        content_hash: 'cnt_graph',
        updated_by_run_id: 'run-graph',
        updated_at: '2026-05-07T00:00:00Z',
      }),
      q([
        { subject_id: 'math', topic_id: 'derivatives', status: 'ready', updated_at: '2026-05-07T00:00:02Z' },
        { subject_id: 'math', topic_id: 'limits', status: 'unavailable', updated_at: '2026-05-07T00:00:01Z' },
      ]),
    ]);

    const response = await fetchLearningContent('/v1/subjects/math/topics/statuses', db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      topics: [
        { subjectId: 'math', topicId: 'derivatives', status: 'ready', updatedAt: '2026-05-07T00:00:02Z' },
        { subjectId: 'math', topicId: 'limits', status: 'unavailable', updatedAt: '2026-05-07T00:00:01Z' },
      ],
    });
    expect(calls[1].args).toEqual([DEVICE_ID, 'math']);
    expect(calls[2].args).toEqual([DEVICE_ID, 'math']);
  });

  it('returns 404 for Topic Content statuses when the Subject Graph is missing', async () => {
    const { db } = createFakeD1([q(deviceRow(DEVICE_ID)), q(null, 0)]);

    const response = await fetchLearningContent('/v1/subjects/math/topics/statuses', db);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'not_found' });
  });

  it('returns Topic cards and treats an empty card set for a known topic as an empty collection', async () => {
    const { db: foundDb, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        topic_id: 'limits',
        details_json: JSON.stringify({ coreConcept: 'Limits describe approach.' }),
        content_hash: 'cnt_details',
        status: 'ready',
        updated_by_run_id: 'run-topic',
        updated_at: '2026-05-07T00:00:00Z',
      }),
      q([
        topicCardRow(),
      ]),
    ]);

    const found = await fetchLearningContent('/v1/subjects/math/topics/limits/cards', foundDb);

    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual({
      cards: [
        {
          deviceId: DEVICE_ID,
          subjectId: 'math',
          topicId: 'limits',
          cardId: 'card-1',
          conceptId: 'concept-1',
          cardSpecId: 'card-spec-1',
          miniGameSpecId: null,
          questionSignature: 'qsig-card-1',
          card: { id: 'card-1', conceptId: 'concept-1', cardSpecId: 'card-spec-1', questionSignature: 'qsig-card-1', type: 'FLASHCARD' },
          difficulty: 2,
          sourceArtifactKind: 'topic-study-cards',
          createdByRunId: 'run-cards',
          createdAt: '2026-05-07T00:00:00Z',
        },
      ],
    });
    expect(calls[1].args).toEqual([DEVICE_ID, 'math', 'limits']);
    expect(calls[2].args).toEqual([DEVICE_ID, 'math', 'limits']);

    const { db: emptyDb } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        topic_id: 'limits',
        details_json: JSON.stringify({ coreConcept: 'Limits describe approach.' }),
        content_hash: 'cnt_details',
        status: 'unavailable',
        updated_by_run_id: 'run-topic',
        updated_at: '2026-05-07T00:00:00Z',
      }),
      q([], 0),
    ]);
    const empty = await fetchLearningContent('/v1/subjects/math/topics/limits/cards', emptyDb);
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toEqual({ cards: [] });

    const { db: missingDb } = createFakeD1([q(deviceRow(DEVICE_ID)), q(null, 0)]);
    const missing = await fetchLearningContent('/v1/subjects/math/topics/unknown/cards', missingDb);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: 'not_found' });
  });

  it('returns Crystal Trial sets by target level and card pool hash', async () => {
    const { db, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        topic_id: 'limits',
        target_level: 3,
        card_pool_hash: 'pool-1',
        questions_json: JSON.stringify({ questions: [{ id: 'q1' }] }),
        content_hash: 'cnt_trial',
        created_by_run_id: 'run-trial',
        created_at: '2026-05-07T00:00:00Z',
      }),
    ]);

    const response = await fetchLearningContent('/v1/subjects/math/topics/limits/trials/3?cardPoolHash=pool-1', db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deviceId: DEVICE_ID,
      subjectId: 'math',
      topicId: 'limits',
      targetLevel: 3,
      cardPoolHash: 'pool-1',
      questions: { questions: [{ id: 'q1' }] },
    });
    expect(calls[1].args).toEqual([DEVICE_ID, 'math', 'limits', 3, 'pool-1']);
  });

  it('returns the current Crystal Trial set using the backend-resolved card-pool hash', async () => {
    const currentPoolHash = await contentHash({ cardIds: ['card-a', 'card-b'] });
    const stalePoolHash = await contentHash({ cardIds: ['old-card'] });
    const { db, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q([
        topicCardRow({ card_id: 'card-b', card_spec_id: 'card-spec-b', question_signature: 'qsig-card-b', difficulty: 3, source_artifact_kind: 'topic-expansion-cards' }),
        topicCardRow({ card_id: 'card-a', card_spec_id: 'card-spec-a', question_signature: 'qsig-card-a', difficulty: 3, source_artifact_kind: 'topic-expansion-cards' }),
      ]),
      q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        topic_id: 'limits',
        target_level: 3,
        card_pool_hash: currentPoolHash,
        questions_json: JSON.stringify({ questions: [{ id: 'q-current' }] }),
        content_hash: 'cnt_current_trial',
        created_by_run_id: 'run-current-trial',
        created_at: '2026-05-07T00:00:00Z',
      }),
    ]);

    const response = await fetchLearningContent(`/v1/subjects/math/topics/limits/trials/3/current?ignored=${stalePoolHash}`, db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      targetLevel: 3,
      cardPoolHash: currentPoolHash,
      questions: { questions: [{ id: 'q-current' }] },
    });
    expect(calls[1].args).toEqual([DEVICE_ID, 'math', 'limits']);
    expect(calls[2].args).toEqual([DEVICE_ID, 'math', 'limits', 3, currentPoolHash]);
  });

  it('rejects malformed Crystal Trial route inputs before read-model lookup', async () => {
    const { db: missingHashDb } = createFakeD1([q(deviceRow(DEVICE_ID))]);
    const missingHash = await fetchLearningContent('/v1/subjects/math/topics/limits/trials/3', missingHashDb);
    expect(missingHash.status).toBe(400);
    await expect(missingHash.json()).resolves.toMatchObject({
      code: 'parse:invalid-route-input',
      message: expect.stringContaining('cardPoolHash'),
    });

    const { db: badLevelDb } = createFakeD1([q(deviceRow(DEVICE_ID))]);
    const badLevel = await fetchLearningContent('/v1/subjects/math/topics/limits/trials/not-a-level?cardPoolHash=pool-1', badLevelDb);
    expect(badLevel.status).toBe(400);
    await expect(badLevel.json()).resolves.toMatchObject({
      code: 'parse:invalid-route-input',
      message: expect.stringContaining('targetLevel'),
    });
  });

  it.each([
    {
      name: 'GET /v1/library/manifest',
      path: '/v1/library/manifest',
      row: q([{
        device_id: DEVICE_ID,
        subject_id: 'math',
        title: 'Mathematics',
        metadata_json: JSON.stringify({ themeId: 'blue' }),
        content_source: 'generated',
        created_by_run_id: 'run-1',
        created_at: '2026-05-07T00:00:00Z',
        updated_at: '2026-05-07T00:00:00Z',
      }]),
    },
    {
      name: 'GET /v1/subjects/:subjectId/graph',
      path: '/v1/subjects/math/graph',
      row: q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        graph_json: JSON.stringify({ nodes: [{ id: 'limits' }] }),
        content_hash: 'cnt_graph',
        updated_by_run_id: 'run-graph',
        updated_at: '2026-05-07T00:00:00Z',
      }),
    },
    {
      name: 'GET /v1/subjects/:subjectId/topics/:topicId/details',
      path: '/v1/subjects/math/topics/limits/details',
      row: q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        topic_id: 'limits',
        details_json: JSON.stringify({ topicId: '' }),
        content_hash: 'cnt_details',
        status: 'ready',
        updated_by_run_id: 'run-topic',
        updated_at: '2026-05-07T00:00:00Z',
      }),
    },
    {
      name: 'GET /v1/subjects/:subjectId/topics/:topicId/cards',
      path: '/v1/subjects/math/topics/limits/cards',
      row: [
        q({
          device_id: DEVICE_ID,
          subject_id: 'math',
          topic_id: 'limits',
          details_json: JSON.stringify({ coreConcept: 'Limits describe approach.' }),
          content_hash: 'cnt_details',
          status: 'ready',
          updated_by_run_id: 'run-topic',
          updated_at: '2026-05-07T00:00:00Z',
        }),
        q([topicCardRow({ card_json: JSON.stringify({ id: 'other-card', conceptId: 'concept-1', cardSpecId: 'card-spec-1', questionSignature: 'qsig-card-1' }) })]),
      ],
    },
    {
      name: 'GET /v1/subjects/:subjectId/topics/:topicId/trials/:targetLevel',
      path: '/v1/subjects/math/topics/limits/trials/3?cardPoolHash=pool-1',
      row: q({
        device_id: DEVICE_ID,
        subject_id: 'math',
        topic_id: 'limits',
        target_level: 3,
        card_pool_hash: 'pool-1',
        questions_json: JSON.stringify({ items: [] }),
        content_hash: 'cnt_trial',
        created_by_run_id: 'run-trial',
        created_at: '2026-05-07T00:00:00Z',
      }),
    },
  ])('fails loudly with structured validation code for corrupted persisted rows: $name', async ({ path, row }) => {
    const rows = Array.isArray(row) ? row : [row];
    const { db } = createFakeD1([q(deviceRow(DEVICE_ID)), ...rows]);

    const response = await fetchLearningContent(path, db);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: 'validation:lcs-envelope' });
  });

  it('returns 404 for missing Crystal Trial sets', async () => {
    const { db } = createFakeD1([q(deviceRow(DEVICE_ID)), q(null, 0)]);

    const response = await fetchLearningContent('/v1/subjects/math/topics/limits/trials/3?cardPoolHash=pool-1', db);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'not_found' });
  });
});
