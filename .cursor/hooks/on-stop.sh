#!/bin/bash

input=$(cat)
status=$(echo "$input" | jq -r '.status')
conv_id=$(echo "$input" | jq -r '.conversation_id')
loop_count=$(echo "$input" | jq -r '.loop_count')

# Only run on completed
if [ "$status" != "completed" ]; then
  echo '{}'
  exit 0
fi

# Skip if no files were modified this session
edit_log="/tmp/cursor-edits-${conv_id}.txt"
if [ ! -f "$edit_log" ]; then
  echo '{}'
  exit 0
fi

# Clean up the log
rm -f "$edit_log"

errors=""

# Run compile check and capture output
build_output=$(npm run check:compile 2>&1)
build_exit=$?
if [ $build_exit -ne 0 ]; then
  errors="Compile check failed:\n$build_output"
fi

# Run unit tests and capture output
test_output=$(npm run test:unit:run 2>&1)
test_exit=$?
if [ $test_exit -ne 0 ]; then
  if [ -n "$errors" ]; then
    errors="$errors\n\nUnit tests failed:\n$test_output"
  else
    errors="Unit tests failed:\n$test_output"
  fi
fi

# Return a followup_message only if there were errors
if [ -n "$errors" ]; then
  message="Compile check or tests failed after your last changes. Please fix the following errors and try again:\n$errors"
  # Use jq to safely construct the JSON - it handles all escaping correctly
  jq -n --arg msg "$message" '{"followup_message": $msg}'
else
  echo '{}'
fi

exit 0
