import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads `topics.json` next to this script and writes per topic:
 * - `public/data/subjects/{subjectId}/topics/{topicId}.json` (full topic object)
 * - `public/data/subjects/{subjectId}/cards/{topicId}.json` (`{ topicId, cards: [] }`)
 *
 * Re-running overwrites both topic files and card stubs (including non-empty `cards`).
 *
 * Run from repo root: `npx tsx research/prompts/utils/split-topics.ts`
 */
function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const topicsPath = join(scriptDir, "topics.json");
  const repoRoot = join(scriptDir, "../../..");

  const raw = readFileSync(topicsPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected topics.json to be a JSON array, got ${typeof parsed}`);
  }

  let topicsWritten = 0;
  let cardsWritten = 0;
  for (const item of parsed) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Expected each topic to be a plain object");
    }
    const topic = item as Record<string, unknown>;
    const topicId = topic.topicId;
    const subjectId = topic.subjectId;
    if (typeof topicId !== "string" || topicId.length === 0) {
      throw new Error("Each topic must have a non-empty string topicId");
    }
    if (typeof subjectId !== "string" || subjectId.length === 0) {
      throw new Error("Each topic must have a non-empty string subjectId");
    }

    const topicsDir = join(repoRoot, "public", "data", "subjects", subjectId, "topics");
    mkdirSync(topicsDir, { recursive: true });
    const topicPath = join(topicsDir, `${topicId}.json`);
    writeFileSync(topicPath, `${JSON.stringify(topic, null, 2)}\n`, "utf8");
    topicsWritten += 1;

    const cardsDir = join(repoRoot, "public", "data", "subjects", subjectId, "cards");
    mkdirSync(cardsDir, { recursive: true });
    const cardsStub: { topicId: string; cards: unknown[] } = { topicId, cards: [] };
    const cardsPath = join(cardsDir, `${topicId}.json`);
    writeFileSync(cardsPath, `${JSON.stringify(cardsStub, null, 2)}\n`, "utf8");
    cardsWritten += 1;
  }

  console.log(
    `Wrote ${topicsWritten} topic file(s) under public/data/subjects/*/topics/ and ${cardsWritten} card stub(s) under public/data/subjects/*/cards/`,
  );
}

main();
