/**
 * Curated allowlist of Lucide icon names available to topic graph nodes.
 *
 * Source of truth for:
 *  - Zod validation in topicLatticeSchema and graphSchema
 *  - Stage A prompt construction (allowlist string injection)
 *  - 2D presentation registry (TopicIcon)
 *  - 3D crystal label generated icon nodes
 *
 * Manual maintenance only. Adding or removing icons requires deliberate code
 * review with concurrent updates to schema, prompt, registry, and visual paths.
 * The literal union TopicIconName in `src/types/core.ts` mirrors this list and
 * is verified by `topicIconAllowlist.test.ts`.
 */
export const TOPIC_ICON_NAMES = [
  'atom',
  'beaker',
  'binary',
  'book-open',
  'brain',
  'calculator',
  'chart-line',
  'cloud',
  'code-xml',
  'compass',
  'cpu',
  'database',
  'dna',
  'flask-conical',
  'function-square',
  'globe',
  'graduation-cap',
  'hammer',
  'handshake',
  'heart-pulse',
  'landmark',
  'languages',
  'leaf',
  'lightbulb',
  'map',
  'microscope',
  'music',
  'network',
  'palette',
  'pen-tool',
  'puzzle',
  'rocket',
  'ruler',
  'scale',
  'server',
  'shield',
  'sigma',
  'telescope',
  'users',
  'wrench',
] as const;

export type TopicIconName = (typeof TOPIC_ICON_NAMES)[number];

/**
 * Type guard. Use only at validation/parse boundaries; downstream code should
 * already operate on `TopicIconName`.
 */
export function isTopicIconName(value: string): value is TopicIconName {
  return (TOPIC_ICON_NAMES as readonly string[]).includes(value);
}
