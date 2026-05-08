# Static decks cleanup [DO NOT IMPLEMENT]

## Review summary

The codebase currently treats static `public/data/subjects/**` as **bundled starter curricula**. That path is wired through:

* `deckStaticFetch.ts` fetching `manifest.json`, `graph.json`, topic details, and cards.
* `deckSeed.ts` hydrating IndexedDB from those files and tracking `BUNDLED_DECK_CONTENT_VERSION`.
* `ManifestOptions.includePregeneratedCurriculums`.
* `pregeneratedCurriculumsVisible` feature flag and the settings toggle.
* Repository filtering that hides `contentSource === 'bundled'` by default.
* Tests/E2E flows that click **Load Default Deck** and wait for bundled cards.

Given the app is unreleased and you explicitly do **not** want starter curricula, the cleanest plan is a breaking removal: **delete the bundled/static seed pathway, remove the manifest option/flag, and make all deck reads return only user-owned/generated backend content.**

---

## Recommended decisions

| Question                                                         | Recommended answer                                                                                                                                                        |            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Should `public/data/subjects/**` remain for examples/tests?      | **No.** Delete it entirely. Tests should seed generated/manual rows explicitly.                                                                                           |            |
| Should `contentSource: 'bundled'` remain in types and DB schema? | **No.** Remove it from frontend/backend unions and D1 `check` constraints. Keep only `'generated'                                                                         | 'manual'`. |
| Should `includePregeneratedCurriculums` remain as a no-op?       | **No.** Remove the option from `ManifestOptions`, `IDeckRepository`, hooks, repository implementations, and all call sites.                                               |            |
| Should `pregeneratedCurriculumsVisible` remain in feature flags? | **No.** Remove state, persistence, setter, tests, and settings UI row. No migration needed.                                                                               |            |
| What should first-run UX show?                                   | Empty subject state with **New subject / generate subject** CTA. No “Load Default Deck”.                                                                                  |            |
| What replaces `ensureDeckSeeded()`?                              | A small `ensureDeckDbOpen()` / `ensureLocalDeckReady()` that only opens IndexedDB. No network, no static fetch, no bundled version meta.                                  |            |
| Should `ApiDeckRepository` stay?                                 | Likely **delete** it if its only purpose is direct reads from `public/data`. Backend reads should use `BackendDeckRepository`; local reads use `IndexedDbDeckRepository`. |            |

---

## Implementation plan

### 1. Remove static asset seed files

Delete:

```txt
public/data/subjects/**
src/infrastructure/deckDb/deckStaticFetch.ts
src/infrastructure/deckDb/deckStaticFetch.test.ts
src/infrastructure/deckContentVersion.ts
src/features/subjectGeneration/graph/staticGraphData.test.ts
```

Also delete `src/infrastructure/repositories/ApiDeckRepository.ts` unless another DI path still uses it. The extracted tree shows it depends directly on `deckStaticFetch`, so it should not survive this change.

---

### 2. Replace `deckSeed.ts` with local DB open/bootstrap only

Current `deckSeed.ts` fetches static JSON, writes bundled rows, deletes/replaces previous bundled rows, and stores `bundledContentVersion`. Replace that with a DB-open singleton:

```ts
let openPromise: Promise<void> | null = null;

async function runEnsureDeckDbOpen(): Promise<void> {
  await deckDb.open();
}

export function ensureDeckDbOpen(): Promise<void> {
  if (!openPromise) {
    openPromise = runEnsureDeckDbOpen();
  }
  return openPromise;
}

export function resetDeckDbOpenSingletonForTests(): void {
  openPromise = null;
}
```

Then update all imports:

```ts
import { ensureDeckDbOpen } from '../deckDb/deckSeed';
```

or rename the file to `deckOpen.ts` / `deckDbLifecycle.ts` to avoid preserving obsolete seed semantics.

Update these consumers:

