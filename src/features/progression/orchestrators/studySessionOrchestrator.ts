/**
 * Study-session orchestrator.
 *
 * Reads from the four progression stores (crystalGarden, studySession, sm2,
 * buff), calls policies, writes back, and emits domain events on the
 * `appEventBus`. Owns cross-store mutation seams that used to live inside
 * `progressionStore.ts`:
 *
 *   - start / focus / submit / advance / undo / redo of study sessions
 *   - hint usage marking
 *   - ritual submission + cooldown gating
 *
 * Atomicity invariant: every public action's mutation phase is a single
 * synchronous block. All `setState` calls are contiguous. Events are
 * emitted only after the final write so subscribers observe a consistent
 * post-mutation state.
 *
 * Buff catalog actions (`grantBuffFromCatalog` / `toggleBuffFromCatalog`)
 * are pure single-store mutations and live as thin module-level helpers
 * colocated with `stores/buffStore.ts` -- they are NOT part of this
 * orchestrator.
 *
 * Buff merge primitives (`dedupeBuffsById`, `normalizeActiveBuffs`) are
 * imported from `../buffs/buffMerge` so this file, `stores/buffStore.ts`,
 * and `orchestrators/crystalGardenOrchestrator.ts` share a single
 * interface (fix #4 of the progression monolith verification plan).
 */

import { cardRefKey, parseCardRefKey } from '@/lib/topicRef';
import { appEventBus } from '@/infrastructure/eventBus';
import { calculateLevelFromXP } from '@/types/crystalLevel';
import type { Card, TopicRef } from '@/types/core';
import {
	type AttunementRitualPayload,
	type AttunementRitualResult,
	type CoarseChoice,
	type CoarseRatingResult,
	type CoarseReviewMeta,
	type ProgressionState,
	type Rating,
	type StudySessionAttempt,
} from '@/types/progression';
import {
	computeTrialGatedStudyReward,
	useCrystalTrialStore,
} from '@/features/crystalTrial';
import {
	buildStudySessionMetrics,
	makeRitualSessionId,
	makeStudySessionId,
} from '@/features/analytics/attunementMetrics';

import { useBuffStore } from '../stores/buffStore';
import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import { useSM2Store } from '../stores/sm2Store';
import {
	ATTUNEMENT_SUBMISSION_COOLDOWN_MS,
	useStudySessionStore,
} from '../stores/studySessionStore';
import {
	applyCrystalXpDelta,
	calculateXPReward,
} from '../policies/crystalLeveling';
import { attachSm2, filterCardsByDifficulty } from '../policies/sessionPolicy';
import { resolveCoarseRating } from '../policies/coarseRating';
import {
	calculateRitualHarmony,
	deriveRitualBuffs,
} from '../policies/progressionRitual';
import { BuffEngine } from '../buffs/buffEngine';
import { normalizeActiveBuffs } from '../buffs/buffMerge';
import { defaultSM2, sm2 } from '../policies/sm2';
import { undoManager } from '../undoManager';

// ---------------------------------------------------------------------------
// Cross-store snapshot helpers
//
// The undo manager still expects a `ProgressionState`-shaped argument -- that
// API stays stable until Phase 4 step 17 rewrites it as a pure stack. These
// helpers bridge the new four-store shape with the old monolith shape.
// ---------------------------------------------------------------------------

function snapshotProgressionStateFromStores(): ProgressionState {
	const cg = useCrystalGardenStore.getState();
	const ss = useStudySessionStore.getState();
	const sm = useSM2Store.getState();
	const buff = useBuffStore.getState();
	return {
		activeCrystals: cg.activeCrystals,
		sm2Data: sm.sm2Data,
		unlockPoints: cg.unlockPoints,
		resonancePoints: cg.resonancePoints,
		currentSubjectId: ss.currentSubjectId,
		currentSession: ss.currentSession,
		activeBuffs: buff.activeBuffs,
		pendingRitual: ss.pendingRitual,
		lastRitualSubmittedAt: ss.lastRitualSubmittedAt,
	};
}

/**
 * Apply a partial restored ProgressionState back into the four stores.
 * Single contiguous setState block per the atomicity invariant.
 */
