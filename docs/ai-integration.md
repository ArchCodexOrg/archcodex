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

## Prompt Builder for Subagents

The `archcodex prompt` command builds optimized prompts with pre-baked architectural context for LLM subagents. Based on LLM evaluation testing, pre-provided context in prompts outperforms agent discovery.

### CLI Usage

```bash
# Build prompt for a single module
archcodex prompt -m src/core/db/ -t "Add getById method"

# Target Haiku with explicit MUST instructions
archcodex prompt -m src/utils/ -t "Create debounce utility" --model haiku

# Multi-module refactoring
archcodex prompt -m src/core/,src/cli/ -t "Refactor shared types"

# Preview mode (subagent shows code but doesn't write)
archcodex prompt -m src/core/db/ -t "Add caching" --preview

# Add custom requirements
archcodex prompt -m src/utils/ -t "Add retry" -r "Must be generic,Add JSDoc"

# Get just the context block for manual prompt building
archcodex prompt -m src/core/db/ -t "unused" --context-only

# JSON output for programmatic use
archcodex prompt -m src/core/ -t "Add feature" --json

# Auto-discover relevant modules from task description (interactive)
archcodex prompt -t "Add caching to the database" --discover
archcodex prompt -t "Refactor entity handling" --discover --model haiku
```

### Options

