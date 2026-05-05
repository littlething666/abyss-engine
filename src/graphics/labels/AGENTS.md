# Graphics Label Icon Rules

## Lucide Icon Imports

- Lucide is used in two independent feature surfaces:
  - **Topic icons.** 2D surfaces render through `src/components/topicIcons/TopicIcon.tsx`. 3D crystal labels render through the build-time-generated `src/graphics/labels/generated/topicIconNodes.ts`. Allowlist: `src/features/subjectGeneration/graph/topicIcons/topicIconAllowlist.ts`.
  - **Mentor-bubble glyphs.** The 3D mentor bubble (`src/components/MentorBubble.tsx`) renders through the build-time-generated `src/graphics/labels/generated/mentorIconNodes.ts` via `src/graphics/labels/createMentorBubbleTexture.ts` and `src/graphics/labels/drawMentorIcon.ts`. Allowlist: `src/features/mentor/mentorIconAllowlist.ts`. The custom `philosopher-stone` neutral glyph is hand-authored inside the generator script, NOT in the emitted nodes file.
- The two icon vocabularies are intentionally disjoint at the `Record<...>` key level. Both surfaces share `src/graphics/labels/drawIconPrimitives.ts` through the surface-specific `drawTopicIcon` and `drawMentorIcon` adapters.
- Runtime label and bubble paths never import `lucide` or `lucide-react`.
- Outside `src/components/topicIcons/`, only static **named** imports from `lucide-react` are allowed. Wildcard `import * as ... from 'lucide-react'` and deep imports (`from 'lucide-react/...'`) are forbidden everywhere except `src/components/topicIcons/**`.
- The non-react `lucide` package is a `devDependency` consumed only by `scripts/generate-topic-icon-nodes.ts` and `scripts/generate-mentor-icon-nodes.ts`. Never import it from runtime code.
- The boundary is enforced by `src/components/topicIcons/lucideImportBoundary.test.ts` (runs as part of `pnpm test:unit:run`). The scan forbids namespace imports from `lucide-react`, deep imports from `lucide-react/*` outside `src/components/topicIcons/`, and any runtime import of the non-react `lucide` package.
- Adding or removing a topic icon requires updating `TOPIC_ICON_NAMES` + `TopicIconName` in `src/types/core.ts` and re-running `pnpm generate:topic-icons`.
- Adding or removing a mentor icon requires updating `MENTOR_ICON_NAMES` + `MentorIconName` and re-running `pnpm generate:mentor-icons`.
- `pnpm check:topic-icons` is wired into CI through `pnpm test:unit:run`; `pnpm check:mentor-icons` is manual-only by design until the mentor-icon set settles.
