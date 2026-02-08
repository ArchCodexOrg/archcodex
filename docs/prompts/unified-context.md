# Unified Context Prompt Template

## For CLAUDE.md / System Prompts

```markdown
## Before Modifying Code

**ALWAYS call `archcodex_context` before modifying a module:**

```json
archcodex_context { "projectRoot": "/absolute/path/to/project", "module": "src/path/to/module/" }
```

> **Required:** `projectRoot` must be an absolute path to the project root (where `.arch/` directory exists).

This gives you:
1. **Modification Order** - Which files to change first (DEFINES → IMPLEMENTS → ORCHESTRATES)
2. **Impact Indicators** - 🔴N shows how many files break if you change this one
3. **Layer Boundaries** - CAN/CANNOT import lists to avoid violations
4. **Entity Schemas** - Field names, relationships, behaviors (soft_delete, ordering)
5. **Validation Command** - Run after changes to verify compliance

## Reading the Output

```yaml
## 1. Modification Order
DEFINES (modify first):
  types.ts 🔴4 - type definitions      ← Change this FIRST
IMPLEMENTS:
  service.ts 🔴2 - business logic      ← Change this SECOND
ORCHESTRATES:
  handler.ts - coordinates             ← Change this LAST

## 2. Boundaries
CAN import: [utils, core]              ← Safe to import from these
CANNOT import: [cli, mcp]              ← NEVER import from these

## 5. ArchCodex
validate: archcodex_check { ... }      ← Run this after changes
```

## Rules

1. **Modify DEFINES files before IMPLEMENTS files** - Types/schemas first
2. **Never import from CANNOT list** - Use barrel exports instead
3. **High 🔴 numbers = high risk** - Plan updates to all consumers
4. **Run validation after changes** - Use the command in section 5
```

---

## For MCP Server (Prompt Template)

Add to your MCP server's prompt list:

```typescript
{
  name: 'archcodex_before_modify',
  description: 'Get architectural context before modifying a module',
  arguments: [
    {
      name: 'module',
      description: 'Module path to get context for',
      required: true,
    },
  ],
}
```

**Prompt content:**

```markdown
# Architectural Context for Modification

Before modifying files in this module, review the following context:

${archcodex_context output}

## Checklist

- [ ] Modify DEFINES files first (types, schemas, interfaces)
- [ ] Then IMPLEMENTS files (services, repositories)
- [ ] Then ORCHESTRATES files (handlers, coordinators)
- [ ] Check 🔴 impact - update all consumers listed
- [ ] Respect layer boundaries (CAN/CANNOT import)
- [ ] Run validation command after changes
```

---

## Compact Version (for token-limited contexts)

```markdown
## Before Code Changes

1. Run: `archcodex_context { "projectRoot": "/path/to/project", "module": "src/your/module/" }`
2. Follow modification order: DEFINES → IMPLEMENTS → ORCHESTRATES
3. Check 🔴N for impact - high numbers need consumer updates
4. Respect CAN/CANNOT import boundaries
5. Validate: `archcodex_check { "projectRoot": "/path/to/project", "files": ["src/your/module/**/*.ts"] }`

> Always use absolute paths for `projectRoot` - this is where ArchCodex finds the `.arch/` directory.
```

---

## Integration Examples

### In CLAUDE.md

```markdown
# Project Instructions

## Architecture Workflow

Before modifying any module:
1. `archcodex_context { "module": "src/path/" }` - Get context
2. Follow the modification order shown
3. `archcodex_check` after changes - Validate

The context tells you:
- File modification order (types first)
- What you CAN/CANNOT import
- Impact of changes (🔴 = files that break)
```

### In Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Get changed directories
CHANGED_DIRS=$(git diff --cached --name-only | xargs -n1 dirname | sort -u)

for dir in $CHANGED_DIRS; do
  echo "Checking $dir..."
  archcodex check "$dir/**/*.ts"
done
```

### In CI/CD Pipeline

```yaml
# .github/workflows/arch-check.yml
- name: Validate Architecture
  run: |
    npx archcodex check "src/**/*.ts" --strict
```