function applyRestoredState(restored: Partial<ProgressionState>): void {
	if (restored.sm2Data !== undefined) {
		useSM2Store.setState({ sm2Data: restored.sm2Data });
	}
	const cgPatch: Partial<{
		activeCrystals: ProgressionState['activeCrystals'];
		unlockPoints: number;
		resonancePoints: number;
	}> = {};
	if (restored.activeCrystals !== undefined) cgPatch.activeCrystals = restored.activeCrystals;
	if (restored.unlockPoints !== undefined) cgPatch.unlockPoints = restored.unlockPoints;
	if (restored.resonancePoints !== undefined) cgPatch.resonancePoints = restored.resonancePoints;
	if (Object.keys(cgPatch).length > 0) {
		useCrystalGardenStore.setState(cgPatch);
	}
	if (restored.currentSession !== undefined) {
		useStudySessionStore.setState({ currentSession: restored.currentSession });
	}
	if (restored.activeBuffs !== undefined) {
		useBuffStore.setState({ activeBuffs: restored.activeBuffs });
	}
}

// ---------------------------------------------------------------------------
// Subject viewport (UI signal stored on studySessionStore, see store comment).
// ---------------------------------------------------------------------------

export function setCurrentSubject(subjectId: string | null): void {
	useStudySessionStore.setState({ currentSubjectId: subjectId });
}

// ---------------------------------------------------------------------------
// Study-session lifecycle
// ---------------------------------------------------------------------------

export function startTopicStudySession(ref: TopicRef, cards: Card[]): void {
	const cg = useCrystalGardenStore.getState();
	const ss = useStudySessionStore.getState();
	const sm = useSM2Store.getState();
	const buff = useBuffStore.getState();

	const crystal = cg.activeCrystals.find(
		(item) => item.subjectId === ref.subjectId && item.topicId === ref.topicId,
	);
	const level = calculateLevelFromXP(crystal?.xp ?? 0);
	const sm2Augmented = attachSm2(ref, cards, sm.sm2Data);
	const hydratedBuffs = buff.activeBuffs.map((b) => BuffEngine.get().hydrateBuff(b));
	const growthBoost = BuffEngine.get().getModifierTotal('growth_speed', hydratedBuffs);
	const difficultyBoost = Math.max(0, Math.floor(growthBoost * 10) - 1);
	const maxDifficulty = Math.min(level + 1 + difficultyBoost, 4);
	const gatedCards = filterCardsByDifficulty(sm2Augmented, maxDifficulty);
	const dueCards = sm2.getDueCards(gatedCards);
	const queue = (dueCards.length > 0 ? dueCards : gatedCards).map((card) =>
		cardRefKey({ ...ref, cardId: card.id }),
	);
	const cardDifficultyById = sm2Augmented.reduce<Record<string, number>>((acc, card) => {
		acc[card.id] = card.difficulty;
		return acc;
	}, {});
	const cardTypeById = cards.reduce<Record<string, string>>((acc, card) => {
		acc[card.id] = card.type;
		return acc;
	}, {});
	const pending = ss.pendingRitual;
	// Fix #3: the same gate decides BOTH whether to adopt the pending
	// ritual's sessionId and whether to clear it. Starting topic-B must
	// not destroy a queued ritual for topic-A.
	const pendingMatchesTopic =
		pending?.subjectId === ref.subjectId && pending?.topicId === ref.topicId;
	const sessionId = pendingMatchesTopic
		? pending!.sessionId
		: makeStudySessionId(ref);
	const startedAt = Date.now();
	const activeBuffIds = buff.activeBuffs.map((b) => b.buffId);

	undoManager.reset();

	useStudySessionStore.setState({
		currentSession: {
			subjectId: ref.subjectId,
			topicId: ref.topicId,
			queueCardIds: queue,
			currentCardId: queue[0] ?? null,
			totalCards: queue.length,
			sessionId,
			startedAt,
			lastCardStart: startedAt,
			activeBuffIds,
			attempts: [],
			cardDifficultyById,
			cardTypeById,
			hintUsedByCardId: {},
		},
		// Only consume the pending ritual when it belongs to the topic
		// we're starting; otherwise leave it intact for its owning topic.
		...(pendingMatchesTopic ? { pendingRitual: null } : {}),
	});

	appEventBus.emit('study-panel:history-applied', {
		action: 'submit',
		subjectId: ref.subjectId,
		topicId: ref.topicId,
		sessionId,
		undoCount: undoManager.undoStackSize,
		redoCount: undoManager.redoStackSize,
	});
}

