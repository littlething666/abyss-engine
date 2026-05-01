/**
 * Normalizes legacy theory `miniGameAffordances` shapes (string categories, `candidateItems`, `steps`)
 * into the canonical structured form before Zod validation.
 *
 * Deterministic only — no model inference. Logged once per transformed set at the parser boundary.
 */

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim().length > 0);
}

function isObjectArray(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.every((x) => x && typeof x === 'object' && !Array.isArray(x));
}

function isCategoryObjectArray(v: unknown): v is { id: string; label: string }[] {
  return (
    Array.isArray(v) &&
    v.every(
      (x) =>
        x &&
        typeof x === 'object' &&
        typeof (x as { id?: unknown }).id === 'string' &&
        typeof (x as { label?: unknown }).label === 'string',
    )
  );
}

function migrateCategorySet(set: Record<string, unknown>, logLegacy: () => void): Record<string, unknown> {
  const rawCats = set.categories;
  const rawItems = set.items;
  const cand = set.candidateItems;

  if (Array.isArray(rawItems) && isObjectArray(rawItems)) {
    const first = rawItems[0] as { categoryId?: unknown };
    if (typeof first?.categoryId === 'string') {
      return set;
    }
  }

  if (isStringArray(rawCats) && isStringArray(cand)) {
    logLegacy();
    const categories = rawCats.map((label, i) => ({
      id: `cat-${i}`,
      label,
    }));
    const items = cand.map((label, i) => ({
      id: `item-${i}`,
      label,
      categoryId: categories[i % categories.length]!.id,
    }));
    const { candidateItems: _c, ...rest } = set;
    return { ...rest, categories, items };
  }

  if (isCategoryObjectArray(rawCats) && isStringArray(cand) && !Array.isArray(rawItems)) {
    logLegacy();
    const categories = rawCats;
    const items = cand.map((label, i) => ({
      id: `item-${i}`,
      label,
      categoryId: categories[i % categories.length]!.id,
    }));
    const { candidateItems: _c2, ...rest } = set;
    return { ...rest, categories, items };
  }

  return set;
}

function migrateOrderedSequence(row: Record<string, unknown>, logLegacy: () => void): Record<string, unknown> {
  const rawItems = row.items;
  const steps = row.steps;

  if (Array.isArray(rawItems) && isObjectArray(rawItems)) {
    const first = rawItems[0] as { correctPosition?: unknown };
    if (typeof first?.correctPosition === 'number') {
      return row;
    }
  }

  if (isStringArray(steps)) {
    logLegacy();
    const items = steps.map((label, i) => ({
      id: `seq-${i}`,
      label,
      correctPosition: i,
    }));
    const { steps: _s, ...rest } = row;
    return { ...rest, items };
  }

  return row;
}

function migrateConnectionPairs(row: Record<string, unknown>, logLegacy: () => void): Record<string, unknown> {
  const pairs = row.pairs;
  if (!Array.isArray(pairs) || pairs.length === 0) return row;
  const first = pairs[0];
  if (!first || typeof first !== 'object') return row;
  const f = first as { id?: unknown; left?: unknown; right?: unknown };
  if (typeof f.id === 'string' && typeof f.left === 'string' && typeof f.right === 'string') {
    return row;
  }
  if (typeof f.left === 'string' && typeof f.right === 'string') {
    logLegacy();
    const nextPairs = (pairs as { left: string; right: string }[]).map((p, i) => ({
      id: `pair-${i}`,
      left: p.left,
      right: p.right,
    }));
    return { ...row, pairs: nextPairs };
  }
  return row;
}

export function migrateMiniGameAffordancesInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const root = raw as Record<string, unknown>;
  let legacyCategory = false;
  let legacySequence = false;
  let legacyPairs = false;

  const logCat = () => {
    legacyCategory = true;
  };
  const logSeq = () => {
    legacySequence = true;
  };
  const logPair = () => {
    legacyPairs = true;
  };

  const categorySets = Array.isArray(root.categorySets)
    ? (root.categorySets as unknown[]).map((s) =>
        s && typeof s === 'object' && !Array.isArray(s)
          ? migrateCategorySet(s as Record<string, unknown>, logCat)
          : s,
      )
    : root.categorySets;

  const orderedSequences = Array.isArray(root.orderedSequences)
    ? (root.orderedSequences as unknown[]).map((s) =>
        s && typeof s === 'object' && !Array.isArray(s)
          ? migrateOrderedSequence(s as Record<string, unknown>, logSeq)
          : s,
      )
    : root.orderedSequences;

  const connectionPairs = Array.isArray(root.connectionPairs)
    ? (root.connectionPairs as unknown[]).map((s) =>
        s && typeof s === 'object' && !Array.isArray(s)
          ? migrateConnectionPairs(s as Record<string, unknown>, logPair)
          : s,
      )
    : root.connectionPairs;

  if (legacyCategory || legacySequence || legacyPairs) {
    console.warn(
      '[parseTopicTheoryPayload] Migrated legacy miniGameAffordances shape to canonical structured form (deterministic category/sequence/pair assignment).',
      { legacyCategory, legacySequence, legacyPairs },
    );
  }

  return { ...root, categorySets, orderedSequences, connectionPairs };
}
