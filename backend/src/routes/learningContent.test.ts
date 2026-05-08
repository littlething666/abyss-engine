import { describe, expect, it } from 'vitest';
import app from '../index';
import { createFakeD1, q } from '../testStubs/fakeD1';
import type { Env } from '../env';

const DEVICE_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_DEVICE_ID = '00000000-0000-0000-0000-000000000002';

function deviceRow(deviceId: string) {
  return { id: deviceId, created_at: '2026-05-07T00:00:00Z', last_seen_at: '2026-05-07T00:00:00Z' };
}

function workflowStub() {
  return { create: async () => ({ id: 'workflow-stub' }) };
}

function envWithDb(db: D1Database): Env {
  return {
    OPENROUTER_API_KEY: 'sk-or-test',
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
          metadata_json: JSON.stringify({ themeId: 'blue' }),
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
          metadata: { themeId: 'blue' },
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
        graph_json: JSON.stringify({ nodes: [{ id: 'limits' }], edges: [] }),
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
      graph: { nodes: [{ id: 'limits' }], edges: [] },
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

  it('returns non-empty Topic cards and treats an empty card set as not found', async () => {
    const { db: foundDb, calls } = createFakeD1([
      q(deviceRow(DEVICE_ID)),
      q([
        {
          device_id: DEVICE_ID,
          subject_id: 'math',
          topic_id: 'limits',
          card_id: 'card-1',
          card_json: JSON.stringify({ id: 'card-1', type: 'FLASHCARD' }),
          difficulty: 2,
          source_artifact_kind: 'topic-study-cards',
          created_by_run_id: 'run-cards',
          created_at: '2026-05-07T00:00:00Z',
        },
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
          card: { id: 'card-1', type: 'FLASHCARD' },
          difficulty: 2,
          sourceArtifactKind: 'topic-study-cards',
          createdByRunId: 'run-cards',
          createdAt: '2026-05-07T00:00:00Z',
        },
      ],
    });
    expect(calls[1].args).toEqual([DEVICE_ID, 'math', 'limits']);

    const { db: missingDb } = createFakeD1([q(deviceRow(DEVICE_ID)), q([], 0)]);
    const missing = await fetchLearningContent('/v1/subjects/math/topics/limits/cards', missingDb);
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

  it('returns 404 for missing Crystal Trial sets', async () => {
    const { db } = createFakeD1([q(deviceRow(DEVICE_ID)), q(null, 0)]);

    const response = await fetchLearningContent('/v1/subjects/math/topics/limits/trials/3?cardPoolHash=pool-1', db);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'not_found' });
  });
});