/**
 * Focus a specific card within the current topic's study session.
 *
 * Fix #2: when an active session for the same topic already exists,
 * preserve all session state -- attempts, sessionId, startedAt,
 * activeBuffIds, hintUsedByCardId, undo stack, etc. -- and just fold
 * the requested card into the queue (in-place if already queued,
 * prepended otherwise). Only when there is no active session, or the
 * active session belongs to a different topic, is
 * `startTopicStudySession` invoked. That single fresh-session path is
 * the only thing that resets the per-session bookkeeping.
 */
export function focusStudyCard(
	ref: TopicRef,
	cards: Card[],
	focusCardId: string | null = null,
): void {
	const priorSession = useStudySessionStore.getState().currentSession;
	const sameTopicActiveSession =
		priorSession !== null &&
		priorSession.subjectId === ref.subjectId &&
		priorSession.topicId === ref.topicId;

	if (!sameTopicActiveSession) {
		// Fresh-session path: no active session, or it belongs to a
		// different topic. `startTopicStudySession` rebuilds the queue,
		// resets attempts/undo/etc. This is the only branch that
		// destroys per-session bookkeeping.
		startTopicStudySession(ref, cards);
		if (!focusCardId) {
			return;
		}

		const fresh = useStudySessionStore.getState().currentSession;
		if (
			!fresh ||
			fresh.subjectId !== ref.subjectId ||
			fresh.topicId !== ref.topicId
		) {
			return;
		}
		if (!cards.some((card) => card.id === focusCardId)) {
			return;
		}

		const focusKey = cardRefKey({ ...ref, cardId: focusCardId });
		if (fresh.queueCardIds.includes(focusKey)) {
			useStudySessionStore.setState({
				currentSession: { ...fresh, currentCardId: focusKey },
			});
			return;
		}

		const freshQueue = [
			focusKey,
			...fresh.queueCardIds.filter((id) => id !== focusKey),
		];
		useStudySessionStore.setState({
			currentSession: {
				...fresh,
				queueCardIds: freshQueue,
				currentCardId: focusKey,
				totalCards: freshQueue.length,
			},
		});
		return;
	}

	// Same-topic in-flight session: PRESERVE state. Re-entering
	// `focusStudyCard` with no focus target (e.g. a duplicate "open
	// study panel" event) is a no-op -- not a session restart.
	if (!focusCardId) {
		return;
	}
	if (!cards.some((card) => card.id === focusCardId)) {
		return;
	}

	const focusKey = cardRefKey({ ...ref, cardId: focusCardId });
	const now = Date.now();

	// Merge incoming card metadata. New entries (deck expanded since the
	// session started -- e.g. level-up triggered expansion) take their
	// values from the fresh `cards` list; existing entries are preserved
	// so we never overwrite metadata for cards already in the session.
	const incomingDifficulty = cards.reduce<Record<string, number>>((acc, card) => {
		acc[card.id] = card.difficulty;
		return acc;
	}, {});
	const incomingType = cards.reduce<Record<string, string>>((acc, card) => {
		acc[card.id] = card.type;
		return acc;
	}, {});
	const mergedCardDifficultyById: Record<string, number> = {
		...incomingDifficulty,
		...(priorSession.cardDifficultyById ?? {}),
	};
	const mergedCardTypeById: Record<string, string> = {
		...incomingType,
		...(priorSession.cardTypeById ?? {}),
	};

	if (priorSession.queueCardIds.includes(focusKey)) {
		// Already queued: shift focus only, preserve queue order so any
		// reordering the player did via the timeline survives. Refresh
		// `lastCardStart` so per-card timing measures from "now".
		useStudySessionStore.setState({
			currentSession: {
				...priorSession,
				currentCardId: focusKey,
				lastCardStart: now,
				cardDifficultyById: mergedCardDifficultyById,
				cardTypeById: mergedCardTypeById,
			},
		});
		return;
	}

	// Not yet queued (e.g. the player re-opened the study panel for a
	// card that wasn't due originally): prepend the focus card. The
	// total card count grows by one so the progress UI reflects the new
	// queue length. `attempts` is preserved -- already-reviewed cards
	// stay reviewed.
	const nextQueue = [focusKey, ...priorSession.queueCardIds];
	useStudySessionStore.setState({
		currentSession: {
			...priorSession,
			queueCardIds: nextQueue,
			currentCardId: focusKey,
			totalCards: nextQueue.length,
			lastCardStart: now,
			cardDifficultyById: mergedCardDifficultyById,
			cardTypeById: mergedCardTypeById,
		},
	});
}