| Option | Description |
|--------|-------------|
| `-m, --module <path>` | Module path(s) - comma-separated for multi-module |
| `-t, --task <description>` | Task description for the prompt |
| `--model <model>` | Target model: `haiku`, `opus`, `sonnet` (default: sonnet) |
| `-r, --requirements <reqs>` | Additional requirements (comma-separated) |
| `--preview` | Add instruction for preview mode (show code, don't write) |
| `--no-validation` | Omit validation reminder |
| `--context-only` | Output just the compact context block |
| `--json` | Output as JSON with metadata |
| `--discover` | Auto-discover relevant modules from task description (interactive) |

### Task Discovery Mode

When you don't know which module to target, use `--discover` to analyze the task description and get suggestions:

```bash
archcodex prompt -t "Add caching to the database layer" --discover
```

Output:
```
Task Analysis:
  Action: add
  Keywords: caching, database, layer
  Scope: single-module
  Context: compact

Suggested Modules:
  1. src/core/db/ (85% confidence) [archcodex.core.engine]
     Path contains "database" (5 files)
  2. src/core/cache/ (75% confidence) [archcodex.core.engine]
     Architecture match: archcodex.core.engine (keyword: "caching") (3 files)

Select modules to include (comma-separated numbers, or "a" for all, "q" to quit):
> 1
```

The analyzer uses pure heuristics (no LLM calls):
- **Action detection**: add, modify, refactor, delete, fix
- **Keyword extraction**: Filters stop words, extracts domain terms
- **Entity detection**: Finds PascalCase class/interface names
- **Architecture matching**: Searches indexed architectures
- **Path matching**: Searches file paths for keywords

### Model-Specific Formatting

Based on LLM evaluation findings:

| Model | Instruction Style | Example |
|-------|-------------------|---------|
| `haiku` | Explicit "MUST" and "REQUIRED" language | "You MUST use the @arch tag" |
| `opus` | Softer hints and explanations | "Use the @arch tag from Context" |
| `sonnet` | Same as opus (default) | "Use the @arch tag from Context" |

### Sample Output (Haiku)

```markdown
## Context: src/core/db/

@arch: archcodex.core.engine
Layer: core → can:[utils, validators] cannot:[cli, mcp, llm]
Forbid: commander, chalk, ora, console.log, explicit any
Order: types.ts → manager.ts → scanner.ts

Hint: Core modules should be framework-agnostic

---

## Task (REQUIRED)

Add getById method to the repository

## Requirements (MUST follow)

1. Use the @arch tag from Context above
2. Follow layer boundaries - DO NOT import from "cannot" layers
3. Avoid all items in "Forbid" list

---
After implementation, violations will be checked automatically.
```

### Programmatic API

```typescript
import { buildPrompt, getCompactContext } from 'archcodex';

// Full prompt for subagent
const { prompt, contextTokens, archTag } = await buildPrompt(
  projectRoot,
  'src/core/db/',
  {
    model: 'haiku',
    task: 'Add getById method',
    requirements: ['Must return Promise', 'Add JSDoc'],
  }
);

// Just the context block (for manual prompt building)
const context = await getCompactContext(projectRoot, 'src/utils/');
```

### Why Pre-Baked Context Works Better

| Approach | Reliability | Speed | Tokens |
|----------|-------------|-------|--------|
| Pre-provided compact | 100% | Fast | ~100 |
| Agent uses tool | ~80% | Slower | ~500+ |
| No context | 0% layer compliance | Fast | 0 |

**Key findings from LLM evaluation:**
- Layer compliance jumps from 0% to 100% with context
- Haiku needs explicit "MUST" instructions (ignored hints)
- ~100 tokens of compact context is sufficient for accurate implementation
- Opus/Sonnet respond to softer hints

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

1. **Session start**: Call `session-context --with-patterns` to prime your context
2. **Edit files**: Reference constraints from step 1 (re-prime if context is lost between sessions)
3. **Validate**: `archcodex check "src/**/*.ts"` (batch with globs)

---

## Unified Context (Primary Tool)

The `archcodex context` command (and `archcodex_context` MCP tool) is the **one-stop shop** for AI agents. It combines module structure, constraints, and entity schemas into a single output.

### CLI Usage

```bash
# Module context (recommended)
archcodex context -m src/core/db/

# Entity context
archcodex context -e users

# Multiple entities
archcodex context users,todos

# Force cache refresh
archcodex context -m src/core/db/ --refresh

# Initialize database (run first on large codebases)
archcodex context --init

# Section filtering (reduce token usage)
archcodex context -m src/core/db/ --sections modification-order,constraints

# Large modules - bypass interactive mode
archcodex context -m src/ --confirm

# Large modules - structure summary only
archcodex context -m src/ --summary

# Simple tasks - minimal essential info
archcodex context -m src/cli/ --brief
```

### Brief Mode

For simple tasks where full context (~300 lines) is overkill, use `--brief` to get just:
- Architecture ID
- Layer boundaries (CAN/CANNOT import)
- Forbidden imports/patterns

```
@arch: archcodex.cli.command
CAN import: [utils, core, validators]
CANNOT import: [mcp, config]
Forbidden: ts-morph, console.log
```

### Interactive Mode

For large modules (>30 files), the tool automatically shows a menu instead of dumping all files. The LLM can then choose:
- A specific submodule for focused context
- `confirm: true` to get all files anyway
- `summary: true` for structure overview only

This self-documenting behavior helps LLMs request exactly what they need.

### Output Structure

```yaml
# src/core/db/ (9 files, 10 entities)

## 0. Project Rules

Layer Hierarchy:
  config → (leaf)                    # Leaf layer - can't import anything
  utils → (leaf)
  core → [utils, validators]         # core can import from utils, validators
  cli → [utils, core, validators]    # cli can import from utils, core, validators

Shared Constraints (apply to ALL files):
  forbid: commander, chalk, ora      # Never import these anywhere
  patterns: console\.(log|error)     # Forbidden regex patterns
  hints: [SRP] Each file should have one reason to change
  ... +N more hints

## 1. Modification Order

DEFINES (modify first):
  index.ts [archcodex.core.barrel] - barrel export
  schema.ts [archcodex.core.engine] 🔴6 - schema definitions
  types.ts [archcodex.core.types] 🔴4 - type definitions

IMPLEMENTS (update when contracts change):
  manager.ts [archcodex.core.engine] 🔴6 - resource management
  repositories/files.ts [archcodex.core.engine] 🔴4 - data access

ORCHESTRATES (modify last):
  scanner.ts [archcodex.core.engine] 🔴4 - coordinates components

## 2. Boundaries

layer: core
CAN import: [utils, validators]
CANNOT import: [config, llm, cli, barrel, tests, bin]

## 3. Entities (inline schemas)

todos:
  fields: [text, completed, userId?, dueDate?]
  relationships: [N:1 users via userId]
  behaviors: [soft_delete, ordering]

users:
  fields: [name, email, role]
  relationships: [1:N todos]

## 4. Impact

Consumers (will break if you change exports):
  src/cli/commands/map.ts
  src/mcp/handlers/architecture-map.ts
  src/core/context/synthesizer.ts

## 5. ArchCodex

architecture: archcodex.core.engine
constraints:
  forbid: [commander, chalk, ora, ts-morph, fast-glob]
  patterns: [explicit any type]
hints:
  - Core modules should be framework-agnostic
  - [DIP] Import interfaces/types, not concrete implementations
  - [KISS] Prefer simple solutions - avoid premature optimization
  ... +N more hints

validate: archcodex_check { "files": ["src/core/db/**/*.ts"] }

---
## Available Actions

This response includes: project-rules, modification-order, boundaries, entities, impact, constraints

**Request specific sections:**
  archcodex_context { "module": "src/core/db/", "sections": ["modification-order", "constraints"] }

**For entity details:**
  archcodex_context { "entity": "todos" }
  archcodex_context { "entity": "users" }

**Validate after changes:**
  archcodex_check { "files": ["src/core/db/**/*.ts"] }
```

### Self-Documenting Output

Every response includes an "Available Actions" footer that tells LLMs:
- What sections were included/excluded
- How to request different sections
- Suggested next actions (drill down, validate, etc.)

This makes the tool **LLM-fluent** - agents never need to read documentation to understand their options.

### Key Sections

| Section | What It Provides |
|---------|------------------|
| **0. Project Rules** | Layer hierarchy (what can import what) + constraints shared across ALL architectures |
| **1. Modification Order** | DEFINES → IMPLEMENTS → ORCHESTRATES with 🔴breaks indicators |
| **2. Boundaries** | Current layer's CAN/CANNOT import rules |
| **3. Entities** | Inline entity schemas (fields, relationships, behaviors) |
| **4. Impact** | External files that will break if you change exports |
| **5. ArchCodex** | Full architecture constraints (forbid, patterns, require, all hints) |

### Benefits Over Separate Tools

| Before (Multiple Tools) | After (Single Context Call) |
|------------------------|----------------------------|
| `session-context` for layer rules | ✅ Included in Section 0 |
| `map -m` for modification order | ✅ Included in Section 1 |
| `entity_context` for schemas | ✅ Included in Section 3 |
| `read --format ai` for constraints | ✅ Included in Section 5 |
| **4 tool calls** | **1 tool call** |

---

## Architecture Map (Role-Based Module Context)

> **Note:** Consider using `archcodex context -m` instead, which includes map functionality plus constraints.

When working on a specific module, use `archcodex map -m` to get role-based file grouping that guides modification order:

```bash
archcodex map -m src/core/db/
```

### Output Structure

```
src/core/db/ (9 files, 1764 lines)

DEFINES (modify first - type definitions, schemas, interfaces):
  schema.ts - schema definitions [archcodex.core.engine] 🔴breaks: 6
  types.ts - type definitions [archcodex.core.types] 🔴breaks: 4

IMPLEMENTS (update if contracts change - core logic):
  manager.ts - manager [archcodex.core.engine] 🔴breaks: 6
  repositories/files.ts - repository [archcodex.core.engine] 🔴breaks: 4

ORCHESTRATES (coordinates implementations):
  scanner.ts - coordinator [archcodex.core.engine] (↑4 ext, ↔4 int) 🔴breaks: 4

CONSUMES (external files, may need updates):
  src/cli/commands/map.ts
  src/mcp/handlers/architecture-map.ts
```

### Key Indicators

| Indicator | Meaning |
|-----------|---------|
| `[archcodex.core.engine]` | @arch tag - shows compliance |
| `[no @arch]` | Missing @arch tag - needs attention |
| `🔴breaks: N` | High risk - N files will break if this changes |
| `(↑N ext, ↔M int)` | Import direction: external vs internal dependencies |

### Role Categories

| Role | When to Modify | Examples |
|------|----------------|----------|
| **DEFINES** | First | types.ts, schema.ts, interfaces |
| **IMPLEMENTS** | Second (if contracts change) | repositories, services, formatters |
| **ORCHESTRATES** | Third | scanners, processors, coordinators |
| **CONSUMES** | Last (may need updates) | CLI commands, handlers |

### Benefits for AI Agents

1. **Modification order is explicit** - DEFINES → IMPLEMENTS → ORCHESTRATES → CONSUMES
2. **Risk assessment is immediate** - 🔴breaks count shows impact
3. **Dependency direction visible** - ↑external vs ↔internal imports
4. **@arch compliance at a glance** - spot missing tags

### Full Mode

Use `--full` for additional details including impact chains:

```bash
archcodex map -m src/core/db/ --full
```

Shows cascade of dependents:
```
schema.ts - schema definitions (144 lines) [archcodex.core.engine] 🔴breaks: 6
  → index.ts → manager.ts → src/cli/commands/map.ts (+3 more)
```

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
| `archcodex_context` | **PRIMARY TOOL** - Full unified context: project rules, modification order, boundaries, constraints, entity schemas |
| `archcodex_session_context` | Session-wide context with all constraints (compact + deduplicated + layers) |
| `archcodex_plan_context` | Scope-aware context for a specific directory/files |
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
| `archcodex_map` | **Module context with role-based grouping** - shows modification order, impact, dependencies |
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

### Project Root Detection

When an MCP tool is invoked, the server locates the project root by walking up from the file path to find the `.arch/` directory:

```json
{ "tool": "archcodex_read", "arguments": {
    "file": "src/payment/processor.ts",
    "format": "ai"
} }
```

---

## LLM Agent Integration

### Optimal Workflow (Tested)

Based on testing with multiple agents, this workflow is most effective:

```
1. context -m <dir>       ← Get FULL context (1 tool call)
2. Write code             ← Follow DEFINES → IMPLEMENTS → ORCHESTRATES, respect constraints
3. check "src/**/*.ts"    ← Validate after changes
```

**Why this works:**
- `context -m` gives EVERYTHING in one call: structure, constraints, boundaries, entities
- Shows impact (🔴breaks: N) so you know which files are risky
- Includes all architecture constraints (forbid, patterns, hints)
- Layer hierarchy and shared constraints upfront
- No need for separate `session-context` or `map` calls

### When to Use Other Tools

| Tool | When to Use |
|------|-------------|
| `context -m <dir>` | **Always** - before modifying any module |
| `context -e <entity>` | When working with a specific entity |
| `check` | **Always** - after making changes |
| `discover` | Only when creating new files and unsure of archId |
| `read --format ai` | Only for single-file deep analysis |
| `map` | Legacy - use `context -m` instead |
| `session-context` | Legacy - constraints now included in `context` |

### Command Reference

| Task | CLI | MCP Tool |
|------|-----|----------|
| **Full context** | `context -m <dir>` | `archcodex_context` |
| **Entity context** | `context -e <entity>` | `archcodex_context` |
| **Validate** | `check "src/**/*.ts"` | `archcodex_check` |
| Find architecture | `discover "query"` | `archcodex_discover` |
| Read with constraints | `read <file> --format ai` | `archcodex_read` |

---

## Agent Instructions Template

Add this to your `CLAUDE.md` or agent instruction file. This template was tested with both Haiku and Opus models.

````markdown
# ArchCodex Instructions

This project uses ArchCodex for architectural constraints.

## BEFORE MODIFYING CODE

**STOP.** Call this MCP tool first:
```json
archcodex_context { "module": "src/path/to/module/" }
```

Do NOT use Read, Grep, or Glob to explore. The `archcodex_context` tool gives you **everything**:
- **Project Rules** - Layer hierarchy + shared constraints
- **Modification Order** - DEFINES → IMPLEMENTS → ORCHESTRATES
- **Impact** - 🔴breaks: N shows how many files depend on each file
- **Boundaries** - What this layer CAN/CANNOT import
- **Constraints** - forbid, patterns, require, all hints
- **Entity Schemas** - Fields, relationships, behaviors

## Workflow

```
1. archcodex_context       ← GET FULL CONTEXT FIRST
2. Write code              ← Follow modification order, respect constraints
3. archcodex_check         ← VALIDATE AFTER CHANGES
```

## MCP Tools

| When | Tool Call |
|------|-----------|
| Before modifying | `archcodex_context { "module": "src/dir/" }` |
| Before creating | `archcodex_discover { "query": "description" }` |
| After changes | `archcodex_check { "files": ["src/**/*.ts"] }` |
| Entity work | `archcodex_context { "entity": "EntityName" }` |

## Understanding context Output

```yaml
## 0. Project Rules
Layer Hierarchy:
  core → [utils, validators]        ← core can import utils, validators
  cli → [utils, core, validators]

Shared Constraints (apply to ALL files):
  forbid: commander, chalk          ← Never import these anywhere
  patterns: console\.(log|error)    ← Forbidden code patterns

## 1. Modification Order
DEFINES (modify first):
  types.ts [arch.id] 🔴4            ← Change FIRST, 4 files depend on this

IMPLEMENTS (update when contracts change):
  service.ts [arch.id] 🔴2          ← Change SECOND

ORCHESTRATES (modify last):
  handler.ts [arch.id]              ← Change LAST

## 2. Boundaries
layer: core
CAN import: [utils, validators]
CANNOT import: [cli, mcp]           ← NEVER import from these

## 5. ArchCodex
architecture: archcodex.core.engine
constraints:
  forbid: [commander, chalk]
  patterns: [explicit any type]
hints:
  - Core modules should be framework-agnostic
```

## @arch Tags

Every new file MUST have:
```typescript
/** @arch <architecture-id> */
```

Use `archcodex_discover` to find the right architecture ID.
````

---

## Handling Violations

When violations occur:
1. **Preferred**: Fix using `suggestion` and `didYouMean` from JSON
2. **Consider**: Can you refactor to comply? Should architecture be updated?
3. **Last resort**: Add `@override` with `@reason` and `@expires`

---

## Improving the Registry with Agent Feedback

After a complex coding session, ask the AI agent these questions:

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

Over time, this feedback loop compounds. Each constraint added from observing mistakes prevents that class of drift in future sessions.

---

### Test Results

We tested different workflows with Haiku agents on real tasks:

| Workflow | Tool Calls | Result |
|----------|------------|--------|
| `context -m` first | **1** | ✅ Full context: structure, constraints, entities, boundaries |
| `map --module` first | 1-2 | ✅ Structure only, needed extra calls for constraints |
| `session-context` first | 1 + exploration | ⚠️ Too much info, still needed to explore |
| No ArchCodex tools | ~20 | ✅ Same result, 20x slower |

**Key finding**: `context -m` gives everything in **1 tool call**: structure, constraints, layer rules, entity schemas. No need for separate `session-context` or `map` calls.

---

## Related Documentation

- [CLI Analysis](cli/analysis.md) - read and neighborhood commands
- [CLI Discovery](cli/discovery.md) - discover and decide commands
- [Configuration](configuration.md) - LLM provider settings
- [Back to README](../README.md)
