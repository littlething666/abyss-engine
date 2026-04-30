import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Architectural guard for the Topic Lucide Icons feature.
 *
 * - Wildcard namespace imports from `lucide-react` are forbidden everywhere
 *   in `src/`. They defeat tree-shaking and bundle the entire icon set into
 *   the runtime build.
 * - Deep imports (`from 'lucide-react/...'`) are only allowed inside
 *   `src/components/topicIcons/`. The build-time icon node generator (under
 *   `scripts/`) lives outside the scanned tree.
 *
 * This guard runs as a normal vitest unit test (no ESLint dependency).
 */

const SELF = fileURLToPath(import.meta.url);
const SRC_ROOT = path.resolve(path.dirname(SELF), '..', '..');

// Pattern fragments are concatenated at runtime so this file's source does
// not match the very regexes it executes against.
const LUCIDE_REACT_LITERAL = ['lucide', '-', 'react'].join('');
const NAMESPACE_PATTERN = new RegExp(
  `import\\s+\\*\\s+as\\s+\\w+\\s+from\\s+['"]${LUCIDE_REACT_LITERAL}['"]`,
);
const DEEP_PATTERN = new RegExp(
  `from\\s+['"]${LUCIDE_REACT_LITERAL}/[^'"\\s]+['"]`,
);

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);
const TOPIC_ICONS_BOUNDARY =
  ['components', 'topicIcons'].join(path.sep) + path.sep;

function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkSource(full));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function relativePosix(file: string): string {
  return path.relative(SRC_ROOT, file).split(path.sep).join('/');
}

describe('Lucide import boundary', () => {
  const files = walkSource(SRC_ROOT).filter(
    (file) => path.resolve(file) !== SELF,
  );

  it('discovers source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('forbids namespace imports from lucide-react across src/', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (NAMESPACE_PATTERN.test(text)) {
        offenders.push(relativePosix(file));
      }
    }
    expect(
      offenders,
      'Wildcard namespace imports from lucide-react are not allowed; use named imports only.',
    ).toEqual([]);
  });

  it('only allows lucide-react deep imports inside src/components/topicIcons/', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (!DEEP_PATTERN.test(text)) continue;
      const rel = path.relative(SRC_ROOT, file);
      if (!rel.startsWith(TOPIC_ICONS_BOUNDARY)) {
        offenders.push(relativePosix(file));
      }
    }
    expect(
      offenders,
      'Deep lucide-react/* imports are only permitted from src/components/topicIcons/. Move icon usage behind the TopicIcon registry.',
    ).toEqual([]);
  });
});