// ---------------------------------------------------------------------------
// Submit / coarse-submit / hint
// ---------------------------------------------------------------------------

function submitResolvedStudyResult(
	cardRefKeyStr: string,
	rating: Rating,
	meta?: CoarseReviewMeta,
): void {
	const ss = useStudySessionStore.getState();
	const session = ss.currentSession;
	if (!session || session.currentCardId !== cardRefKeyStr) {
		return;
	}
	const hasAttemptedCurrentCard = (session.attempts ?? []).some(
		(attempt) => attempt.cardId === cardRefKeyStr,
	);
	if (hasAttemptedCurrentCard) {
		return;
	}

	const cg = useCrystalGardenStore.getState();
	const sm = useSM2Store.getState();
	const buff = useBuffStore.getState();

	const crystal = cg.activeCrystals.find(
		(item) => item.subjectId === session.subjectId && item.topicId === session.topicId,
	);
	if (!crystal) {
		return;
	}

	const now = Date.now();
	const timeTakenMs = Math.max(0, now - (session.lastCardStart ?? now));

	const { cardId: rawCardId } = parseCardRefKey(cardRefKeyStr);
	const previousSM2 = sm.sm2Data[cardRefKeyStr] || defaultSM2;
	const updatedSM2 = sm2.calculateNextReview(previousSM2, rating);
	const cardFormatType = session.cardTypeById?.[rawCardId];
	const reward = calculateXPReward(cardFormatType, rating);
	const hydratedBuffs = buff.activeBuffs.map((b) => BuffEngine.get().hydrateBuff(b));
	const buffMultiplier = BuffEngine.get().getModifierTotal('xp_multiplier', hydratedBuffs);
	const buffedReward = Math.max(0, Math.round(reward * buffMultiplier));

	const ref: TopicRef = { subjectId: session.subjectId, topicId: session.topicId };
	const previousXp = crystal.xp;
	const currentLevel = calculateLevelFromXP(previousXp);
	const trialGating = computeTrialGatedStudyReward({
		previousXp,
		rawReward: buffedReward,
		trialStatus: useCrystalTrialStore.getState().getTrialStatus(ref),
		currentLevel,
	});
	const effectiveReward = trialGating.effectiveReward;

	const applied = applyCrystalXpDelta(cg.activeCrystals, ref, effectiveReward);
	if (!applied) {
		return;
	}

	// Capture undo BEFORE any store mutation so the snapshot reflects pre-state.
	undoManager.capture(snapshotProgressionStateFromStores());

	const difficulty = session.cardDifficultyById?.[rawCardId] ?? 1;
	const isCorrect = rating >= 3;
	const nextResonance = isCorrect ? cg.resonancePoints + 1 : cg.resonancePoints;
	const sessionId = session.sessionId ?? makeStudySessionId(ref);
	const attempt: StudySessionAttempt = {
		cardId: cardRefKeyStr,
		rating,
		difficulty,
		timestamp: now,
		isCorrect,
		coarseChoice: meta?.coarseChoice,
		hintUsed: meta?.hintUsed,
		appliedBucket: meta?.appliedBucket,
		timeTakenMs: meta?.timeTakenMs,
	};
	const nextAttempts = [...(session.attempts ?? []), attempt];
	const buffsAfterUsage = BuffEngine.get().consumeForEvent(hydratedBuffs, 'card_reviewed');
	const isSessionComplete = nextAttempts.length >= session.totalCards;
	const nextBuffs = isSessionComplete
		? BuffEngine.get().consumeForEvent(buffsAfterUsage, 'session_ended')
		: buffsAfterUsage;
	const sessionMetrics = isSessionComplete
		? buildStudySessionMetrics(
				sessionId,
				session.topicId,
				nextAttempts,
				session.startedAt ?? now,
			)
		: null;

	// --- Single contiguous setState block across four stores ---
	useCrystalGardenStore.setState({
		activeCrystals: applied.nextActiveCrystals,
		unlockPoints:
			applied.levelsGained > 0 ? cg.unlockPoints + applied.levelsGained : cg.unlockPoints,
		resonancePoints: nextResonance,
	});
	useSM2Store.setState({
		sm2Data: { ...sm.sm2Data, [cardRefKeyStr]: updatedSM2 },
	});
	useStudySessionStore.setState({
		currentSession: {
			...session,
			attempts: nextAttempts,
			lastCardStart: now,
		},
	});
	useBuffStore.setState({ activeBuffs: nextBuffs });
	// --- End mutation phase ---

	appEventBus.emit('card:reviewed', {
		cardId: cardRefKeyStr,
		rating,
		subjectId: session.subjectId,
		topicId: session.topicId,
		sessionId,
		timeTakenMs,
		buffedReward: effectiveReward,
		buffMultiplier,
		difficulty,
		isCorrect,
		coarseChoice: meta?.coarseChoice,
		hintUsed: meta?.hintUsed,
		appliedBucket: meta?.appliedBucket,
	});

	if (applied.levelsGained > 0) {
		appEventBus.emit('crystal:leveled', {
			subjectId: session.subjectId,
			topicId: session.topicId,
			from: applied.previousLevel,
			to: applied.nextLevel,
			levelsGained: applied.levelsGained,
			sessionId,
		});
	}

	if (trialGating.shouldPregenerate) {
		appEventBus.emit('crystal-trial:pregeneration-requested', {
			subjectId: ref.subjectId,
			topicId: ref.topicId,
			currentLevel,
			targetLevel: currentLevel + 1,
		});
	}

	if (isSessionComplete && sessionMetrics) {
		appEventBus.emit('session:completed', {
			subjectId: session.subjectId,
			topicId: session.topicId,
			sessionId,
			correctRate: sessionMetrics.correctRate,
			sessionDurationMs: sessionMetrics.sessionDurationMs,
			totalAttempts: sessionMetrics.cardsCompleted,
		});
	}
}

