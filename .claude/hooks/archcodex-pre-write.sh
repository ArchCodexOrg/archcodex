#!/bin/bash
# ArchCodex pre-write hook: Remind about archcodex discover for new files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check src/ source files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

if [[ ! "$FILE_PATH" =~ ^(src/|/.*/(src)/) ]]; then
  exit 0
fi

# Check if file already exists
if [ -f "$FILE_PATH" ]; then
  exit 0
fi

# New file being created - check if it has @arch tag
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

if echo "$CONTENT" | grep -q "@arch"; then
  # Has @arch tag - allow
  exit 0
fi

# Missing @arch tag - provide feedback (don't block, just warn)
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "NEW FILE: $FILE_PATH - Ensure it has @arch tag. Run 'node dist/bin/archcodex.js discover \"<description>\"' to find the right architecture."
  }
}
EOF

exit 0
