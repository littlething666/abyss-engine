import type { MentorTriggerId, MentorVoiceId } from './mentorTypes';

type NonEmptyStringTuple = readonly [string, ...string[]];

export type LineCatalog = Record<
  MentorTriggerId,
  Record<MentorVoiceId, NonEmptyStringTuple>
>;

const en: LineCatalog = {
  'onboarding.welcome': {
    'witty-sarcastic': [
      "Oh. A new test subject. Hello. I'm contractually required to be encouraging. Let's get this over with — pleasantly.",
    ],
  },
  'onboarding.first_subject': {
    'witty-sarcastic': [
      "Step one: pick a thing to learn. Step two — well, we'll cross that abyss when you finish step one. Try the Wisdom Altar.",
      "Nothing on the curriculum yet. The altar takes inputs. Throw it a topic and see what happens.",
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
  'crystal.trial.awaiting': {
    'witty-sarcastic': [
      "{topic} is ready for its trial, {name}. Try not to embarrass either of us.",
      "Trial is queued for {topic}. The rules haven't changed. The questions, on the other hand…",
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