export function submitStudyResult(cardRefKeyStr: string, rating: Rating): void {
	submitResolvedStudyResult(cardRefKeyStr, rating);
}

export function submitCoarseStudyResult(
	cardRefKeyStr: string,
	coarseChoice: CoarseChoice,
): CoarseRatingResult | null {
	const session = useStudySessionStore.getState().currentSession;
	if (!session || session.currentCardId !== cardRefKeyStr) {
		return null;
	}

	const now = Date.now();
	const timeTakenMs = Math.max(0, now - (session.lastCardStart ?? now));
	const { cardId } = parseCardRefKey(cardRefKeyStr);
	const hintUsed = Boolean(session.hintUsedByCardId?.[cardId]);
	const difficulty = session.cardDifficultyById?.[cardId] ?? 1;
	const resolved = resolveCoarseRating({
		coarse: coarseChoice,
		timeTakenMs,
		hintUsed,
		difficulty,
	});

	submitResolvedStudyResult(cardRefKeyStr, resolved.rating, {
		coarseChoice,
		hintUsed,
		appliedBucket: resolved.appliedBucket,
		timeTakenMs,
	});

	return resolved;
}

export function markHintUsed(cardRefKeyStr: string): void {
	const session = useStudySessionStore.getState().currentSession;
	if (!session || session.currentCardId !== cardRefKeyStr) {
		return;
	}
	const alreadySubmitted = (session.attempts ?? []).some(
		(attempt) => attempt.cardId === cardRefKeyStr,
	);
	if (alreadySubmitted) {
		return;
	}
	const { cardId } = parseCardRefKey(cardRefKeyStr);
	if (session.hintUsedByCardId?.[cardId]) {
		return;
	}

	useStudySessionStore.setState({
		currentSession: {
			...session,
			hintUsedByCardId: { ...(session.hintUsedByCardId ?? {}), [cardId]: true },
		},
	});
}

