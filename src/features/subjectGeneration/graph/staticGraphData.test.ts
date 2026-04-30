import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { subjectGraphSchema } from './graphSchema';

const SUBJECTS_ROOT = resolve(process.cwd(), 'public/data/subjects');

type SubjectGraphFile = { subject: string; file: string };

function listSubjectGraphFiles(): SubjectGraphFile[] {
  return readdirSync(SUBJECTS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ subject: e.name, file: join(SUBJECTS_ROOT, e.name, 'graph.json') }))
    .filter(({ file }) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    });
}

describe('static graph.json data integrity', () => {
  const entries = listSubjectGraphFiles();

  it('discovers at least one subject graph file', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)(
    'subject "$subject" graph.json conforms to subjectGraphSchema',
    ({ file }) => {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const result = subjectGraphSchema.safeParse(parsed);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path.join('.') ?? '';
        throw new Error(`Schema validation failed at ${path}: ${issue?.message}`);
      }
    },
  );
});
