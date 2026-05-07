/**
 * Learning Content Store routes.
 *
 * These endpoints expose D1-backed, device-scoped generated learning content.
 * The repository owns JSON parsing/stringification; routes only translate missing
 * read-model rows into explicit HTTP errors.
 */

import { Hono } from 'hono';
import type { Env } from '../env';
import { makeRepos } from '../repositories';

const learningContent = new Hono<{ Bindings: Env; Variables: { deviceId: string; idempotencyKey?: string } }>();

function notFound(message: string) {
  return { error: 'not_found', message };
}

function parseTargetLevel(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

learningContent.get('/library/manifest', async (c) => {
  const repos = makeRepos(c.env);
  const manifest = await repos.learningContent.getManifest(c.get('deviceId'));
  return c.json(manifest);
});

learningContent.get('/subjects/:subjectId/graph', async (c) => {
  const repos = makeRepos(c.env);
  const subjectId = c.req.param('subjectId');
  const graph = await repos.learningContent.getSubjectGraph(c.get('deviceId'), subjectId);
  if (!graph) {
    return c.json(notFound(`Subject Graph not found for subject ${subjectId}`), 404);
  }
  return c.json(graph);
});

learningContent.get('/subjects/:subjectId/topics/:topicId/details', async (c) => {
  const repos = makeRepos(c.env);
  const subjectId = c.req.param('subjectId');
  const topicId = c.req.param('topicId');
  const details = await repos.learningContent.getTopicDetails(c.get('deviceId'), subjectId, topicId);
  if (!details) {
    return c.json(notFound(`Topic Content details not found for subject ${subjectId}, topic ${topicId}`), 404);
  }
  return c.json(details);
});

learningContent.get('/subjects/:subjectId/topics/:topicId/cards', async (c) => {
  const repos = makeRepos(c.env);
  const subjectId = c.req.param('subjectId');
  const topicId = c.req.param('topicId');
  const cards = await repos.learningContent.getTopicCards(c.get('deviceId'), subjectId, topicId);
  if (cards.length === 0) {
    return c.json(notFound(`Topic cards not found for subject ${subjectId}, topic ${topicId}`), 404);
  }
  return c.json({ cards });
});

learningContent.get('/subjects/:subjectId/topics/:topicId/trials/:targetLevel', async (c) => {
  const repos = makeRepos(c.env);
  const subjectId = c.req.param('subjectId');
  const topicId = c.req.param('topicId');
  const targetLevel = parseTargetLevel(c.req.param('targetLevel'));
  if (targetLevel === null) {
    return c.json({ error: 'invalid_target_level', message: 'targetLevel must be a positive integer' }, 400);
  }

  const cardPoolHash = c.req.query('cardPoolHash');
  if (!cardPoolHash || cardPoolHash.trim().length === 0) {
    return c.json({ error: 'missing_query', message: 'cardPoolHash query parameter is required' }, 400);
  }

  const trialSet = await repos.learningContent.getCrystalTrialSet(
    c.get('deviceId'),
    subjectId,
    topicId,
    targetLevel,
    cardPoolHash.trim(),
  );
  if (!trialSet) {
    return c.json(notFound(`Crystal Trial set not found for subject ${subjectId}, topic ${topicId}, target level ${targetLevel}`), 404);
  }
  return c.json(trialSet);
});

export { learningContent };
