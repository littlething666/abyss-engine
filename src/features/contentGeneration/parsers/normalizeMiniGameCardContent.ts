/**
 * Coerces common LLM mini-game shapes into the canonical {@link MiniGameContent}
 * types in `src/types/core.ts`. Uses deterministic ids derived from the card id
 * and content so the same payload normalizes identically across parses.
 *
 * Label aliases: `label` | `content` | `item` | `text` (game-type specific).
 * Connection pairs: `left`/`right` | `item1`/`item2` | `term`/`definition`.
 */

import { stringToKebabCaseId } from '@/lib/stringToKebabCaseId';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** FNV-1a 32-bit — deterministic, compact */
function fnv1a32Hex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function makeStableId(cardId: string, role: string, index: number, label: string): string {
  const h = fnv1a32Hex(`${cardId}\u0001${role}\u0001${index}\u0001${label}`);
  const prefix = stringToKebabCaseId(cardId).slice(0, 48) || 'card';
  return `${prefix}-mg-${role}-${index}-${h}`;
}

function normalizeCategorySort(cardId: string, content: Record<string, unknown>): Record<string, unknown> {
  const rawCategories = content.categories;
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
    return content;
  }

  const categories: { id: string; label: string }[] = rawCategories.map((c, i) => {
    if (typeof c === 'string') {
      const label = c.trim();
      return { id: makeStableId(cardId, 'cat', i, label), label };
    }
    if (!isRecord(c)) {
      return { id: makeStableId(cardId, 'cat', i, 'invalid'), label: '' };
    }
    const labelRaw = c.label;
    const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
    const id =
      typeof c.id === 'string' && c.id.trim().length > 0 ? c.id.trim() : makeStableId(cardId, 'cat', i, label || `c${i}`);
    return { id, label: label || id };
  });

  const idSet = new Set(categories.map((x) => x.id));
  const labelToId = new Map<string, string>();
  for (const cat of categories) {
    labelToId.set(cat.label.trim().toLowerCase(), cat.id);
  }

  const rawItems = content.items;
  const items: { id: string; label: string; categoryId: string }[] = [];
  if (!Array.isArray(rawItems)) {
    return { ...content, categories, items: [] };
  }

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    if (!isRecord(it)) continue;
    const labelRaw = it.label ?? it.content ?? it.item ?? it.text;
    const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
    const id =
      typeof it.id === 'string' && it.id.trim().length > 0 ? it.id.trim() : makeStableId(cardId, 'item', i, label || `i${i}`);

    let categoryId: string | undefined;
    if (typeof it.categoryId === 'string' && it.categoryId.trim().length > 0) {
      const cid = it.categoryId.trim();
      if (idSet.has(cid)) {
        categoryId = cid;
      } else {
        const byLabel = labelToId.get(cid.toLowerCase());
        if (byLabel) categoryId = byLabel;
        else categoryId = cid;
      }
    }
    if (categoryId === undefined && typeof it.category === 'string') {
      const name = it.category.trim();
      if (idSet.has(name)) {
        categoryId = name;
      } else {
        const byLabel = labelToId.get(name.toLowerCase());
        if (byLabel) categoryId = byLabel;
      }
    }

    if (categoryId === undefined || !idSet.has(categoryId)) {
      continue;
    }

    items.push({
      id,
      label: label || id,
      categoryId,
    });
  }

  return {
    ...content,
    gameType: 'CATEGORY_SORT',
    categories,
    items,
  };
}

function normalizeSequenceBuild(cardId: string, content: Record<string, unknown>): Record<string, unknown> {
  const rawItems = content.items;
  if (!Array.isArray(rawItems)) {
    return content;
  }

  const items: { id: string; label: string; correctPosition: number }[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    if (!isRecord(it)) continue;
    const labelRaw = it.label ?? it.content ?? it.text ?? it.item;
    const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
    const id =
      typeof it.id === 'string' && it.id.trim().length > 0 ? it.id.trim() : makeStableId(cardId, 'seq', i, label || `i${i}`);

    let pos: number | undefined;
    if (typeof it.correctPosition === 'number' && Number.isFinite(it.correctPosition)) {
      pos = Math.trunc(it.correctPosition);
    } else if (typeof it.correctPosition === 'string' && it.correctPosition.trim() !== '') {
      const n = Number.parseInt(it.correctPosition, 10);
      if (Number.isFinite(n)) pos = n;
    }
    if (pos === undefined || pos < 0) continue;

    items.push({
      id,
      label: label || id,
      correctPosition: pos,
    });
  }

  return {
    ...content,
    gameType: 'SEQUENCE_BUILD',
    items,
  };
}

function normalizeConnectionWeb(cardId: string, content: Record<string, unknown>): Record<string, unknown> {
  const rawPairs = content.pairs;
  if (!Array.isArray(rawPairs)) {
    return content;
  }

  const pairs: { id: string; left: string; right: string }[] = [];
  for (let i = 0; i < rawPairs.length; i++) {
    const p = rawPairs[i];
    if (!isRecord(p)) continue;
    const leftRaw = p.left ?? p.item1 ?? p.term;
    const rightRaw = p.right ?? p.item2 ?? p.definition;
    const left = typeof leftRaw === 'string' ? leftRaw.trim() : '';
    const right = typeof rightRaw === 'string' ? rightRaw.trim() : '';
    const id =
      typeof p.id === 'string' && p.id.trim().length > 0
        ? p.id.trim()
        : makeStableId(cardId, 'pair', i, `${left}\u0001${right}`);
    if (!left || !right) continue;
    pairs.push({ id, left, right });
  }

  const rawDist = content.distractors;
  const distractors: { id: string; side: 'left' | 'right'; label: string }[] = [];
  if (Array.isArray(rawDist)) {
    for (let i = 0; i < rawDist.length; i++) {
      const d = rawDist[i];
      if (typeof d === 'string') {
        const label = d.trim();
        if (!label) continue;
        distractors.push({
          id: makeStableId(cardId, 'dist', i, label),
          side: 'right',
          label,
        });
        continue;
      }
      if (!isRecord(d)) continue;
      const labelRaw = d.label;
      const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
      if (!label) continue;
      const side = d.side === 'left' || d.side === 'right' ? d.side : 'right';
      const id =
        typeof d.id === 'string' && d.id.trim().length > 0 ? d.id.trim() : makeStableId(cardId, 'dist', i, `${side}|${label}`);
      distractors.push({ id, side, label });
    }
  }

  const next: Record<string, unknown> = {
    ...content,
    gameType: 'CONNECTION_WEB',
    pairs,
  };
  if (distractors.length > 0) {
    next.distractors = distractors;
  } else {
    delete next.distractors;
  }
  return next;
}

/**
 * Returns a new content object; does not mutate `content`.
 */
export function normalizeMiniGameCardContent(cardId: string, content: Record<string, unknown>): Record<string, unknown> {
  const gt = content.gameType;
  if (gt === 'CATEGORY_SORT') {
    return normalizeCategorySort(cardId, content);
  }
  if (gt === 'SEQUENCE_BUILD') {
    return normalizeSequenceBuild(cardId, content);
  }
  if (gt === 'CONNECTION_WEB') {
    return normalizeConnectionWeb(cardId, content);
  }
  return content;
}
