# CLAUDE.md Snippet for Orchestration

Add this to your project's CLAUDE.md to enable orchestrated context-aware coding.

---

## Minimal Version (Recommended)

```markdown
## BEFORE MODIFYING CODE

**STOP.** Get architectural context first:
```bash
archcodex context -m <module-path>
```

This tells you:
- `@arch` tag to use
- What you CAN/CANNOT import
- Modification order (types → implementation → orchestration)

**AFTER changes**, validate:
```bash
archcodex check <files>
```
```

---

## Full Version (With Orchestration Pattern)

```markdown
## Architectural Workflow

### For Single-File Changes
1. Run `archcodex context -m <module>`
2. Note the @arch tag and layer boundaries
3. Make changes following constraints
4. Run `archcodex check <file>`

### For Multi-File Changes (Orchestration Pattern)

When coordinating multiple changes:

1. **Fetch context once** for each module being modified:
   ```bash
   archcodex context -m src/core/db/ --confirm
   archcodex context -m src/cli/commands/ --confirm
   ```

2. **Extract key constraints:**
   ```
   Module: src/cli/commands/
   @arch: archcodex.cli.command
   CAN: [utils, core, validators]
   CANNOT: [mcp, config, tests]
   Forbid: ts-morph, console.log
   ```

3. **Follow modification order:**
   - DEFINES first (types, schemas, interfaces)
   - IMPLEMENTS second (business logic)
   - ORCHESTRATES last (entry points, index files)

4. **Validate all changes:**
   ```bash
   archcodex check src/**/*.ts
   ```

### Context Format for Subagents

When delegating to another agent, include:
```
## Context: <module>
@arch: <tag>
Layer: <name> → can:[...] cannot:[...]
Forbid: <list>
Order: types → impl → orchestrators
```

### Quick Commands

| Command | Use When |
|---------|----------|
| `archcodex context -m <path>` | Before coding |
| `archcodex check <files>` | After coding |
| `archcodex map` | Finding modules |
| `archcodex discover "<query>"` | Finding right @arch |
```

---

## Haiku-Specific Instructions

If using Claude Haiku, be more explicit:

```markdown
## BEFORE MODIFYING CODE (REQUIRED)

You MUST run this command before making any code changes:
```bash
node dist/bin/archcodex.js context -m <module-path> --confirm
```

DO NOT skip this step. The output tells you:
- What @arch tag to use (REQUIRED on all files)
- What imports are ALLOWED vs FORBIDDEN
- The order to modify files (types first, then implementation)

Violations will cause CI failures.
```

---

## MCP Tool Version

If using MCP tools instead of CLI:

```markdown
## BEFORE MODIFYING CODE

Call the archcodex_context MCP tool:
```json
{
  "projectRoot": "/path/to/project",
  "module": "src/cli/commands/"
}
```

This returns:
- Layer boundaries (CAN/CANNOT import)
- @arch tag to use
- Modification order with impact indicators (🔴 = high impact)

After changes, call archcodex_check to validate.
```
