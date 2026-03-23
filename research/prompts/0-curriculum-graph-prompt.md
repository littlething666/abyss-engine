## Curriculum Graph

Act as an expert curriculum designer and data scientist. Your task is to build a curriculum graph for a cross-domain subject that mixes System Architecture Design, Robotics and Biotech.  The target audience ranges from university students to industry professionals.

Generate a curriculum graph for this subject using JSON in code block.

Requirements:

1. The subjectId is "system-architect-robotics-biotech".
2. Create exactly 15 topics divided evenly across 3 tiers (exactly 5 topics per tier).
3. Tier 1 topics should be foundational and have empty `prerequisites` arrays `[]`.
4. Tier 2 topics must list relevant Tier 1 `topicId`s as prerequisites.
5. Tier 3 topics must list relevant Tier 2 (and optionally Tier 1) `topicId`s as prerequisites.
6. The `topicId` should be lowercase, kebab-case (e.g., "core-architectural-patterns", "multi-robot-systems").
7. Output ONLY valid JSON matching the exact schema below, with no markdown formatting outside the JSON block.

Schema format to follow:

```

{
  "subjectId": "system-architect-robotics-biotech",
  "title": "Cross-Domain Systems Architecture, Robotics, Biotech",
  "themeId": "system-architect-robotics-biotech",
  "maxTier": 3,
  "nodes": [
    {
      "topicId": "example-topic",
      "title": "Example Topic",
      "tier": 1,
      "prerequisites": [],
      "learningObjective": "A clear, professional sentence describing what the learner will master."
    }
    // ... 14 more nodes
  ]
}
```


## Topic Cards Prompt

Act as an expert technical assessor. Generate the assessment cards for the topic: "Regression Analysis" (topicId: "regression-analysis"). The target audience is university students and professionals.

You must generate EXACTLY 25 cards for this topic, following these strict constraints:

1. Difficulty Distribution:
   - Exactly 10 cards at `difficulty: 1`
   - Exactly 10 cards at `difficulty: 2`
   - Exactly 5 cards at `difficulty: 3`

2. Type Distribution (Mix these evenly across the difficulties):
   - ~8 cards of type `FLASHCARD`
   - ~8 cards of type `SINGLE_CHOICE`
   - ~9 cards of type `MULTI_CHOICE`

3. ID Naming Convention:
   - Use the format `[topic-prefix]-[number]-[type]`.
   - Example for "linear-algebra": `linalg-1-flashcard`, `linalg-2-single`, `linalg-3-multi`.
   - Number them sequentially from 1 to 25.

4. Content Rules:
   - FLASHCARD: Needs `front` and `back`.
   - SINGLE_CHOICE: Needs `question`, `options` (array of 4 strings), `correctAnswer` (string matching one option exactly), and `explanation`.
   - MULTI_CHOICE: Needs `question`, `options` (array of 4-5 strings), `correctAnswers` (array of strings matching correct options exactly), and `explanation`.
   - Make the distractors (wrong answers) highly plausible to test deep understanding, especially for difficulty 2 and 3.

Output ONLY a valid JSON object in code block matching this schema:
```
{
  "topicId": "[MUST MATCH PROVIDED TOPIC ID]",
  "cards": [
    // ... 25 card objects
    {
      "id": "[UNIQUE ID FOR THE CARD]",
      "type": "FLASHCARD",
      "difficulty": "[DIFFICULTY LEVEL 1-3]",
      "content": {
        "front": "[FRONT SIDE OF THE CARD]",
        "back": "[BACK SIDE OF THE CARD]"
      }
    },
    {
      "id": "[UNIQUE ID FOR THE CARD]",
      "type": "SINGLE_CHOICE" | "MULTI_CHOICE",
      "difficulty": "[DIFFICULTY LEVEL 1-3]",
      "content": {
        "question": "[QUESTION]",
        "options": "[ARRAY OF 4-5 STRINGS]",
        "correctAnswers": "[ARRAY OF STRINGS MATCHING CORRECT OPTIONS EXACTLY]",
        "explanation": "[EXPLANATION]"
      }
    },
    {
      "id": "[UNIQUE ID FOR THE CARD]",
      "type": "MULTI_CHOICE",
      "difficulty": "[DIFFICULTY LEVEL 1-3]",
      "content": {
        "question": "[QUESTION]",
        "options": "[ARRAY OF 4-5 STRINGS]",
        "correctAnswers": "[ARRAY OF STRINGS MATCHING CORRECT OPTIONS EXACTLY]",
        "explanation": "[EXPLANATION]"
      }
    },
    ...
  ]
}
```
