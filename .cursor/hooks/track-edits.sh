#!/bin/bash

input=$(cat)
file_path=$(echo "$input" | jq -r '.file_path')
conv_id=$(echo "$input" | jq -r '.conversation_id')

echo "$file_path" >> "/tmp/cursor-edits-${conv_id}.txt"
exit 0
