# AI Integration Guide

Guide for integrating ArchCodex with LLM agents and AI coding assistants.

---

## Overview

ArchCodex includes features specifically designed to help AI coding agents work effectively within architectural boundaries:

- **AI-optimized output formats** - Concise, action-oriented output
- **Pattern registry** - Canonical implementations for common operations
- **Actionable error messages** - Structured suggestions for fixes
- **MCP Server** - Native integration with Claude Code

---

## AI-Optimized Output Format

Use `--format ai` for concise, action-oriented output optimized for LLM comprehension:

```bash
archcodex read src/payment/processor.ts --format ai
```

### Output Structure

```
ARCH: domain.payment.processor
Payment processors for transaction handling

PATTERN:
  export class ${Name}Processor extends BaseProcessor {
    async process(tx: Transaction): Promise<Result> {
      await this.validatePermission(tx.userId);
      // ... processing logic
    }
  }

MUST:
  ✓ Test file: *.test.ts
  ✓ Call before: checkPermission, validateInput
      Document → await checkPermission(ctx, docId)
      Project → await checkPermission(ctx, projectId)

NEVER:
  ✗ Import: axios, http
      → Use: src/utils/api-client.ts (ApiClient)
  ✗ Max lines: 300
      → Keep processors focused

BOUNDARIES:
  layer: domain
  CAN import: [utils, validators]
  CANNOT import: [axios, http, console]

HINTS:
  1. Redact CVV/PAN before logging
     Example: logger.info({ cardNumber: mask(pan) })
  2. Use ApiClient for all HTTP calls

SEE:
  → code://src/payment/stripe-processor.ts (reference)
```

### Key Features

- **PATTERN**: Expected code structure (from `code_pattern` field)
- **MUST/NEVER**: Clearer than REQUIRED/FORBIDDEN for LLM comprehension
- **Usage maps**: Shows which option to use per context (reduces choice paralysis)
- **BOUNDARIES**: Explicit CAN and CANNOT import lists
- **Inline examples**: Hints can include example code

### Options

```bash
# Lean output (no source code by default)
archcodex read src/file.ts --format ai

# Include source code when needed
archcodex read src/file.ts --format ai --with-source

# Include dependency count (slower - builds import graph)
archcodex read src/file.ts --format ai --with-deps
```

---

## Pattern Registry

The `.arch/patterns.yaml` file defines canonical implementations:

```yaml
patterns:
  logger:
    canonical: src/utils/logger.ts
    exports: [logger]
    usage: "Use structured logger, never console.log"
    keywords: [log, debug, error, warn, console]
    example: |
      import { logger } from '../utils/logger.js';
      logger.info('Operation completed');

  http_client:
    canonical: src/core/api/client.ts
    exports: [ApiClient, ApiError]
    usage: "All HTTP calls must use ApiClient"
    keywords: [http, fetch, request, api, axios]
```

### Benefits

- Helps AI agents find the right module to import
- Prevents duplication of existing functionality
- Auto-populates `did_you_mean` in violation messages

---

## Actionable Error Messages

When violations occur, ArchCodex provides actionable options:

### Human-Readable Output

```
ERRORS (1):
   Line 4: forbid_import:commander, chalk, ora
     Import 'chalk' is forbidden
     Why: Core must not depend on CLI/presentation concerns
     Fix: Replace with 'src/utils/logger' (use logger)
     Alternatives:
       → import from "src/utils/logger".logger - Use structured logger
     Did you mean: src/utils/logger (use: logger)
     Options:
       1. Use an alternative import listed above
       2. Change @arch tag (run: archcodex diff-arch <current> <new>)
       3. Add @override (last resort - requires @reason and @expires)
```

### JSON Output

```bash
archcodex check src/file.ts --json
```

```json
{
  "violations": [{
    "code": "E003",
    "rule": "forbid_import",
    "value": ["axios", "http"],
    "message": "Import 'axios' is forbidden",
    "why": "Use ApiClient for PCI-compliant logging",
    "fix_hint": "Remove the import or use an approved alternative",
    "suggestion": {
      "action": "replace",
      "target": "axios",
      "replacement": "src/core/api/client"
    },
    "did_you_mean": {
      "file": "src/core/api/client.ts",
      "export": "ApiClient",
      "description": "All HTTP calls must use ApiClient"
    },
    "alternatives": [{
      "module": "src/core/api/client",
      "export": "ApiClient",
      "description": "PCI-compliant HTTP client"
    }],
    "actions": [
      { "priority": 1, "action": "use_alternative", "details": "..." },
      { "priority": 2, "action": "change_architecture", "command": "..." },
      { "priority": 3, "action": "add_override", "details": "..." }
    ]
  }]
}
```

