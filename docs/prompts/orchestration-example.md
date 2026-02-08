# Orchestration Example: Creating a New CLI Command

This shows the complete flow of an orchestration agent handling a request to create a new CLI command.

---

## User Request

> "Create a new CLI command called `metrics` that displays architecture metrics"

---

## Orchestrator Actions

### Step 1: Identify Module

```
Task analysis:
- Type: New CLI command
- Module: src/cli/commands/
- Files to create: metrics.ts
- Files to modify: index.ts (registration)
```

### Step 2: Fetch Context

```bash
node dist/bin/archcodex.js context -m src/cli/commands/ --confirm
```

**Output (condensed):**
```
# src/cli/commands/ (53 files)

## Layer: cli
CAN import: [utils, core, validators, llm]
CANNOT import: [mcp, config, barrel, tests]

## Architecture: archcodex.cli.command
Constraints:
  forbid: [ts-morph, fast-glob]
  patterns: [explicit any, console.log]
  require: [commander]
  hint: Commands should be thin - delegate to core engines

## Modification Order:
DEFINES: types.ts, schema.ts
IMPLEMENTS: *.ts (command files)
ORCHESTRATES: index.ts
```

### Step 3: Prepare Subagent Prompt

```markdown
You are implementing code in the ArchCodex project.

## Architectural Context

# src/cli/commands/

### Layer Boundaries
- **Layer:** cli
- **CAN import from:** utils, core, validators, llm
- **CANNOT import from:** mcp, config, barrel, tests

### Constraints
- **@arch tag:** `archcodex.cli.command`
- **Forbidden imports:** ts-morph, fast-glob
- **Forbidden patterns:** explicit any, console.log/error/warn
- **Required:** commander
- **Hint:** Commands should be thin - delegate to core engines

---

## Your Task

Create a new CLI command called `metrics` that displays architecture metrics including:
- Files per architecture
- Coverage percentage
- Layer distribution

## Files to Create

| File | Action | @arch Tag |
|------|--------|-----------|
| src/cli/commands/metrics.ts | Create | archcodex.cli.command |

## Files to Modify

| File | Change |
|------|--------|
| src/cli/index.ts | Add import and register command |

## Implementation Pattern

Follow this structure (from existing commands):

```typescript
/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { SomeEngine } from '../../core/...';
import { logger } from '../../utils/logger.js';

interface MetricsOptions {
  json?: boolean;
  // other options
}

export function createMetricsCommand(): Command {
  return new Command('metrics')
    .description('Display architecture metrics')
    .option('--json', 'Output as JSON')
    .action(async (options: MetricsOptions) => {
      try {
        await runMetrics(options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runMetrics(options: MetricsOptions): Promise<void> {
  // Delegate to core engine - keep command thin
  const engine = new SomeEngine(...);
  const result = await engine.analyze();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Format human-readable output with chalk
  }
}
```

## Do NOT

- ❌ Use `any` types
- ❌ Import from mcp, config, or tests
- ❌ Use console.log for errors (use logger)
- ❌ Put business logic in the command (delegate to core)
- ❌ Forget the @arch tag

## After Implementation

Orchestrator will validate with:
```bash
archcodex check src/cli/commands/metrics.ts
```
```

### Step 4: Delegate to Subagent

```
<invoke Task tool with the prompt above>
```

### Step 5: Validate Result

```bash
node dist/bin/archcodex.js check src/cli/commands/metrics.ts src/cli/index.ts
```

**Expected output:**
```
✓ src/cli/commands/metrics.ts - archcodex.cli.command
✓ src/cli/index.ts - archcodex.cli.barrel

0 violations found
```

---

## Compact Version (Token-Efficient)

For simpler tasks, use this condensed format:

```markdown
## Context: src/cli/commands/

@arch: archcodex.cli.command
Layer: cli → can:[utils,core,validators,llm] cannot:[mcp,config,tests]
Forbid: ts-morph, console.log (use logger), explicit any
Require: commander
Hint: Thin commands - delegate to core engines

## Task
Create `metrics.ts` command showing architecture stats.

## Pattern
- Export `createMetricsCommand(): Command`
- Use options interface
- Delegate to core engine
- Register in index.ts
```

---

## Error Scenarios

### Subagent violates constraint

**Validation output:**
```
✗ src/cli/commands/metrics.ts
  Line 15: Forbidden import 'ts-morph'
  Line 42: Forbidden pattern 'console.log'
```

**Orchestrator response:**
```
The implementation has constraint violations:
1. Remove ts-morph import - use core engines instead
2. Replace console.log with logger from utils

Please fix these and resubmit.
```

### Subagent forgets @arch tag

**Validation output:**
```
✗ src/cli/commands/metrics.ts
  Missing @arch tag (required by policy)
```

**Orchestrator response:**
```
Add the architecture tag at the top of the file:
/** @arch archcodex.cli.command */
```

---

## Multi-Module Task Example

**User request:** "Add caching to the unified context synthesizer"

**Orchestrator fetches multiple contexts:**

```bash
# For types
node dist/bin/archcodex.js context -m src/core/unified-context/ --confirm

# For any new cache utilities
node dist/bin/archcodex.js context -m src/utils/ --confirm
```

**Delegates in order:**
1. First subagent: Create cache types in unified-context/types.ts (DEFINES)
2. Second subagent: Create cache implementation (IMPLEMENTS)
3. Third subagent: Integrate into synthesizer (ORCHESTRATES)

Each subagent gets context for the specific module they're modifying.
