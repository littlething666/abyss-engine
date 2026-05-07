Run exactly 2 parallel Subagent tasks for web research on: [TOPIC](#TOPIC).

Decide the best distinct research angle for each subagent and write each subagent prompt accordingly.

Constraints:
- Do not do independent web research yourself.
- Do not create/edit files or run tests.
- Wait until all agents finish.

After completion:
- Print one concise report section per agent.
- Then print an “Aggregate synthesis” section with 3–6 highest-impact insights, disagreements, and recommended next steps.

If any subagent output is unavailable, stop and respond:
“I do not have access to all agent reports, so I cannot continue.”

Then do not continue further.

## TOPIC
