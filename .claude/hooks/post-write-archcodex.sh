#!/bin/bash
# ArchCodex post-write hook: Run archcodex check after Write/Edit

# Read input from stdin
INPUT=$(cat)

# Extract file path from JSON input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check src/ files
if [[ ! "$FILE_PATH" =~ ^(src/|/.*/(src)/) ]]; then
  exit 0
fi

# Skip non-source files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Run archcodex check
cd "$CLAUDE_PROJECT_DIR"
RESULT=$(node dist/bin/archcodex.js check "$FILE_PATH" --json 2>&1)

# Parse result
ERRORS=$(echo "$RESULT" | jq -r '.summary.totalErrors // 0')
WARNINGS=$(echo "$RESULT" | jq -r '.summary.totalWarnings // 0')

# If errors, block with structured feedback
if [ "$ERRORS" -gt 0 ]; then
  VIOLATIONS=$(echo "$RESULT" | jq -r '.results[0].violations[] | "- \(.rule): \(.message)\n  Fix: \(.fix_hint)"' 2>/dev/null)

  cat <<EOF
{
  "decision": "block",
  "reason": "ArchCodex found $ERRORS error(s). Fix before continuing:\n$VIOLATIONS",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "File $FILE_PATH has architectural violations. Run 'node dist/bin/archcodex.js check $FILE_PATH --json' for details."
  }
}
EOF
  exit 0
fi

# If warnings, just inform (don't block)
if [ "$WARNINGS" -gt 0 ]; then
  echo "ArchCodex: $WARNINGS warning(s) in $FILE_PATH (non-blocking)"
fi
