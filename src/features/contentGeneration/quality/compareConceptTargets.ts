const TOKEN_MIN_LENGTH = 3;

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= TOKEN_MIN_LENGTH),
  );
}

export function conceptTargetJaccard(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isDuplicateConceptTarget(a: string, b: string, threshold = 0.72): boolean {
  if (!a || !b) return false;
  return conceptTargetJaccard(a, b) >= threshold;
}
