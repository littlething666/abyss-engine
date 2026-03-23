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
