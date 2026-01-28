#!/bin/bash
# ArchCodex reminder hook: Adds workflow reminder on every Write/Edit to src/ files

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

# Only remind for src/ source files
# Matches: src/..., /path/to/project/src/...
if [[ ! "$FILE_PATH" =~ (^|/)src/ ]]; then
  exit 0
fi

# Only TypeScript/JavaScript files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Output reminder for Claude's context
cat <<'EOF'
ARCHCODEX WORKFLOW REMINDER:
1. BEFORE creating files: `archcodex discover "<description>"` to find the right architecture
2. BEFORE editing files: `archcodex read <file> --format ai` to get constraints
3. BEFORE adding imports: `archcodex neighborhood <file>` to check import boundaries
4. AFTER changes: `archcodex check <file>` to validate (the post-write hook does this automatically)
EOF
