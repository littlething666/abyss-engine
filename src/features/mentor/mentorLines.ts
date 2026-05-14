import type { MentorTriggerId, MentorVoiceId } from './mentorTypes';

type NonEmptyStringTuple = readonly [string, ...string[]];

export type LineCatalog = Record<
  MentorTriggerId,
  Record<MentorVoiceId, NonEmptyStringTuple>
>;

// Default mentor line catalog keyed by trigger. Stage-specific copy for
// `subject:generation-started` and named/unnamed greet copy for
// `onboarding:pre-first-subject` live in mentor-private pools below; this
// catalog still holds a default fallback line per trigger for callers that
// do not pass a stage / branch.
const en: LineCatalog = {
  'onboarding:pre-first-subject': {
    'witty-sarcastic': [
      // Fallback (matches the unnamed-greet line). The rule engine selects
      // the appropriate branch via getOnboardingPreFirstSubjectGreet().
      "Oh. A new test subject. Hello. I'm contractually required to be encouraging. Let's get this over with — pleasantly.",
    ],
  },
  'onboarding:subject-unlock-first-crystal': {
    'witty-sarcastic': [
      "{subjectName} is a curriculum now, but a curriculum is just paperwork until you actually pick a topic. Shall we?",
      "Your {subjectName} crystals are arranged and waiting. Pick one to unlock — the abyss enjoys decisive subjects.",
      "Topics for {subjectName} are racked and locked. Open Discovery and free one before we both lose interest, {name}.",
    ],
  },
  'session:completed': {
    'witty-sarcastic': [
      "Session over. Statistics suggest you got {correctRate} of {totalAttempts} right. Statistics also lie occasionally.",
      "Well, you survived another round. Don't let it go to your head — there are more cards.",
      "Done. Take a breath, stretch, pretend you meant to get those wrong.",
    ],
  },
  'crystal:leveled': {
    'witty-sarcastic': [
      "Level {to}. Up from {from}. Numbers go up. Morale, allegedly, follows.",
      "Crystal advanced to level {to}. The crystal is unimpressed but tolerant.",
      "Level {to}. I'd throw confetti, but the budget is finite and the confetti is canned.",
    ],
  },
  'crystal-trial:available-for-player': {
    'witty-sarcastic': [
      "{topic}'s trial is available, {name}. Try not to embarrass either of us.",
      "Trial available for {topic}. The rules haven't changed. The questions, on the other hand…",
    ],
  },
  'subject:generation-started': {
    'witty-sarcastic': [
      'I have begun assembling {subjectName}. The machinery is humming, which is either progress or a small administrative omen. Backend workflows are tracking it now.',
      '{subjectName} is entering the curriculum apparatus. If anything sparks, the backend run log will have the paperwork.',
      'Good news: {subjectName} is being generated. Better news: the backend workflow is tracking it, so neither of us has to pretend this silence is suspense.',
    ],
  },
  'subject:generated': {
    'witty-sarcastic': [
      '{subjectName} has been planted. Please admire the curriculum from a respectful distance until the crystals develop an ego.',
      'Curriculum complete: {subjectName}. The abyss has accepted your offering and returned a syllabus, because apparently that is how this place flirts.',
      '{subjectName} is now a crystal syllabus. Somehow, this is progress. I checked the form twice.',
      'Subject generated: {subjectName}. The graph exists, the locks exist, and your future excuses are already losing structural integrity.',
    ],
  },
  'subject:generation-failed': {
    'witty-sarcastic': [
      '{subjectName} hit a generation fault. The backend run log kept receipts; request generation again when ready.',
      '{subjectName} did not survive the apparatus. Before we blame the abyss, let the backend run diagnostics keep the evidence.',
      'The curriculum machine declined {subjectName}. Rude, but documented. Request generation again when the curriculum machine is ready.',
      'Generation paused itself with great confidence and poor results. {subjectName} needs attention in the backend run logs, where the diagnostics are having a very official little meeting.',
    ],
  },
  'mentor-bubble:clicked': {
    'witty-sarcastic': [
      "You rang? Or did you click on me by accident again, {name}?",
      'Reporting for duty. Unfortunately.',
      "Yes, hello. Yes, I'm still here. Yes, that's the joke.",
    ],
  },
  // Phase A: terminal-event copy for the new content-generation triggers.
  // Tone matches the witty-sarcastic mentor voice; copy stays blameless
  // and points the player at backend-owned diagnostics or the study panel as
  // appropriate. 3 variants per failure trigger; 2 for topic-ready.
  'topic-content:generation-failed': {
    'witty-sarcastic': [
      "{topicLabel} stalled mid-generation. Backend diagnostics have the gory details.",
      'The apparatus declined {topicLabel}. Polite about it, but firm. Request generation again when ready.',
      "Generation hiccupped on {topicLabel}. Nothing's lost — the backend diagnostics are keeping the receipts.",
    ],
  },
  'topic-content:generation-ready': {
    'witty-sarcastic': [
      '{topicLabel} is ready to study. Crack it open before the abyss reorganizes its filing cabinet again.',
      'The questions for {topicLabel} are warmed up. Shall we put them to work?',
    ],
  },
  'topic-expansion:generation-failed': {
    'witty-sarcastic': [
      "{topicLabel}'s level {level} expansion stalled. Backend diagnostics have the breakdown.",
      'Expansion to level {level} for {topicLabel} hit a snag. Request generation again whenever the abyss is in a better mood.',
      "Couldn't quite plant the level {level} cards for {topicLabel}. Request generation again when the backend is ready.",
    ],
  },
  'crystal-trial:generation-failed': {
    'witty-sarcastic': [
      "{topicLabel}'s trial questions failed to compile. Backend diagnostics have the failed job; another attempt starts from the trial request.",
      'Trial generation for {topicLabel} fizzled. Request trial generation again if you want to coax it.',
      'The abyss declined to author this round of trial questions for {topicLabel}. Try again from the trial request.',
    ],
  },
  'content-generation:retry-failed': {
    'witty-sarcastic': [
      "Retry routing collapsed on {jobLabel}. Backend diagnostics have the trail if you want to tell me which knob to turn.",
      "{jobLabel} ran out of retry runway. Request generation again; I'll wait here, judging quietly.",
      "We pushed every retry button {jobLabel} had. Backend diagnostics know what's left to try.",
    ],
  },
};

