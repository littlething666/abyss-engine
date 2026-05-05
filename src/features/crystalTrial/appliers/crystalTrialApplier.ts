/**
 * Crystal Trial Artifact Applier — Phase 0.5 step 5.
 *
 * Applies `crystal-trial` artifacts by writing prepared scenario
 * questions into `useCrystalTrialStore` via the existing
 * `startPregeneration` + `setTrialQuestions` action sequence. The
 * applier reads current store state to determine if the trial was
 * superseded mid-flight.
 *
 * **MUST NOT emit `crystal-trial:completed`** (Plan v3 Q21). That
 * event is exclusively a player-assessment surface fired by
 * `submitTrial(...)`. The existing trial-availability watcher in
 * `eventBusHandlers.ts` picks up the store change and fires the
 * `handleMentorTrigger('crystal-trial:available-for-player', ...)`
 * path — unchanged.
 *
 * Exported through `src/features/crystalTrial/index.ts`.
 */

import type { CrystalTrialScenarioQuestion } from '@/types/crystalTrial';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';
import type {
  ArtifactApplyContext,
  ArtifactApplier,
} from '@/features/generationContracts/artifacts/applier';
import type {
  ArtifactEnvelope,
  CrystalTrialArtifactPayload,
} from '@/features/generationContracts';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type CrystalTrialApplier = ArtifactApplier<'crystal-trial'>;

export function createCrystalTrialApplier(): CrystalTrialApplier {
  return {
    kind: 'crystal-trial',
    async apply(
      artifact: ArtifactEnvelope<'crystal-trial'>,
      ctx: ArtifactApplyContext,
    ) {
      if (artifact.kind !== 'inline') {
        return { applied: false, reason: 'invalid' };
      }
      const contentHash = artifact.artifact.contentHash;
      if (await ctx.dedupeStore.has(contentHash)) {
        return { applied: false, reason: 'duplicate' };
      }

      const { subjectId, topicId } = ctx;
      if (!subjectId || !topicId) {
        return { applied: false, reason: 'invalid' };
      }

      const payload = artifact.artifact.payload as unknown as CrystalTrialArtifactPayload;

      // Cast questions to the deck-compatible shape. The schema already
      // enforces the exact fields; we just widen `id` and `category` to
      // the store's expected types.
      const questions: CrystalTrialScenarioQuestion[] =
        payload.questions as unknown as CrystalTrialScenarioQuestion[];

      if (questions.length === 0) {
        return { applied: false, reason: 'invalid' };
      }

      // Deduce the trial's target level from the current store state.
      // `setTrialQuestions` guards on `status === 'pregeneration'`,
      // so the questions only attach when the pregen request is still
      // live (not cancelled / superseded).
      const store = useCrystalTrialStore.getState();
      const trial = store.getCurrentTrial({ subjectId, topicId });

      // If no trial pregen is in flight, the run was superseded or
      // the tab restarted before pregen was dispatched.
      if (!trial || trial.status !== 'pregeneration') {
        return { applied: false, reason: 'superseded' };
      }

      // Attach questions and transition to `awaiting_player`.
      // This calls the store synchronously; the zustand persist
      // middleware writes to localStorage.
      store.setTrialQuestions({ subjectId, topicId }, questions);

      // Set the card pool hash from the snapshot's input_hash so
      // the invalidation watcher detects pool changes.
      store.setCardPoolHash({ subjectId, topicId }, artifact.artifact.inputHash);

      await ctx.dedupeStore.record(contentHash, 'crystal-trial', ctx.now());

      // IMPORTANT: DO NOT emit `crystal-trial:completed` here.
      // That event is exclusively for player assessment results.
      // The existing trial-availability watcher in `eventBusHandlers.ts`
      // handles the mentor trigger for the `awaiting_player` transition.

      return { applied: true };
    },
  };
}