### JSON Fields for AI Agents

| Field | Description |
|-------|-------------|
| `suggestion` | Structured fix action (replace, remove, add) |
| `did_you_mean` | Canonical implementation from pattern registry |
| `alternatives` | Alternative modules from constraint definition |
| `actions` | Prioritized list of actionable options |

---

## Architecture Enhancements for AI

Architectures can include AI-friendly fields that improve agent comprehension:

```yaml
domain.payment.processor:
  description: "Payment processors"
  rationale: "Use for payment transaction handling"

  # Code pattern showing expected structure
  code_pattern: |
    export class ${Name}Processor extends BaseProcessor {
      async process(tx: Transaction): Promise<Result> {
        await this.checkPermission(tx.userId);
        // ... processing logic
      }
    }

  # Reference implementations for golden samples
  reference_implementations:
    - src/payment/CardProcessor.ts
    - src/payment/RefundProcessor.ts

  # Smart path inference for scaffolding
  file_pattern: "${name}Processor.ts"
  default_path: "src/payment"

  constraints:
    - rule: forbid_import
      value: [axios, http]
      severity: error
      why: "Use ApiClient for PCI-compliant logging"
      alternative: "src/core/api/client"
      alternatives:
        - module: "src/core/api/client"
          export: "ApiClient"
          description: "PCI-compliant HTTP client"

    # Usage map reduces choice paralysis
    - rule: require_call_before
      value: [checkPermission, validateInput, isAdmin]
      before: [ctx.db.*, api.*]
      why: "Permission checks required"
      usage:
        Document: "await checkPermission(ctx, docId)"
        Project: "await validateInput(ctx, projectId)"
        Admin: "await isAdmin(ctx)"
```

| Field | Description |
|-------|-------------|
| `code_pattern` | Code template showing expected structure |
| `reference_implementations` | Example files for golden samples |
| `file_pattern` | Naming pattern for scaffolded files |
| `default_path` | Default output directory |
| `alternative` | Single alternative module for forbid_import |
| `alternatives` | Multiple alternatives with descriptions |
| `usage` | Map of context → usage example |

---

## Session Context Priming

AI agents can reduce tool calls by ~70% by priming their context at session start with all architecture constraints.

### CLI Usage

```bash
# Default: compact + deduplicated + with-layers (optimized for agents)
archcodex session-context

# Include canonical patterns (reusable implementations)
archcodex session-context --with-patterns

# Custom file patterns
archcodex session-context "lib/**/*.ts" --with-patterns

# Verbose output (all details, no deduplication)
archcodex session-context --full
```

### Output Structure

The default output includes:

| Field | Description |
|-------|-------------|
| `Layers` | Layer boundaries (what can import what) |
| `Shared (all archs)` | Constraints common across all architectures (deduplicated) |
| `forbid:` | Unique forbidden imports/calls per architecture |
| `patterns:` | Unique forbidden code patterns per architecture |
| `require:` | Required imports/decorators per architecture |
| `hint:` | Key behavioral guidance per architecture |
| `Canonical Patterns` | Reusable implementations to use (with `--with-patterns`) |

### Example Output

```
# ArchCodex Session Context
# 200 files scanned

## Layers
utils -> [(leaf)]
core -> [utils, validators]
cli -> [utils, core, validators, llm]

## Shared (all archs)
- forbid: commander, chalk, ora
- pattern: console\.(log|error), explicit any

## domain.payment (15)
- forbid: axios, http
- require: ApiClient
- hint: Redact CVV/PAN before logging

## domain.util (30)
- forbid: ../domain, ../api
- hint: Keep utilities pure

## Canonical Patterns
- logger: src/utils/logger.ts [logger]
- file_system: src/utils/file-system.ts [readFile, writeFile]
- api_client: src/core/api/client.ts [ApiClient]
```

### Benefits

