#!/bin/bash
# ArchCodex pre-read hook: Auto-inject architectural constraints for src/ files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip non-project directories
if [[ "$FILE_PATH" =~ (node_modules|\.git|dist|build|coverage)/ ]]; then
  exit 0
fi

# Only src/ TypeScript/JavaScript files
if [[ ! "$FILE_PATH" =~ (^|/)src/ ]]; then
  exit 0
fi
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Auto-inject architectural constraints
ARCH_CONTEXT=$(archcodex read "$FILE_PATH" --format ai 2>/dev/null)
if [ -n "$ARCH_CONTEXT" ]; then
  jq -n --arg ctx "ARCHITECTURAL CONSTRAINTS for this file:
$ARCH_CONTEXT" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "additionalContext": $ctx
    }
  }'
fi

exit 0
