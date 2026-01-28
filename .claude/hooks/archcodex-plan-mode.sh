#!/bin/bash
# ArchCodex plan mode hook: Remind to use plan-context for scoped constraints

cat <<'EOF'
ARCHCODEX PLAN MODE REMINDER:
When planning multi-file changes, run scoped context first:

1. `archcodex plan-context <directory>` - Get constraints for the target area
2. `archcodex validate-plan --stdin` - Validate proposed changes BEFORE writing
3. `archcodex check "<glob>"` - Validate after implementation

Example:
  archcodex plan-context src/core/health/
  echo '{"changes":[{"path":"src/core/health/scorer.ts","action":"create","archId":"archcodex.core.engine"}]}' | archcodex validate-plan --stdin
EOF

exit 0
