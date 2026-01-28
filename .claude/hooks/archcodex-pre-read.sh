#!/bin/bash
# ArchCodex pre-read hook: Remind to use `archcodex read --format ai` for src/ files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip node_modules, dist, and other non-project directories
if [[ "$FILE_PATH" =~ (node_modules|\.git|dist|build|coverage)/ ]]; then
  exit 0
fi

# Only check src/ source files
# Matches: src/..., /path/to/project/src/...
# The negative lookbehind for node_modules above ensures we don't match
# paths like node_modules/pkg/src/
if [[ ! "$FILE_PATH" =~ (^|/)src/ ]]; then
  exit 0
fi

# Only TypeScript/JavaScript files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "REMINDER: For src/ files, prefer running 'archcodex read $FILE_PATH --format ai' to get the file content WITH its architectural constraints and allowed imports."
  }
}
EOF

exit 0
