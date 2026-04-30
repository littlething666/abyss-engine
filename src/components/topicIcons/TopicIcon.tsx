import {
  Atom,
  Beaker,
  Binary,
  BookOpen,
  Brain,
  Calculator,
  ChartLine,
  Cloud,
  CodeXml,
  Compass,
  Cpu,
  Database,
  Dna,
  FlaskConical,
  FunctionSquare,
  Globe,
  GraduationCap,
  Hammer,
  Handshake,
  HeartPulse,
  Landmark,
  Languages,
  Leaf,
  Lightbulb,
  Map,
  Microscope,
  Music,
  Network,
  Palette,
  PenTool,
  Puzzle,
  Rocket,
  Ruler,
  Scale,
  Server,
  Shield,
  Sigma,
  Telescope,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { TopicIconName } from '@/types/core';

/**
 * Static, exhaustive registry mapping every curated `TopicIconName` to its
 * `lucide-react` component.
 *
 * The required `Record<TopicIconName, LucideIcon>` shape makes adding or
 * removing an icon name a compile-time error until this registry is updated,
 * keeping the schema/prompt/registry/visual paths in lockstep with
 * `TOPIC_ICON_NAMES` (CLAUDE.md "No magic strings", "No legacy burden").
 *
 * Static named imports only — never `import * as ...`, never deep imports —
 * so the user-facing bundle stays tree-shakeable and the lucide entry
 * boundary stays auditable.
 */
export const TOPIC_ICON_COMPONENTS: Record<TopicIconName, LucideIcon> = {
  atom: Atom,
  beaker: Beaker,
  binary: Binary,
  'book-open': BookOpen,
  brain: Brain,
  calculator: Calculator,
  'chart-line': ChartLine,
  cloud: Cloud,
  'code-xml': CodeXml,
  compass: Compass,
  cpu: Cpu,
  database: Database,
  dna: Dna,
  'flask-conical': FlaskConical,
  'function-square': FunctionSquare,
  globe: Globe,
  'graduation-cap': GraduationCap,
  hammer: Hammer,
  handshake: Handshake,
  'heart-pulse': HeartPulse,
  landmark: Landmark,
  languages: Languages,
  leaf: Leaf,
  lightbulb: Lightbulb,
  map: Map,
  microscope: Microscope,
  music: Music,
  network: Network,
  palette: Palette,
  'pen-tool': PenTool,
  puzzle: Puzzle,
  rocket: Rocket,
  ruler: Ruler,
  scale: Scale,
  server: Server,
  shield: Shield,
  sigma: Sigma,
  telescope: Telescope,
  users: Users,
  wrench: Wrench,
};

export interface TopicIconProps {
  iconName: TopicIconName;
  /**
   * Tailwind sizing/color class. Defaults to `size-4` (1rem). Color inherits
   * via `currentColor` from the parent — set color on the parent.
   */
  className?: string;
  /**
   * Decorative by default. Topic names render alongside the icon on every
   * surface, so the icon supplements visible text rather than substituting
   * for it (mobile-first guidance: never rely on icon-only affordances).
   * Pass `false` (with `aria-label`) only when the icon stands alone.
   */
  'aria-hidden'?: boolean;
  /** Required when `aria-hidden` is `false`. */
  'aria-label'?: string;
  /** Optional pass-through for surface-level tests. */
  'data-testid'?: string;
}

/**
 * Renders the curated lucide icon for a given `TopicIconName`.
 *
 * - Icon identity is data-driven via the curated `iconName` allowlist; the
 *   component never selects icons heuristically and never falls back.
 * - Color inherits via `currentColor`; size and tone are owned by callers.
 * - Decorative by default. Topic names always remain visible beside the
 *   icon, satisfying CLAUDE.md mobile-first "no hover-only / icon-only
 *   affordances".
 */
export function TopicIcon({
  iconName,
  className = 'size-4',
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: TopicIconProps) {
  const IconComponent = TOPIC_ICON_COMPONENTS[iconName];
  return (
    <IconComponent
      className={className}
      aria-hidden={ariaHidden ? true : undefined}
      aria-label={ariaHidden ? undefined : ariaLabel}
      role={ariaHidden ? undefined : 'img'}
      data-testid={dataTestId}
      data-topic-icon={iconName}
    />
  );
}
