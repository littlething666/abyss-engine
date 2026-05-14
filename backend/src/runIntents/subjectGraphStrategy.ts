export type StudyGoal = 'curiosity' | 'exam-prep' | 'career-switch' | 'refresh';
export type PriorKnowledge = 'none' | 'beginner' | 'intermediate' | 'advanced';
export type LearningStyle = 'balanced' | 'theory-heavy' | 'practice-heavy';

export interface SubjectGraphStudyChecklist {
  topicName: string;
  studyGoal?: StudyGoal;
  priorKnowledge?: PriorKnowledge;
  learningStyle?: LearningStyle;
  focusAreas?: string;
}

export interface SubjectGraphStrategyBrief {
  total_tiers: number;
  topics_per_tier: number;
  audience_brief: string;
  domain_brief: string;
  focus_constraints: string;
}

const STUDY_CHECKLIST_DEFAULTS: Required<Omit<SubjectGraphStudyChecklist, 'topicName' | 'focusAreas'>> = {
  studyGoal: 'curiosity',
  priorKnowledge: 'none',
  learningStyle: 'balanced',
};

function buildGraphBrief(params: {
  goal: StudyGoal;
  knowledge: PriorKnowledge;
  style: LearningStyle;
  topicName: string;
}): string {
  const { goal, knowledge, style, topicName } = params;

  const knowledgeLine =
    knowledge === 'none'
      ? 'Assume no prior domain knowledge unless the topic name implies otherwise.'
      : knowledge === 'beginner'
        ? 'The learner has beginner exposure; avoid jargon without definition.'
        : knowledge === 'intermediate'
          ? 'The learner has working familiarity; you may connect ideas across subtopics.'
          : 'The learner is advanced; emphasize depth, tradeoffs, and synthesis.';

  const goalLine =
    goal === 'curiosity'
      ? 'Motivation is exploration and understanding, not a credential.'
      : goal === 'exam-prep'
        ? 'Structure supports exam-style recall and careful distinction of similar concepts.'
        : goal === 'career-switch'
          ? 'Emphasize practical literacy and skills that transfer to professional contexts.'
          : 'Assume the learner is refreshing memory; prioritize clarity and efficient coverage.';

  const styleLine =
    style === 'balanced'
      ? 'Balance conceptual structure with applied examples.'
      : style === 'theory-heavy'
        ? 'Favor conceptual foundations, definitions, and principled ordering of ideas.'
        : 'Favor applied topics, drills, and concrete scenarios while keeping prerequisites strict.';

  return [
    `Generate a curriculum graph for "${topicName}".`,
    goalLine,
    knowledgeLine,
    styleLine,
    'Use exactly three tiers: Tier 1 foundational vocabulary and core concepts; Tier 2 applied understanding building on Tier 1; Tier 3 synthesis and cross-topic connections grounded in Tier 2.',
    'Respect prerequisite rules from the system prompt: Tier 1 has no prerequisites; higher tiers only reference lower tiers.',
  ].join(' ');
}

export function resolveSubjectGraphStrategyBrief(checklist: SubjectGraphStudyChecklist): SubjectGraphStrategyBrief {
  const goal = checklist.studyGoal ?? STUDY_CHECKLIST_DEFAULTS.studyGoal;
  const knowledge = checklist.priorKnowledge ?? STUDY_CHECKLIST_DEFAULTS.priorKnowledge;
  const style = checklist.learningStyle ?? STUDY_CHECKLIST_DEFAULTS.learningStyle;

  return {
    total_tiers: 3,
    topics_per_tier: 5,
    audience_brief: buildGraphBrief({ goal, knowledge, style, topicName: checklist.topicName }),
    domain_brief: checklist.topicName,
    focus_constraints: checklist.focusAreas ?? '',
  };
}
