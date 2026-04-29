import type { MentorTriggerId, MentorVoiceId } from './mentorTypes';

type NonEmptyStringTuple = readonly [string, ...string[]];

export type LineCatalog = Record<
  MentorTriggerId,
  Record<MentorVoiceId, NonEmptyStringTuple>
>;

// Default mentor line catalog keyed by trigger. Stage-specific copy for
// `subject.generation.started` and named/unnamed greet copy for
// `onboarding.pre_first_subject` live in mentor-private pools below; this
// catalog still holds a default fallback line per trigger for callers that
// do not pass a stage / branch.
const en: LineCatalog = {
  'onboarding.pre_first_subject': {
    'witty-sarcastic': [
      // Fallback (matches the unnamed-greet line). The rule engine selects
      // the appropriate branch via getOnboardingPreFirstSubjectGreet().
      "Oh. A new test subject. Hello. I'm contractually required to be encouraging. Let's get this over with — pleasantly.",
    ],
  },
  'onboarding.subject_unlock_first_crystal': {
    'witty-sarcastic': [
      "{subjectName} is a curriculum now, but a curriculum is just paperwork until you actually pick a topic. Shall we?",
      "Your {subjectName} crystals are arranged and waiting. Pick one to unlock — the abyss enjoys decisive subjects.",
      "Topics for {subjectName} are racked and locked. Open Discovery and free one before we both lose interest, {name}.",
    ],
  },
  'session.completed': {
    'witty-sarcastic': [
      "Session over. Statistics suggest you got {correctRate} of {totalAttempts} right. Statistics also lie occasionally.",
      "Well, you survived another round. Don't let it go to your head — there are more cards.",
      "Done. Take a breath, stretch, pretend you meant to get those wrong.",
    ],
  },
  'crystal.leveled': {
    'witty-sarcastic': [
      "Level {to}. Up from {from}. Numbers go up. Morale, allegedly, follows.",
      "Crystal advanced to level {to}. The crystal is unimpressed but tolerant.",
      "Level {to}. I'd throw confetti, but the budget is finite and the confetti is canned.",
    ],
  },
  'crystal.trial.available_for_player': {
    'witty-sarcastic': [
      "{topic}'s trial is available, {name}. Try not to embarrass either of us.",
      "Trial available for {topic}. The rules haven't changed. The questions, on the other hand…",
    ],
  },
  'subject.generation.started': {
    'witty-sarcastic': [
      'I have begun assembling {subjectName}. The machinery is humming, which is either progress or a small administrative omen. Watch the generation HUD for details.',
      '{subjectName} is entering the curriculum apparatus. If anything sparks, the background generation HUD will make it look official.',
      'Good news: {subjectName} is being generated. Better news: the HUD is tracking it, so neither of us has to pretend this silence is suspense.',
    ],
  },
  'subject.generated': {
    'witty-sarcastic': [
      '{subjectName} has been planted. Please admire the curriculum from a respectful distance until the crystals develop an ego.',
      'Curriculum complete: {subjectName}. The abyss has accepted your offering and returned a syllabus, because apparently that is how this place flirts.',
      '{subjectName} is now a crystal syllabus. Somehow, this is progress. I checked the form twice.',
      'Subject generated: {subjectName}. The graph exists, the locks exist, and your future excuses are already losing structural integrity.',
    ],
  },
  'subject.generation.failed': {
    'witty-sarcastic': [
      '{subjectName} hit a generation fault. The good news is the HUD kept receipts. Open background generation and inspect the bureaucracy.',
      '{subjectName} did not survive the apparatus. Before we blame the abyss, check the generation HUD. It enjoys evidence.',
      'The curriculum machine declined {subjectName}. Rude, but documented. Open the background generation panel for the retry lever.',
      'Generation paused itself with great confidence and poor results. {subjectName} needs attention in the HUD, where the logs are having a very official little meeting.',
    ],
  },
  'mentor.bubble.click': {
    'witty-sarcastic': [
      "You rang? Or did you click on me by accident again, {name}?",
      'Reporting for duty. Unfortunately.',
      "Yes, hello. Yes, I'm still here. Yes, that's the joke.",
    ],
  },
};

// Mentor-private greet pools for `onboarding.pre_first_subject`. Distinct
// copy for unnamed (fresh player) vs named (returning player without first
// subject). Keeps onboarding applicable for returning players who saved a
// name but never enqueued their first subject.
const onboardingPreFirstSubjectGreets: Record<
  MentorVoiceId,
  { unnamed: NonEmptyStringTuple; named: NonEmptyStringTuple }
> = {
  'witty-sarcastic': {
    unnamed: [
      "Oh. A new test subject. Hello. I'm contractually required to be encouraging. Let's get this over with — pleasantly.",
    ],
    named: [
      "Back already, {name}? The paperwork survived your absence. Let's plant your first subject before the abyss notices.",
    ],
  },
};

// Mentor-private stage-specific variant pools for `subject.generation.started`.
// Selected when payload.stage is provided; the rule engine falls back to the
// default pool in `mentorLines` when no stage is supplied.
const subjectGenerationStartedStageLines: Record<
  'topics' | 'edges',
  Record<MentorVoiceId, NonEmptyStringTuple>
> = {
  topics: {
    'witty-sarcastic': [
      'Drafting the topic lattice for {subjectName}. The HUD is keeping receipts; you may resume worrying productively.',
      '{subjectName} is having its topics generated. The bureaucracy is loud but functional. Watch the generation HUD.',
      'Topic outline incoming for {subjectName}. The abyss has been polite about it so far. The HUD will tell you if that changes.',
    ],
  },
  edges: {
    'witty-sarcastic': [
      'Topics for {subjectName} are wired; we are now connecting prerequisites. The HUD will narrate, sparingly.',
      'Edges are being threaded through {subjectName}. If a topic looks lonely, do not worry — that is its current job.',
      'Wiring up the prerequisite graph for {subjectName}. The HUD will know before either of us does when it lands.',
    ],
  },
};

export const mentorLines: Record<'en', LineCatalog> = { en };

export function getMentorLine(
  locale: 'en',
  trigger: MentorTriggerId,
  voiceId: MentorVoiceId,
  variantIndex: number,
): string {
  const variants = mentorLines[locale][trigger][voiceId];
  return variants[variantIndex % variants.length] ?? variants[0]!;
}

/** Pick a greet variant from the appropriate onboarding branch. */
export function getOnboardingPreFirstSubjectGreet(
  _locale: 'en',
  voiceId: MentorVoiceId,
  branch: 'unnamed' | 'named',
  variantIndex: number,
): string {
  const variants = onboardingPreFirstSubjectGreets[voiceId][branch];
  return variants[variantIndex % variants.length] ?? variants[0]!;
}

/** Pick a stage-specific variant for `subject.generation.started`. */
export function getSubjectGenerationStartedStageLine(
  _locale: 'en',
  voiceId: MentorVoiceId,
  stage: 'topics' | 'edges',
  variantIndex: number,
): string {
  const variants = subjectGenerationStartedStageLines[stage][voiceId];
  return variants[variantIndex % variants.length] ?? variants[0]!;
}
