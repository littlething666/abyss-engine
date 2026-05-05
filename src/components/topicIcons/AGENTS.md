# Topic Icon Rules

## Lucide Import Scope

- `src/components/topicIcons/` is the only runtime folder allowed to use the broader `lucide-react` import surface needed by `TopicIcon.tsx` and `lucideImportBoundary.test.ts`.
- Runtime 3D label and mentor-bubble rendering must use the generated nodes and raster helpers under `src/graphics/labels/`; do not import `lucide` or `lucide-react` into those paths.
- Keep `lucideImportBoundary.test.ts` aligned with the full icon policy documented in `src/graphics/labels/AGENTS.md`.
