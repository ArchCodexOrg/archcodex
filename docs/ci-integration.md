# CI/CD Integration Guide

Guide for integrating ArchCodex with CI/CD pipelines, pre-commit hooks, and development workflows.

---

## Pre-Commit Integration

### Husky

```bash
# Install husky
npm install --save-dev husky
npx husky init

# Edit .husky/pre-commit
npm run build && archcodex check --staged --format compact --max-errors 0
```

### lint-staged

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "archcodex check --max-errors 0"
    ]
  }
}
```

### GitHub Actions

```yaml
- name: ArchCodex Check
  run: npx archcodex check --format compact --max-errors 0
```

---

## Pre-Commit Configuration

Configure pre-commit settings in `.arch/config.yaml`:

```yaml
validation:
  precommit:
    max_errors: 0           # Fail on any error
    max_warnings: null      # Allow warnings (null = no limit)
    output_format: compact  # human | json | compact
    only_staged_files: true # Only check staged files
    include:                # Gradual adoption patterns
      - 'src/**'
    exclude:
      - '**/*.test.ts'
      - '**/generated/**'
```

### CLI Options

```bash
# Check only staged files
archcodex check --staged

# Set error/warning thresholds
archcodex check --max-errors 0 --max-warnings 50

# Compact output for CI/hooks
archcodex check --format compact

# Use pre-commit settings from config
archcodex check --precommit

# Include/exclude patterns
archcodex check --include "src/new-module/**" --exclude "**/*.test.ts"
```

### Exit Codes

| Scenario | Exit Code |
|----------|-----------|
| All files pass | 0 |
| Warnings but under threshold | 0 |
| Errors exceed `max_errors` | 1 |
| Warnings exceed `max_warnings` | 1 |

---

## Claude Code Hooks

Automatically validate files after Claude Code writes them.

### Post-Write Hook

Create `.claude/hooks/post-write-archcodex.sh`:

```bash
#!/bin/bash
set -euo pipefail
# ArchCodex post-write hook: Run archcodex check after Write/Edit

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check source files in configured paths
if [[ ! "$FILE_PATH" =~ ^(convex/|src/|/.*/(convex|src)/) ]]; then
  exit 0
fi

if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Run archcodex check
cd "$CLAUDE_PROJECT_DIR"
RESULT=$(npx archcodex check "$FILE_PATH" --json 2>&1)

ERRORS=$(echo "$RESULT" | jq -r '.summary.totalErrors // 0')
WARNINGS=$(echo "$RESULT" | jq -r '.summary.totalWarnings // 0')

# Block on errors with structured feedback
if [ "$ERRORS" -gt 0 ]; then
  VIOLATIONS=$(echo "$RESULT" | jq -r '.results[0].violations[] | "- \(.rule): \(.message)\n  Fix: \(.fix_hint)"' 2>/dev/null)

  cat <<EOF
{
  "decision": "block",
  "reason": "ArchCodex found $ERRORS error(s). Fix before continuing:\n$VIOLATIONS"
}
EOF
  exit 0
fi

# Warn on warnings (non-blocking)
if [ "$WARNINGS" -gt 0 ]; then
  echo "ArchCodex: $WARNINGS warning(s) in $FILE_PATH (non-blocking)"
fi
```

### Pre-Write Hook (New File Detection)

Create `.claude/hooks/archcodex-pre-write.sh`:

```bash
#!/bin/bash
set -euo pipefail
# Remind about @arch tags when creating new files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check source files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Check if file already exists
if [ -f "$FILE_PATH" ]; then
  exit 0
fi

# Check for @arch tag
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

if echo "$CONTENT" | grep -q "@arch"; then
  exit 0
fi

# Warn about missing @arch tag
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "NEW FILE: $FILE_PATH - Ensure it has @arch tag. Run 'npx archcodex discover \"<description>\"' to find the right architecture."
  }
}
EOF
```

### Configure Hooks

Add to `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "command": ".claude/hooks/archcodex-pre-write.sh"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": ".claude/hooks/post-write-archcodex.sh"
      }
    ]
  }
}
```

> **Note:** Use `settings.local.json` (gitignored) for hooks to allow per-developer customization.

### Hook Summary

| Hook | Trigger | Purpose |
|------|---------|---------|
| `archcodex-pre-write.sh` | PreToolUse:Write | Warn if new file missing `@arch` tag |
| `post-write-archcodex.sh` | PostToolUse:Write/Edit | Validate and block on errors |

---

## Gradual Adoption

Start with a subset of your codebase:

### Phase 1: Warn Only

```yaml
validation:
  precommit:
    max_errors: null    # No error limit
    max_warnings: null  # No warning limit
    include: ['src/new-module/**']
```

### Phase 2: Fail on Errors

```yaml
validation:
  precommit:
    max_errors: 0       # Fail on any error
    max_warnings: null  # Allow warnings
    include: ['src/new-module/**', 'src/another-module/**']
```

### Phase 3: Strict Mode

```yaml
validation:
  precommit:
    max_errors: 0
    max_warnings: 0
    include: ['src/**']
    exclude: ['src/legacy/**']
```

---

## Performance & Caching

### Automatic Caching

Validation results are cached to `.arch/cache/validation.json`:

```bash
# First run: validates all files
archcodex check --project
# Output: Cache: 0 hits, 175 validated

# Second run: uses cache for unchanged files
archcodex check --project
# Output: Cache: 172 hits, 3 validated
```

**Cache invalidation triggers:**
- File content changes (checksum mismatch)
- Registry changes (`.arch/registry.yaml`)
- Config changes (`.arch/config.yaml`)

### Incremental Validation

For faster feedback during development:

```bash
# Only validate changed files + their dependents
archcodex check --project --incremental
```

**How it works:**
1. Detects changed files by comparing checksums
2. Uses BFS traversal to find dependent files
3. Validates changed files + dependents (max depth: 2 levels)

### Recommended Commands

| Scenario | Command |
|----------|---------|
| CI/CD pipeline | `archcodex check --project` |
| Pre-commit hook | `archcodex check --staged --project` |
| Development (watch mode) | `archcodex check --project --incremental` |
| Force full re-validation | Delete `.arch/cache/` and run `--project` |

### Cache Statistics

```
SUMMARY: 175 passed, 0 failed, 0 warnings
Total files: 175
Active overrides: 1

Project analysis: 184 files, 0 cycles detected (45ms) | Cache: 172 hits, 3 validated
```

---

## Watch Mode

Re-validate files automatically during development:

```bash
# Watch default patterns (src/**/*.ts)
archcodex watch

# Watch specific patterns
archcodex watch "src/**/*.ts" "lib/**/*.ts"

# Clear terminal between runs
archcodex watch --clear
```

### Automatic Cache Invalidation

Watch mode monitors registry and config files. When these change:
- Validation cache is cleared
- Registry and config are reloaded
- Validation engine is recreated

---

## Related Documentation

- [CLI Validation](cli/validation.md) - check command options
- [CLI Versioning](cli/versioning.md) - watch command
- [Configuration](configuration.md) - Pre-commit settings
- [Back to README](../README.md)