- **Reduces tool calls**: No need to call `archcodex_read` for each file
- **Compact + deduplicated**: ~1.5KB for 200 files (vs ~6KB+ without deduplication)
- **Layer boundaries inline**: No separate config read needed
- **Canonical patterns**: Know which modules to use instead of creating duplicates
- **Batch validation**: After edits, validate all changed files at once with glob patterns

### Recommended Workflow

1. **Session start**: Call `session-context` (or `--with-patterns` for canonical patterns)
2. **Edit files**: Constraints are already in context
3. **Validate**: `archcodex check "src/**/*.ts"` (batch with globs)

---

## MCP Server

ArchCodex includes an MCP (Model Context Protocol) server for native integration with Claude Code.

### Installation

Add to your MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "archcodex": {
      "command": "npx",
      "args": ["archcodex-mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Or with local installation:

```json
{
  "mcpServers": {
    "archcodex": {
      "command": "node",
      "args": ["node_modules/archcodex/dist/bin/archcodex-mcp.js"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### Available MCP Tools

#### Context & Planning

| Tool | Description |
|------|-------------|
| `archcodex_session_context` | **Call at session start** - Prime context with all constraints (compact + deduplicated + layers) |
| `archcodex_plan_context` | **Call at plan start** - Scope-aware context for a specific directory/files |
| `archcodex_validate_plan` | **Pre-flight check** - Validate proposed changes before execution |
| `archcodex_before_edit` | Pre-edit validation hook |

#### Discovery & Navigation

| Tool | Description |
|------|-------------|
| `archcodex_discover` | Find architecture for natural language intent |
| `archcodex_action` | Get checklist and patterns for common tasks |
| `archcodex_decide` | Navigate decision tree for architecture choices |
| `archcodex_schema` | Discover rules, conditions, mixins, architectures |
| `archcodex_help` | Help topics and command reference |

#### File Analysis

| Tool | Description |
|------|-------------|
| `archcodex_read` | Read file with hydrated architectural context |
| `archcodex_neighborhood` | Get import boundaries |
| `archcodex_impact` | Show blast radius before refactoring |
| `archcodex_why` | Explain why a constraint applies to a file |
| `archcodex_resolve` | Get flattened architecture with all constraints |
| `archcodex_diff_arch` | Compare two architectures |

#### Validation & Health

| Tool | Description |
|------|-------------|
| `archcodex_check` | Validate files, get violations with suggestions |
| `archcodex_health` | Get health metrics (with progressive caching) |
| `archcodex_types` | Find duplicate/similar type definitions |
| `archcodex_intents` | List, validate, discover semantic intents |
| `archcodex_consistency` | Check registry consistency |

#### Scaffolding & Generation

| Tool | Description |
|------|-------------|
| `archcodex_scaffold` | Generate file from architecture template |
| `archcodex_feature` | Multi-file scaffolding from feature templates |
| `archcodex_infer` | Suggest architecture for untagged files |

#### Registry Management

| Tool | Description |
|------|-------------|
| `archcodex_sync_index` | Check/sync discovery index |
| `archcodex_workflow` | Workflow automation |

### Example Tool Calls

```json
// FIRST: Prime session context (call once at session start)
// Default: compact + deduplicated + with-layers (no extra flags needed)
{ "tool": "archcodex_session_context", "arguments": {
    "patterns": ["src/**/*.ts"],
    "withPatterns": true
} }

// Plan mode: Get scoped context for a specific area
{ "tool": "archcodex_plan_context", "arguments": {
    "scope": ["src/core/health/"]
} }

// Pre-flight: Validate proposed changes before writing code
{ "tool": "archcodex_validate_plan", "arguments": {
    "changes": [
      {"path": "src/core/health/scorer.ts", "action": "create", "archId": "archcodex.core.engine"},
      {"path": "src/core/health/analyzer.ts", "action": "modify", "newImports": ["./scorer.js"]}
    ]
} }

// Discover options for creating architectures
{ "tool": "archcodex_schema", "arguments": { "filter": "rules" } }

// Check a file for violations
{ "tool": "archcodex_check", "arguments": { "files": ["src/payment/processor.ts"] } }

// Find architecture for intent
{ "tool": "archcodex_discover", "arguments": { "query": "payment processor", "autoSync": true } }

// Compare architectures before switching
{ "tool": "archcodex_diff_arch", "arguments": { "from": "domain.util", "to": "domain.payment" } }
```

### Auto-Detection

The MCP server automatically detects the project root by walking up from the file path to find `.arch/` directory:

```json
{ "tool": "archcodex_read", "arguments": {
    "file": "src/payment/processor.ts",
    "format": "ai"
} }
```

---

## LLM Agent Integration

For agent frameworks, use CLI commands as tools:

| Tool | Command | Description |
|------|---------|-------------|
| **Session start** | `archcodex session-context --with-patterns` | Prime context with all constraints |
| Read with context | `archcodex read <file> --format ai` | Get hydrated file content |
| Read with example | `archcodex read <file> --with-example` | Include reference implementation |
| Import boundaries | `archcodex neighborhood <file>` | Show what file can/cannot import |
| Validate | `archcodex check <file> --json` | Check compliance with suggestions |
| Batch validate | `archcodex check "src/**/*.ts"` | Validate multiple files with globs |
| Compare | `archcodex diff-arch <from> <to>` | Compare constraints before switching |
| Discover | `archcodex discover "<query>" --json` | Find architecture by keywords |
| Guided selection | `archcodex decide` | Interactive decision tree |
| Scaffold | `archcodex scaffold <arch_id> --name <Name>` | Generate file |
| Explain | `archcodex why <file> [constraint]` | Trace constraint origin |
| Health | `archcodex health --json` | Get health metrics |

---

## Agent Instructions Template

Add this to your `CLAUDE.md` or agent instruction file:

````markdown
# ArchCodex Instructions

This project uses ArchCodex to enforce architectural constraints.

## SESSION START (Call Once)

Prime your context with all constraints at the start of each session:
```
archcodex_session_context patterns: ["src/**/*.ts"], withPatterns: true
```

This gives you (compact + deduplicated + with-layers by default):
- Layer boundaries (what can import what)
- Shared constraints (deduplicated across all architectures)
- Per-architecture unique constraints, hints, patterns
- Canonical patterns (modules to use instead of creating duplicates)
- ~70% fewer tool calls needed during the session

## CRITICAL WORKFLOW

**BEFORE creating a new file:**
```
archcodex_discover query: "description of what you're building"
```

**AFTER making changes:**
```
archcodex_check files: ["src/**/*.ts"]  // Use globs for batch validation
```

## MANDATORY: @arch Tags

Every new source file MUST have an `@arch` tag:
```typescript
/** @arch <architecture-id> */
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `archcodex session-context --with-patterns` | Prime session context |
| `archcodex discover "<query>"` | Find architecture by keywords |
| `archcodex read <file> --format ai` | Read with AI-optimized constraints |
| `archcodex neighborhood <file>` | Check before adding imports |
| `archcodex check "src/**/*.ts"` | Batch validate with globs |
| `archcodex why <file> [constraint]` | Explain why constraints apply |

## Improving the Registry with Agent Feedback

After a complex coding session, or when the output feels off, ask the AI agent these five questions:

1. What information did you need that you **did** get from ArchCodex?
2. What information did you need that you **did not** get?
3. What information did ArchCodex provide that was irrelevant or noisy?
4. Did you create or update any architectural specs? Why or why not?
5. For the **next agent** working on this code, what will ArchCodex help them with?

This isn't meant for every session — once a week or after a particularly complex feature is enough.

**How to use the answers:**

| Question | What it reveals | Registry action |
|----------|----------------|-----------------|
| Q2: Missing info | Gaps in constraints or hints | Add constraints, hints, or reference implementations |
| Q3: Noisy info | Over-specified architectures | Trim hints, simplify constraints |
| Q5: Future agents | Patterns worth documenting | Add hints, create new architectures or intents |

Over time, this feedback loop compounds. Each constraint added from observing mistakes prevents that class of drift in future sessions. The registry learns from the agent's failures.

---

## Handling Violations

When violations occur:
1. **Preferred**: Fix using `suggestion` and `didYouMean` from JSON
2. **Consider**: Can you refactor to comply? Should architecture be updated?
3. **Last resort**: Add `@override` with `@reason` and `@expires`
````

---

## Related Documentation

- [CLI Analysis](cli/analysis.md) - read and neighborhood commands
- [CLI Discovery](cli/discovery.md) - discover and decide commands
- [Configuration](configuration.md) - LLM provider settings
- [Back to README](../README.md)