export function advanceStudyAfterReveal(): void {
	const session = useStudySessionStore.getState().currentSession;
	if (!session || !session.currentCardId) {
		return;
	}
	if (!session.queueCardIds.includes(session.currentCardId)) {
		return;
	}
	const nextQueue = session.queueCardIds.filter((id) => id !== session.currentCardId);
	const nextCard = nextQueue[0] ?? null;
	const now = Date.now();

	useStudySessionStore.setState({
		currentSession: {
			...session,
			queueCardIds: nextQueue,
			currentCardId: nextCard,
			...(nextQueue.length > 0 ? { lastCardStart: now } : {}),
		},
	});
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

function emitHistoryEventOrThrow(
	action: 'undo' | 'redo',
	restored: Partial<ProgressionState>,
): void {
	const topicId = restored.currentSession?.topicId;
	const subjectId = restored.currentSession?.subjectId;
	const sessionId = restored.currentSession?.sessionId;
	if (!topicId?.trim() || !sessionId?.trim() || !subjectId?.trim()) {
		throw new Error(
			`${action}LastStudyResult: restored session missing subjectId, topicId or sessionId`,
		);
	}
	appEventBus.emit('study-panel:history-applied', {
		action,
		subjectId,
		topicId,
		sessionId,
		undoCount: undoManager.undoStackSize,
		redoCount: undoManager.redoStackSize,
	});
}

export function undoLastStudyResult(): void {
	const restored = undoManager.undo(snapshotProgressionStateFromStores());
	if (!restored) {
		return;
	}
	applyRestoredState(restored);
	emitHistoryEventOrThrow('undo', restored);
}

export function redoLastStudyResult(): void {
	const restored = undoManager.redo(snapshotProgressionStateFromStores());
	if (!restored) {
		return;
	}
	applyRestoredState(restored);
	emitHistoryEventOrThrow('redo', restored);
}

// ---------------------------------------------------------------------------
// Ritual flow (cooldown gate lives on studySessionStore, see store comment).
// ---------------------------------------------------------------------------

export function openRitualForTopic(ref: TopicRef, cards: Card[]): void {
	useStudySessionStore.setState({
		pendingRitual: {
			subjectId: ref.subjectId,
			topicId: ref.topicId,
			cards,
			sessionId: makeRitualSessionId(ref),
		},
	});
}

export function clearPendingRitual(): void {
	useStudySessionStore.setState({ pendingRitual: null });
}

export function clearActiveBuffs(): void {
	useBuffStore.setState({ activeBuffs: [] });
}

export function getRemainingRitualCooldownMs(atMs: number): number {
	const last = useStudySessionStore.getState().lastRitualSubmittedAt;
	if (!last) {
		return 0;
	}
	return Math.max(0, ATTUNEMENT_SUBMISSION_COOLDOWN_MS - (atMs - last));
}

export function submitAttunementRitual(
	payload: AttunementRitualPayload,
): AttunementRitualResult | null {
	const ss = useStudySessionStore.getState();
	const buff = useBuffStore.getState();
	const now = Date.now();

	if (
		ss.lastRitualSubmittedAt &&
		now - ss.lastRitualSubmittedAt < ATTUNEMENT_SUBMISSION_COOLDOWN_MS
	) {
		return null;
	}

	const pending = ss.pendingRitual;
	const sessionId =
		pending?.subjectId === payload.subjectId && pending?.topicId === payload.topicId
			? pending.sessionId
			: makeRitualSessionId({ subjectId: payload.subjectId, topicId: payload.topicId });

	const nextPending = {
		subjectId: payload.subjectId,
		topicId: payload.topicId,
		cards: [],
		sessionId,
	};
	const { harmonyScore, readinessBucket } = calculateRitualHarmony(payload.checklist);
	const buffs = deriveRitualBuffs(payload);

	// --- Single contiguous setState block ---
	useBuffStore.setState({
		activeBuffs: normalizeActiveBuffs(buff.activeBuffs, buffs),
	});
	useStudySessionStore.setState({
		pendingRitual: nextPending,
		lastRitualSubmittedAt: now,
	});
	// --- End mutation phase ---

	const checklistKeys = Object.keys(payload.checklist).filter((k) =>
		Boolean(payload.checklist[k as keyof typeof payload.checklist]),
	);

	appEventBus.emit('attunement-ritual:submitted', {
		subjectId: payload.subjectId,
		topicId: payload.topicId,
		harmonyScore,
		readinessBucket,
		checklistKeys,
		buffsGranted: buffs,
	});

	return { harmonyScore, readinessBucket, buffs };
}
