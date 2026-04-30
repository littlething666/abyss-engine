#!/usr/bin/env node
/**
 * One-time deterministic source-fill for topic graph icon names.
 *
 * Reads every `public/data/subjects/{subject}/graph.json`, picks an iconName for
 * each topic node from the curated allowlist using keyword rules over topic
 * title and topic id, and writes the file back. Hard-fails (non-zero exit) if
 * any topic has no rule match, so missing rules require manual selection rather
 * than a silent generic fallback.
 *
 * Constraints:
 *  - No imports from `src/`. The curated allowlist is duplicated here
 *    intentionally so the script remains a pure Node ESM tool.
 *  - This script is committed once for traceability and deleted in the same PR.
 */

import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import process from 'node:process';

const TOPIC_ICON_NAMES = new Set([
  'atom', 'beaker', 'binary', 'book-open', 'brain',
  'calculator', 'chart-line', 'cloud', 'code-xml', 'compass',
  'cpu', 'database', 'dna', 'flask-conical', 'function-square',
  'globe', 'graduation-cap', 'hammer', 'handshake', 'heart-pulse',
  'landmark', 'languages', 'leaf', 'lightbulb', 'map',
  'microscope', 'music', 'network', 'palette', 'pen-tool',
  'puzzle', 'rocket', 'ruler', 'scale', 'server',
  'shield', 'sigma', 'telescope', 'users', 'wrench',
]);

/**
 * Ordered keyword rules. First rule whose pattern matches the normalized
 * `${title} ${topicId}` (lowercased) wins. More specific rules first.
 */
const RULES = [
  // 1) High-specificity domain combos
  [/(neural[- ]prosthetic)/, 'dna'],
  [/(bio[- ]?robotic)/, 'dna'],
  [/(synthetic biology)/, 'dna'],
  [/(microfluid|lab[- ]on)/, 'flask-conical'],
  [/(tele[- ]?surg|surger?y|surgical)/, 'heart-pulse'],

  // 2) AI / ML
  [/(deep learning|neural network|machine learning|ai[- ]driven|artificial intelligence)/, 'brain'],

  // 3) Data / infra / systems
  [/(biometric data|data pipeline|data warehouse|database|sql)/, 'database'],
  [/(distributed|cloud|edge[- ]computing|serverless)/, 'server'],
  [/(embedded|rtos|microcontroller|kinematic|hardware)/, 'cpu'],
  [/(navigation|slam|path[- ]plan|mapping|map[- ])/, 'map'],
  [/(causal)/, 'network'],
  [/(sensor|fusion|swarm|coordination|graph theory|dag|networking|connectivity)/, 'network'],
  [/(robotic|automation|autonomous)/, 'cpu'],

  // 4) Sciences
  [/(entropy|thermodynamic|atom|quantum|particle|nuclear)/, 'atom'],
  [/(chemistry|reagent|titration|reaction)/, 'beaker'],
  [/(dna|gene|genetic|molecular biology)/, 'dna'],
  [/(microscope|microbiolog|cell biolog)/, 'microscope'],
  [/(health|medic|biolog|prosthetic|bioprocess)/, 'heart-pulse'],

  // 5) Math / stats
  [/(linear[- ]algebra|matrix|tensor|vector space|svd|pca)/, 'sigma'],
  [/(calculus|derivative|gradient|differential|integral)/, 'function-square'],
  [/(optimi[sz]ation|convex|loss landscape)/, 'function-square'],
  [/(bayes|stochastic|markov|monte carlo|probabilit)/, 'sigma'],
  [/(statistic|regression|time[- ]series|hypothesis|p[- ]?value|distribution|descriptive|inference)/, 'chart-line'],
  [/(discrete|combinatoric|set theory|logic)/, 'binary'],

  // 6) Humanities & general
  [/(language|translation|linguistic)/, 'languages'],
  [/(history|civic|law|government)/, 'landmark'],
  [/(ethic|negotiat|argument)/, 'handshake'],
  [/(geography|world|earth)/, 'globe'],
  [/(astronomy|cosmolog|telescope)/, 'telescope'],
  [/(art|design|paint|drawing)/, 'palette'],
  [/(writing|composition|poetry|literature|reading)/, 'book-open'],
];

const SUBJECTS_ROOT = resolve(process.cwd(), 'public/data/subjects');

async function listSubjectDirs() {
  const entries = await readdir(SUBJECTS_ROOT, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function pickIconName(node) {
  const haystack = `${node.title ?? ''} ${node.topicId ?? ''}`.toLowerCase();
  for (const [pattern, name] of RULES) {
    if (pattern.test(haystack)) {
      if (!TOPIC_ICON_NAMES.has(name)) {
        throw new Error(`Internal: rule resolved to non-allowlisted icon "${name}"`);
      }
      return name;
    }
  }
  return null;
}

async function main() {
  const subjects = await listSubjectDirs();
  const failures = [];
  let updatedCount = 0;
  for (const subject of subjects) {
    const file = join(SUBJECTS_ROOT, subject, 'graph.json');
    try {
      await stat(file);
    } catch {
      continue;
    }
    const raw = await readFile(file, 'utf8');
    const graph = JSON.parse(raw);
    let changed = false;
    for (const node of graph.nodes ?? []) {
      if (typeof node.iconName === 'string' && TOPIC_ICON_NAMES.has(node.iconName)) {
        continue;
      }
      const picked = pickIconName(node);
      if (!picked) {
        failures.push(`${subject}: ${node.topicId} ("${node.title}")`);
        continue;
      }
      node.iconName = picked;
      changed = true;
      updatedCount += 1;
    }
    if (changed && failures.length === 0) {
      await writeFile(file, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
      console.log(`updated ${file}`);
    }
  }
  if (failures.length > 0) {
    console.error('\nNo rule matched the following topics. Add a keyword rule or pick manually:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\nDone. ${updatedCount} topic node(s) received an iconName.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
