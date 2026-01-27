#!/bin/bash
# ArchCodex reminder hook: Adds workflow reminder to Claude's context

# Only trigger occasionally (every 5th prompt based on simple counter)
COUNTER_FILE="/tmp/archcodex-reminder-counter"
if [ -f "$COUNTER_FILE" ]; then
  COUNTER=$(($(cat "$COUNTER_FILE") + 1))
else
  COUNTER=1
fi
echo $COUNTER > "$COUNTER_FILE"

# Show reminder every 5 prompts
if [ $((COUNTER % 5)) -ne 1 ]; then
  exit 0
fi

# Output reminder for Claude's context
cat <<'EOF'
ARCHCODEX WORKFLOW REMINDER:
1. BEFORE creating/reading files: `node dist/bin/archcodex.js read <file> --format ai` or `node dist/bin/archcodex.js discover "<query>"`
2. BEFORE adding imports: `node dist/bin/archcodex.js neighborhood <file>`
3. AFTER implementation: `node dist/bin/archcodex.js check <file> --json`
EOF
