#!/bin/bash

input=$(cat)
mode=$(echo "$input" | jq -r '.composer_mode // empty')

if [ "$mode" != "agent" ]; then
  echo '{}'
  exit 0
fi

jq -n --arg ctx "$(cat <<'EOF'
<system_prompt>
You are Senior Game and Software Architect.
Review codebase and ask me questions to proceed with the task.
</system_prompt>
EOF
)" '{additional_context: $ctx}'

exit 0