* `deckContentWriter.ts`
* `IndexedDbDeckRepository.ts`
* `deckTestFixtures.ts`
* test reset helpers

Current write/read paths call `ensureDeckSeeded()` before every IndexedDB operation, so this is a mechanical replacement.

---

### 3. Remove bundled content source from contracts

Change frontend repository types:

```ts
export type DeckContentSource = 'generated' | 'manual';

export interface Manifest {
  subjects: Subject[];
}

export interface IDeckRepository {
  getManifest(): Promise<Manifest>;
  getSubjectGraph(subjectId: string): Promise<SubjectGraph>;
  getTopicDetails(subjectId: string, topicId: string): Promise<TopicDetails>;
  getTopicCards(subjectId: string, topicId: string): Promise<Card[]>;
  getTopicContentStatuses(subjectId: string): Promise<TopicContentStatusRecord[]>;
}
```

Delete:

```ts
export interface ManifestOptions {
  includePregeneratedCurriculums?: boolean;
}
```

Change backend content source too:

```ts
export type SubjectContentSource = 'generated' | 'manual';
```

Update D1 canonical init:

```sql
content_source text not null check (content_source in ('generated','manual')),
```

Because the app is unreleased, do **not** create a migration. Reset/recreate local D1 from the canonical init script.

---

### 4. Simplify `BackendDeckRepository`

Delete:

```ts
const USER_OWNED_CONTENT_SOURCES = new Set(...)
const FRONTEND_CONTENT_SOURCES = new Set(['bundled', 'generated', 'manual'])
function isVisibleSubject(...)
```

Replace with:

```ts
const FRONTEND_CONTENT_SOURCES = new Set<BackendSubjectContentSource>(['generated', 'manual']);

async getManifest(): Promise<Manifest> {
  const payload = requireManifestResponse(await this.http.get<unknown>('/v1/library/manifest'));
  return {
    subjects: payload.subjects.map(manifestSubjectFromBackend),
  };
}
```

No filtering option. If a backend row has `contentSource: 'bundled'`, fail loudly; that is now invalid data.

---

### 5. Simplify `IndexedDbDeckRepository`

Current `IndexedDbDeckRepository.getManifest()` partitions `generated/manual` before `bundled`, and conditionally includes bundled rows. Replace with ordered rows only:

```ts
async getManifest(): Promise<Manifest> {
  await ensureDeckDbOpen();

  const orderRow = await deckDb.meta.get('subjectIdsOrdered');
  const order = (orderRow?.value as string[] | undefined) ?? [];
  const rows = await deckDb.subjects.toArray();

  const subjects = buildOrderedManifestSubjects(rows, order);
  return { subjects };
}

function buildOrderedManifestSubjects(rows: DeckSubjectRow[], order: string[]): Subject[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = order
    .map((id) => byId.get(id))
    .filter((row): row is DeckSubjectRow => Boolean(row));

  const seen = new Set(orderedRows.map((row) => row.id));
  const extras = rows
    .filter((row) => !seen.has(row.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  return [...orderedRows, ...extras];
}
```

Also remove `partitionRowsByVisibility`.

---

### 6. Remove feature flag and settings UI

From `featureFlagsStore.ts`, delete:

```ts
pregeneratedCurriculumsVisible
setPregeneratedCurriculumsVisible
```

Also remove it from:

* default state
* snapshot read/write
* persisted patch merge
* tests
* `GlobalSettingsSheet` preferences section

The settings row currently says “Pregenerated curricula — Show bundled starter curricula on the topic-grid landing.” That entire preference should be removed.

---

### 7. Simplify hooks and call sites

Change `useManifest`:

```ts
export function useManifest(): UseQueryResult<Manifest, Error> {
  return useQuery({
    queryKey: ['content', 'subjects'] as const,
    queryFn: async (): Promise<Manifest> => deckRepository.getManifest(),
    staleTime: DEFAULT_STALE_TIME,
  });
}
```

