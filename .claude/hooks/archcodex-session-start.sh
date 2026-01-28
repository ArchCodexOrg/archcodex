#!/bin/bash
# ArchCodex session start hook: Prime context with architectural constraints

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Check if archcodex is available
if [ ! -f "dist/bin/archcodex.js" ]; then
  exit 0
fi

CONTEXT=$(node dist/bin/archcodex.js session-context 2>/dev/null)

if [ -n "$CONTEXT" ]; then
  cat <<EOF
ARCHCODEX SESSION CONTEXT (auto-loaded at session start):
Run 'archcodex session-context --with-patterns' for canonical implementations.

$CONTEXT
EOF
fi

exit 0