// Mentor-private greet pools for `onboarding:pre-first-subject`. Distinct
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

// Mentor-private stage-specific variant pools for `subject:generation-started`.
// Selected when payload.stage is provided; the rule engine falls back to the
// default pool in `mentorLines` when no stage is supplied.
const subjectGenerationStartedStageLines: Record<
  'topics' | 'edges',
  Record<MentorVoiceId, NonEmptyStringTuple>
> = {
  topics: {
    'witty-sarcastic': [
      'Drafting the topic lattice for {subjectName}. Backend diagnostics are keeping receipts; you may resume worrying productively.',
      '{subjectName} is having its topics generated. The bureaucracy is loud but functional. Backend workflows are tracking it.',
      'Topic outline incoming for {subjectName}. The abyss has been polite about it so far. Backend diagnostics will tell you if that changes.',
    ],
  },
  edges: {
    'witty-sarcastic': [
      'Topics for {subjectName} are wired; we are now connecting prerequisites. Backend diagnostics will narrate, sparingly.',
      'Edges are being threaded through {subjectName}. If a topic looks lonely, do not worry — that is its current job.',
      'Wiring up the prerequisite graph for {subjectName}. Backend diagnostics will know before either of us does when it lands.',
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

/** Pick a stage-specific variant for `subject:generation-started`. */
export function getSubjectGenerationStartedStageLine(
  _locale: 'en',
  voiceId: MentorVoiceId,
  stage: 'topics' | 'edges',
  variantIndex: number,
): string {
  const variants = subjectGenerationStartedStageLines[stage][voiceId];
  return variants[variantIndex % variants.length] ?? variants[0]!;
}