Change `useSubjects`:

```ts
export function useSubjects(): UseQueryResult<Subject[], Error> {
  const manifestQuery = useManifest();
  return {
    ...manifestQuery,
    data: manifestQuery.data?.subjects ?? [],
  } as unknown as UseQueryResult<Subject[], Error>;
}
```

Then replace all:

```ts
deckRepository.getManifest({ includePregeneratedCurriculums: true })
deck.getManifest({ includePregeneratedCurriculums: true })
useManifest(options)
useSubjects(options)
```

with:

```ts
deckRepository.getManifest()
deck.getManifest()
useManifest()
useSubjects()
```

The extracted code has repeated `includePregeneratedCurriculums: true` usage in subject creation, generation pipelines, crystal trial generation, event-bus subject display lookup, and graph aggregation. Those should become normal manifest reads because there is no hidden bundled class anymore.

---

### 8. Update tests

Delete or rewrite tests whose premise is bundled/static content:

* `deckStaticFetch.test.ts`
* `staticGraphData.test.ts`
* `deckSeed.test.ts` static fetch/version tests
* Backend test: “hides bundled subjects by default”
* IndexedDB test: “hides bundled subjects by default and shows user-owned subjects first when enabled”
* Any assertion involving `contentSource: 'bundled'`
* Any E2E helper that clicks **Load Default Deck**

Rewrite tests to use explicit generated/manual fixtures:

```ts
const subjectRow = {
  id: 'sub-a',
  name: 'Subject A',
  description: 'd',
  color: '#000',
  geometry: { gridTile: 'box' as const },
  contentSource: 'generated' as const,
};
```

For E2E tests that need study cards, add a test-only seeding utility that writes generated subject/graph/topic/cards through the app’s dev hook or IndexedDB fixture. Do not use static JSON.

Keep the empty-state mentor/discovery test. It becomes the canonical first-run behavior: no subjects → empty state → New subject CTA.

---

### 9. Remove “Load Default Deck” UX

Search for and remove any UI surface that renders:

```txt
Load Default Deck
```

The app should no longer have a manual default-deck hydration action. First-run should route to subject creation/generation.

E2E helpers currently assume default deck loading and wait for `activeCards > 0`; those should be split:

* **empty app fixture**: no subjects, tests empty state.
* **generated content fixture**: preloads a generated subject/topic/cards for study-session/discovery tests.

---

### 10. Final cleanup grep checklist

Before calling the work complete, these searches should return zero source references, except possibly historical comments in a changelog:

```sh
rg "includePregeneratedCurriculums"
rg "pregeneratedCurriculumsVisible|setPregeneratedCurriculumsVisible"
rg "bundled"
rg "BUNDLED_DECK_CONTENT_VERSION|bundledContentVersion"
rg "deckStaticFetch|fetchManifest|fetchSubjectGraph|fetchTopicDetails|fetchTopicCards"
rg "public/data/subjects|/data/subjects"
rg "Load Default Deck"
```

Then run:

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
```

---

## Recommended execution order

1. **Contract cut:** remove `ManifestOptions`, `includePregeneratedCurriculums`, and `bundled` from shared types.
2. **Backend schema cut:** update D1 init and backend Learning Content types/tests.
3. **Repository cut:** simplify `BackendDeckRepository` and `IndexedDbDeckRepository`.
4. **Seed cut:** delete static fetch/content-version code; replace `ensureDeckSeeded` with DB-open lifecycle.
5. **UI cut:** remove settings toggle and default deck loader.
6. **Test cut:** replace bundled/default deck fixtures with generated/manual fixtures.
7. **Asset cut:** delete `public/data/subjects/**`.
8. **Grep/type/test closure.**

This keeps the architecture coherent: the frontend repository abstraction still exists, IndexedDB remains valid for local/user-owned generated rows, and the durable backend remains the source of generated Learning Content Store rows.
