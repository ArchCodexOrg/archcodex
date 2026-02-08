# CLI: Analysis Commands

Commands for code analysis and context retrieval.

**Commands covered:** `analyze`, `context`, `prompt`, `session-context`, `plan-context`, `read`, `neighborhood`, `map`, `types`, `garden`

---

## `archcodex analyze`

**Schema-inferred analysis engine.** Detects logic, security, data, consistency, completeness, and other issues by cross-referencing spec, architecture, and component group YAML schemas. Runs 66 analyses across 6 categories.

```bash
# Run all analyses
archcodex analyze

# Filter by category
archcodex analyze --category security
archcodex analyze --category logic,data

# Filter by severity (error, warning, info)
archcodex analyze --severity error

# Filter to specific specs
archcodex analyze --spec spec.user.create,spec.user.delete

# JSON output
archcodex analyze --json
```

### Options

| Option | Description |
|--------|-------------|
| `-c, --category <categories>` | Filter by category (comma-separated) |
| `-s, --severity <level>` | Minimum severity threshold: `error`, `warning`, `info` (default: info) |
| `--spec <specIds>` | Filter to specific spec IDs (comma-separated) |
| `--json` | Output as JSON |

### Categories (66 Analyses)

| Category | Count | Description |
|----------|-------|-------------|
| **security** | 14 | Auth gaps, missing rate limits, permission mismatches, sanitization, DoS vectors |
| **logic** | 13 | Contradictory invariants, unreachable branches, scope errors, coverage gaps |
| **data** | 11 | Sensitive leakage, missing cascades, type mismatches, partial writes |
| **consistency** | 11 | Arch-spec mismatches, layer violations, inheritance conflicts, drift |
| **completeness** | 8 | Missing examples, orphaned specs, CRUD gaps |
| **other** | 9 | Effect complexity, deprecated usage, N+1 risks |

### Analysis IDs

**Security (SEC-1 to SEC-14):**
- SEC-1: Unauthenticated mutation with database/webhook effects
- SEC-2: Public endpoint without rate limiting
- SEC-3: Permission level doesn't match effect severity
- SEC-4: String input stored without sanitization
- SEC-5: Auth required but no NOT_AUTHENTICATED error example
- SEC-6: Admin permission on read-only operation
- SEC-7: Scheduler effect without rate limit
- SEC-8: ID input without NOT_FOUND error example
- SEC-9: Unbounded array input with database write effects (DoS vector)
- SEC-10: Spec requires authentication but implementation never checks user identity
- SEC-11: Invariant requires owner-scoped access but code has no owner check
- SEC-12: Permission model diverges from majority for same entity
- SEC-13: Code checks different permission than spec declares
- SEC-14: Query operation without soft-delete filter

**Logic (LOG-1 to LOG-13):**
- LOG-1: Contradictory invariants on same field
- LOG-2: Error example tests valid enum value
- LOG-3: Input has default but no example omits it
- LOG-4: UI state defined but not reachable from sequence
- LOG-5: Success example contradicts invariant
- LOG-6: Forall/exists references non-existent output field
- LOG-7: Output field never asserted in examples
- LOG-8: Input marked required but has a default value (contradictory)
- LOG-9: Implementation throws undocumented error codes
- LOG-10: Spec outputs not found in implementation
- LOG-11: Invariant has low code coverage (keyword match)
- LOG-12: Error example expects error code not found in implementation
- LOG-13: Error code shared across specs (verify consistent meaning)

**Data (DAT-1 to DAT-11):**
- DAT-1: Sensitive input field appears in outputs
- DAT-2: Delete without cascade effects for referencing specs
- DAT-3: Count invariant without update effect
- DAT-4: Database update without updatedAt in outputs
- DAT-5: Cross-spec ID table reference mismatch
- DAT-6: Nullable output without null case example
- DAT-7: Authenticated mutation without audit_log effect
- DAT-8: Early return between effects (partial writes risk)
- DAT-9: Uniqueness invariant without duplicate error example
- DAT-10: Example uses enum value not in allowed values
- DAT-11: Input type or constraint mismatch across specs for same entity

**Consistency (CON-1 to CON-11):**
- CON-1: Spec requires auth but architecture has no auth constraint
- CON-2: Touchpoints fewer than component group
- CON-3: Mixin implies import that architecture forbids
- CON-4: Side effects in pure/utility layer
- CON-5: Stateless architecture with cache effects
- CON-6: Action checklist without spec coverage
- CON-7: Spec uses deprecated architecture
- CON-8: Child architecture requires what parent forbids
- CON-9: Auth or inheritance pattern diverges from architecture majority
- CON-10: Architecture tag mismatch between spec and implementation
- CON-11: Implementation may be in wrong layer for architecture

**Completeness (CMP-1 to CMP-8):**
- CMP-1: Constrained input without boundary examples
- CMP-2: Mixin effects not listed in spec
- CMP-3: Orphaned spec (no relations)
- CMP-4: Entity has partial CRUD coverage
- CMP-5: Max constraint without too-long error example
- CMP-6: Mutation/action spec without invariants
- CMP-7: UI spec without accessibility section
- CMP-8: Optimistic UI without feedback definition

**Other (OTH-1 to OTH-10):**
- OTH-1: Effect chain complexity (5+ effects)
- OTH-2: Deprecated architecture usage
- OTH-3: High-impact spec (5+ dependents)
- OTH-4: Scheduler without idempotency invariant
- OTH-5: Webhook without external error example
- OTH-6: Forall with database effect (N+1 risk)
- OTH-8: Mixin missing required parameter
- OTH-9: Inconsistent defaults across specs writing same table
- OTH-10: Component group handler without spec coverage

### Sample Output

```
Security (2)

  WRN SEC-7 [spec.speccodex.generate.coverage]
      Scheduler effect without rate limit: risk of job queue flooding
      -> Add security.rate_limit to prevent scheduler abuse

  WRN SEC-5 [spec.test.validateOrder]
      Missing NOT_AUTHENTICATED error example: spec requires auth but no auth error case
      -> Add error example: { given: { user: null }, then: { error: "NOT_AUTHENTICATED" } }

---
2 issue(s) across 140 spec(s): 2 warning(s)
```

### JSON Output

With `--json`, returns structured data:

```json
{
  "issues": [
    {
      "id": "SEC-7",
      "category": "security",
      "severity": "warning",
      "specId": "spec.speccodex.generate.coverage",
      "message": "Scheduler effect without rate limit: risk of job queue flooding",
      "suggestion": "Add security.rate_limit to prevent scheduler abuse"
    }
  ],
  "summary": {
    "total": 76,
    "byCategory": { "logic": 64, "security": 2, "completeness": 5, "other": 5 },
    "bySeverity": { "error": 10, "warning": 59, "info": 7 },
    "specsAnalyzed": 140
  }
}
```

### MCP Tool

Available as `archcodex_analyze` with parameters:
- `projectRoot`: Absolute path to project root (required)
- `category`: Category filter (comma-separated string)
- `severity`: Minimum severity threshold
- `specIds`: Array of spec IDs to filter to

```json
// All analyses
{ "projectRoot": "/path/to/project" }

// Security only
{ "projectRoot": "/path/to/project", "category": "security" }

// Errors only
{ "projectRoot": "/path/to/project", "severity": "error" }
```

### Use Cases

| Scenario | Command |
|----------|---------|
| Spec review before merge | `analyze --severity warning` |
| Security audit | `analyze --category security` |
| Find logic bugs | `analyze --category logic --severity error` |
| CI integration | `analyze --json --severity error` |

---

## `archcodex context` (Primary Tool)

**The one-stop shop for AI agents.** Get unified context combining project rules, modification order, boundaries, constraints, and entity schemas in a single call.

```bash
# Module context (recommended)
archcodex context -m src/core/db/

# Entity context
archcodex context -e users

# Multiple entities (comma-separated)
archcodex context users,todos

# Entity context (explicit flag)
archcodex context -e UserService

# List all entities
archcodex context

# Force cache refresh
archcodex context -m src/core/db/ --refresh

# Initialize database (run first on large codebases)
archcodex context --init

# Full verbose output
archcodex context -m src/core/db/ --full

# JSON output
archcodex context -m src/core/db/ -f json
```

### Options

| Option | Description |
|--------|-------------|
| `-m, --module <path>` | Module/directory path for unified context |
| `-e, --entity <name>` | Entity name for entity context |
| `-f, --format <fmt>` | Output format: `yaml` (default), `compact`, `json` |
| `--refresh` | Force cache refresh (re-extract schema) |
| `--full` | Show full verbose output instead of compact |
| `--init` | Initialize/sync the database without showing context |
| `--sections <list>` | Filter to specific sections (comma-separated) |
| `--confirm` | Bypass interactive mode for large modules (>30 files) |
| `--summary` | Show structure summary only (submodule counts, no file lists) |
| `--without-entities` | Exclude entities section (faster for large modules) |
| `--without-impact` | Exclude impact/consumers section |
| `--brief` | Minimal essential info only (arch, boundaries, forbidden) |

### Section Filtering

Request only the sections you need to reduce token usage:

```bash
# Just modification order and constraints
archcodex context -m src/core/db/ --sections modification-order,constraints

# Everything except entities (faster for large modules)
archcodex context -m src/core/db/ --without-entities

# Quick structure check
archcodex context -m src/core/db/ --sections modification-order
```

Available sections: `project-rules`, `modification-order`, `boundaries`, `entities`, `impact`, `constraints`

### Interactive Mode (Large Modules)

For modules with >30 files, context automatically shows a submodule menu instead of dumping all files:

```bash
# Triggers interactive mode
archcodex context -m src/

# Response:
# src/ contains 180 files
# This module is large. To avoid overwhelming context, please choose:
#
# ## Submodules (pick one for focused context):
#   1. archcodex_context { "module": "src/core/" }       # 80 files
#   2. archcodex_context { "module": "src/cli/" }        # 45 files
#   3. archcodex_context { "module": "src/mcp/" }        # 15 files
#
# ## Or get everything anyway:
#   archcodex_context { "module": "src/", "confirm": true }
#
# ## Or get a summary only:
#   archcodex_context { "module": "src/", "summary": true }
```

Bypass interactive mode with `--confirm`:

```bash
# Get full output for large module
archcodex context -m src/ --confirm

# Get structure summary only
archcodex context -m src/ --summary
```

### Brief Mode

For simple tasks where full context is overkill, use `--brief`:

```bash
archcodex context -m src/cli/ --brief
```

Output (~5 lines):
```
@arch: archcodex.cli.command

CAN import: [utils, core, validators, llm]
CANNOT import: [config, barrel, tests, bin]

Forbidden: ts-morph, console.log

---
Full context: archcodex_context { "module": "src/cli/" }
```

### Output Sections

The module context (`-m`) output includes:

| Section | Description |
|---------|-------------|
| **0. Project Rules** | Layer hierarchy + shared constraints across all architectures |
| **1. Modification Order** | DEFINES → IMPLEMENTS → ORCHESTRATES with 🔴breaks indicators |
| **2. Boundaries** | Current layer's CAN/CANNOT import rules |
| **3. Entities** | Inline entity schemas (fields, relationships, behaviors) |
| **4. Impact** | External files that will break if you change exports |
| **5. ArchCodex** | Full architecture constraints (forbid, patterns, require, all hints) |

### Sample Output

```yaml
# src/core/db/ (9 files, 10 entities)

## 0. Project Rules

Layer Hierarchy:
  config → (leaf)
  utils → (leaf)
  core → [utils, validators]
  cli → [utils, core, validators, llm]

Shared Constraints (apply to ALL files):
  forbid: commander, chalk, ora
  patterns: console\.(log|error|warn|debug)
  hints: [SRP] Each file should have one reason to change
  ... +9 more hints

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

## 3. Entities

todos:
  fields: [text, completed, userId?, dueDate?]
  relationships: [N:1 users via userId]
  behaviors: [soft_delete, ordering]

## 4. Impact

Consumers (will break if you change exports):
  src/cli/commands/map.ts
  src/mcp/handlers/architecture-map.ts

## 5. ArchCodex

architecture: archcodex.core.engine
constraints:
  forbid: [commander, chalk, ora, ts-morph, fast-glob]
  patterns: [explicit any type]
hints:
  - Core modules should be framework-agnostic
  - [DIP] Import interfaces/types, not concrete implementations

validate: archcodex_check { "files": ["src/core/db/**/*.ts"] }
```

### MCP Tool

Available as `archcodex_context` with parameters:
- `projectRoot`: Absolute path to project root (required)
- `module`: Module/directory path for unified context
- `entity`: Entity name for entity context
- `format`: Output format (`compact`, `full`, `json`)
- `sections`: Array of sections to include (default: all)
- `confirm`: Bypass interactive mode for large modules (>30 files)
- `summary`: Return structure summary only (no file lists)
- `brief`: Return minimal essential info only (arch, boundaries, forbidden)

```json
// Full context for a module
{ "projectRoot": "/path/to/project", "module": "src/core/db/" }

// Large module - get full output
{ "module": "src/", "confirm": true }

// Large module - get summary only
{ "module": "src/", "summary": true }

// Section filtering
{ "module": "src/core/db/", "sections": ["modification-order", "constraints"] }

// Simple task - minimal info
{ "module": "src/cli/", "brief": true }
```

### Benefits Over Separate Tools

| Before (Multiple Tools) | After (Single Context Call) |
|------------------------|----------------------------|
| `session-context` for layer rules | ✅ Included in Section 0 |
| `map -m` for modification order | ✅ Included in Section 1 |
| `entity_context` for schemas | ✅ Included in Section 3 |
| `read --format ai` for constraints | ✅ Included in Section 5 |
| **4 tool calls** | **1 tool call** |

### First Run on Large Codebases

For large codebases (1000+ files), the first context query may take longer as it builds the database. Use `--init` to pre-populate:

```bash
# Initialize database before first use
archcodex context --init

# Now queries are fast
archcodex context -m src/core/db/
```

---

## `archcodex prompt`

Build optimized prompts with pre-baked architectural context for LLM subagents. Based on LLM evaluation testing, pre-provided context in prompts outperforms agent tool discovery.

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

# Auto-discover relevant modules from task description
archcodex prompt -t "Add caching to the database" --discover
archcodex prompt -t "Refactor entity handling" --discover --model haiku
```

### Options

| Option | Description |
|--------|-------------|
| `-m, --module <path>` | Module path(s) - comma-separated for multi-module |
| `-t, --task <description>` | Task description for the prompt (required) |
| `--model <model>` | Target model: `haiku`, `opus`, `sonnet` (default: sonnet) |
| `-r, --requirements <reqs>` | Additional requirements (comma-separated) |
| `--preview` | Add instruction for preview mode (show code, don't write) |
| `--no-validation` | Omit validation reminder |
| `--context-only` | Output just the compact context block |
| `--json` | Output as JSON with metadata |
| `--discover` | Auto-discover relevant modules from task description (interactive) |

### Task Discovery Mode

When you don't know which module to target, use `--discover` to analyze the task and get suggestions:

```bash
archcodex prompt -t "Add caching to the database layer" --discover
```

The analyzer uses pure heuristics (no LLM calls):
- **Action detection**: add, modify, refactor, delete, fix
- **Keyword extraction**: Filters stop words, extracts domain terms
- **Entity detection**: Finds PascalCase class/interface names
- **Architecture matching**: Searches indexed architectures
- **Path matching**: Searches file paths for keywords

Interactive selection allows you to choose from suggestions:
- Enter numbers (comma-separated) to select specific modules
- Enter `a` to select all suggested modules
- Enter `q` to quit

### Model-Specific Output

| Model | Instruction Style |
|-------|-------------------|
| `haiku` | Explicit "MUST", "REQUIRED", "DO NOT" language |
| `opus` | Softer hints and explanations |
| `sonnet` | Same as opus (default) |

### Sample Output

```markdown
## Context: src/core/db/

@arch: archcodex.core.engine
Layer: core → can:[utils, validators] cannot:[cli, mcp, llm]
Forbid: commander, chalk, ora, console.log, explicit any
Order: types.ts → manager.ts → scanner.ts

Hint: Core modules should be framework-agnostic

---

## Task (REQUIRED)

Add getById method

## Requirements (MUST follow)

1. Use the @arch tag from Context above
2. Follow layer boundaries - DO NOT import from "cannot" layers
3. Avoid all items in "Forbid" list

---
After implementation, violations will be checked automatically.
```

### JSON Output

With `--json`, returns structured data for programmatic use:

```json
{
  "prompt": "## Context: src/core/...",
  "metadata": {
    "modulePath": "src/core/db/",
    "archTag": "archcodex.core.engine",
    "contextTokens": 102,
    "model": "haiku",
    "task": "Add getById method"
  }
}
```

### Use Cases

| Scenario | Command |
|----------|---------|
| Delegate to Haiku subagent | `prompt -m <dir> -t "<task>" --model haiku` |
| Preview before writing | `prompt -m <dir> -t "<task>" --preview` |
| Multi-module refactor | `prompt -m dir1/,dir2/ -t "<task>"` |
| Manual prompt building | `prompt -m <dir> -t "unused" --context-only` |

### Why Use This

- **Pre-baked context** - Faster and more reliable than agent tool discovery
- **Model-aware** - Haiku gets explicit instructions, Opus gets hints
- **Token-efficient** - ~100 tokens of compact context is sufficient
- **Layer compliance** - Jumps from 0% to 100% with context included

---

## `archcodex session-context [patterns...]`

> **Note:** Consider using `archcodex context -m` instead, which includes session context functionality plus module-specific structure.

Prime the AI agent context with architecture summaries for multiple files. Reduces tool calls by ~70% compared to individual `read` calls.

```bash
# Default: compact + deduplicated + with-layers (optimized for agents)
archcodex session-context

# Custom file patterns
archcodex session-context "lib/**/*.ts" "packages/**/*.ts"

# Include canonical patterns from .arch/patterns.yaml
archcodex session-context --with-patterns

# Verbose output with all details
archcodex session-context --full

# Keep repeated constraints (skip deduplication)
archcodex session-context --with-duplicates

# Exclude layer boundary map
archcodex session-context --without-layers

# Filter to specific directories
archcodex session-context --scope src/core/ src/cli/

# JSON output for structured consumption
archcodex session-context --json
```

### Options

| Option | Description |
|--------|-------------|
| `--full` | Verbose output with all details (default is compact) |
| `--with-patterns` | Include canonical patterns (reusable implementations) |
| `--with-duplicates` | Keep duplicate constraints per architecture (default deduplicates) |
| `--without-layers` | Exclude layer boundary map (default includes layers) |
| `--scope <paths...>` | Filter to specific directory paths |
| `--json` | Output as JSON |
| `-c, --config <path>` | Path to config file |

### Output Fields

| Field | Description |
|-------|-------------|
| `Layers` | Layer boundaries (what can import what) |
| `Shared (all archs)` | Constraints common across all architectures (deduplicated) |
| `forbid:` | Forbidden imports/calls per architecture |
| `patterns:` | Forbidden code patterns (regex from `forbid_pattern`) |
| `require:` | Required imports/decorators |
| `hint:` | Key behavioral guidance |
| `Canonical Patterns` | Reusable implementations (with `--with-patterns`) |

### Sample Output (Default)

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

### MCP Tool

Available as `archcodex_session_context` with parameters:
- `patterns`: Array of glob patterns
- `full`: Boolean for verbose output (default: false, compact is default)
- `withPatterns`: Boolean to include canonical patterns
- `withDuplicates`: Boolean to keep repeated constraints (default: false)
- `withoutLayers`: Boolean to exclude layer map (default: false)
- `scope`: Array of directory paths to filter to

```json
{ "patterns": ["src/**/*.ts"], "withPatterns": true }
```

### Recommended Workflow

1. **Session start**: `archcodex session-context --with-patterns` to prime your context
2. **Edit files**: Reference constraints from step 1 (re-prime if context is lost between sessions)
3. **Validate**: `archcodex check "src/**/*.ts"` (batch with globs)

---

## `archcodex plan-context [scope...]`

Get scope-aware architecture context for plan mode. Returns layer boundaries, deduplicated constraints, and canonical patterns in a single call. Designed to replace multiple `session-context` + `read` + `neighborhood` calls when working in a specific area.

```bash
# Scope to a directory
archcodex plan-context src/core/health/

# Scope to specific files
archcodex plan-context --files src/core/health/analyzer.ts src/core/health/types.ts

# JSON output
archcodex plan-context src/core/ --json
```

### Options

| Option | Description |
|--------|-------------|
| `[scope...]` | Directory paths or glob patterns to scope to |
| `--files <paths...>` | Specific file paths to analyze |
| `--json` | Output as JSON |
| `-c, --config <path>` | Path to config file |

### Sample Output

```
# Plan Context: src/core/health/ (3 files, 2 archs)

## Layer: core
can_import: [utils, validators]
imported_by: [cli, llm]

## Shared Constraints
- forbid: commander, chalk, ora
- pattern: console\.(log|error), explicit any

### archcodex.core.engine (2 files)
files: analyzer.ts, layer-health.ts
- max_file_lines: 600
hints: Engines orchestrate domain objects
ref: src/core/validation/engine.ts
new_file: ${name}Analyzer.ts in src/core

### archcodex.core.types (1 files)
files: types.ts
hints: Pure type definitions

## Patterns (use these, don't recreate)
- logger: src/utils/logger.ts [logger]
```

### MCP Tool

Available as `archcodex_plan_context` with parameters:
- `scope`: Array of directory paths
- `files`: Array of specific file paths

```json
{ "scope": ["src/core/health/"] }
```

### When to Use

| Scenario | Tool |
|----------|------|
| Plan mode / multi-file changes | `plan-context <dir>` |
| Broad session understanding | `session-context` |
| Single file editing | `read --format ai` |

---

## `archcodex read <file>`

Read a file with hydrated architectural context.

```bash
archcodex read src/payment/processor.ts

# AI-optimized format (minimal, action-focused)
archcodex read src/payment/processor.ts --format ai

# Include reference implementation skeleton
archcodex read src/payment/processor.ts --with-example
```

### Options

| Option | Description |
|--------|-------------|
| `--format <fmt>` | Output format: `verbose` (default), `terse`, `ai` |
| `--with-example` | Include golden sample from `reference_implementations` |
| `--with-source` | Include file source in AI format (default: excluded) |
| `--with-deps` | Include `imported_by` count in AI format (slower) |
| `--no-content` | Only output the header, not the file content |
| `--no-pointers` | Exclude pointer content from hydration |
| `--token-limit <n>` | Maximum tokens for header (default: 4000) |

### Output Includes

- Inherited constraints from the architecture
- Applied mixins
- Hints for implementation
- Pointers to documentation

### AI-optimized Format (`--format ai`)

Provides lean, action-shaped output optimized for LLM comprehension:

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

**Key features:**
- **PATTERN**: Shows expected code structure (from `code_pattern` field)
- **MUST/NEVER**: Clearer than REQUIRED/FORBIDDEN for LLM comprehension
- **Usage maps**: For constraints with multiple options, shows which to use per context
- **BOUNDARIES**: Explicit CAN and CANNOT import lists
- **Inline examples**: Hints can include example code

### Golden Sample (`--with-example`)

Include reference implementation skeleton:

```bash
archcodex read src/payment/new-processor.ts --with-example
```

This inlines a skeleton from `reference_implementations` defined in the architecture.

---

## `archcodex neighborhood <file>`

Show import boundaries for a file - what it can import, what's forbidden, and who imports it.

```bash
# Default YAML output (optimized for AI parsing)
archcodex neighborhood src/payment/processor.ts

# Human-readable format
archcodex neighborhood src/payment/processor.ts --format human

# JSON format
archcodex neighborhood src/payment/processor.ts --format json

# AI-optimized format with actionable summaries
archcodex neighborhood src/payment/processor.ts --format ai

# Include pattern registry suggestions
archcodex neighborhood src/payment/processor.ts --with-patterns

# Only show violations (forbidden imports being used)
archcodex neighborhood src/payment/processor.ts --violations-only

# Include node_modules imports
archcodex neighborhood src/payment/processor.ts --include-external

# Deeper import tree analysis
archcodex neighborhood src/payment/processor.ts --depth 2
```

### Options

| Option | Description |
|--------|-------------|
| `--format <fmt>` | Output format: `yaml` (default), `human`, `json`, `ai` |
| `--depth <n>` | Import tree depth (default: 1) |
| `--with-patterns` | Include pattern registry suggestions |
| `--violations-only` | Only show violations (forbidden imports being used) |
| `--include-external` | Include node_modules imports |

### Output

```yaml
file: src/payment/processor.ts
architecture: domain.payment.processor
layer: src/payment
imported_by:
  - src/api/routes.ts
  - src/payment/index.ts
current_imports:
  - path: src/core/logger.ts
    status: allowed
  - path: src/utils/http.ts
    status: forbidden
allowed_imports: []
forbidden_imports:
  - axios
  - http
  - console
```

### Use Cases

**Always check `neighborhood` before adding new imports** to avoid constraint violations.

Shows:
- **`forbidden_imports`**: Modules you MUST NOT import
- **`current_imports`**: What the file already imports (with status)
- **`imported_by`**: Other files that depend on this file

---

## `archcodex map`

> **Note:** Consider using `archcodex context -m` instead, which includes map functionality plus constraints, layer rules, and entity schemas.

Query the architecture map database for file relationships, imports, and module context. Optimized for AI agents with role-based file grouping that guides modification order.

```bash
# Overview - show all architectures and file counts
archcodex map

# Module context - get role-based breakdown of a directory
archcodex map -m src/core/db/

# Entity query - find files related to an entity
archcodex map -e UserService

# Architecture query - list files in an architecture
archcodex map -a archcodex.core.engine

# File query - get import graph for a specific file
archcodex map -f src/core/db/scanner.ts

# Verbose output with full details
archcodex map -m src/core/db/ --full

# JSON output
archcodex map -m src/core/db/ --json

# Force re-scan before query
archcodex map --refresh
```

### Options

| Option | Description |
|--------|-------------|
| `-m, --module <path>` | Get full context for a module/directory |
| `-e, --entity <name>` | Find files related to an entity |
| `-a, --architecture <id>` | List files in an architecture (use % for wildcard) |
| `-f, --file <path>` | Get import graph for a file |
| `-d, --depth <n>` | Import traversal depth (default: 2) |
| `--refresh` | Force re-scan before query |
| `--full` | Show verbose output (default is compact for LLM consumption) |
| `--json` | Output as JSON |

### Role-Based Module Output

The `-m` (module) option provides role-based file grouping optimized for AI agents:

```
src/core/db/ (9 files, 1764 lines)

DEFINES (modify first - type definitions, schemas, interfaces):
  index.ts - barrel export [archcodex.core.barrel]
  schema.ts - schema definitions [archcodex.core.engine] 🔴breaks: 6
  types.ts - type definitions [archcodex.core.types] 🔴breaks: 4

IMPLEMENTS (update if contracts change - core logic):
  formatters.ts - formats output [archcodex.core.engine] 🔴breaks: 3
  manager.ts - manager - resource management [archcodex.core.engine] 🔴breaks: 6
  repositories/files.ts - repository - data access [archcodex.core.engine] 🔴breaks: 4

ORCHESTRATES (coordinates implementations):
  scanner.ts - coordinates multiple components [archcodex.core.engine] (↑4 ext, ↔4 int) 🔴breaks: 4

CONSUMES (external files, may need updates):
  src/cli/commands/map.ts
  src/mcp/handlers/architecture-map.ts
```

### Output Indicators

| Indicator | Meaning |
|-----------|---------|
| `[archcodex.core.engine]` | @arch tag compliance status |
| `[no @arch]` | File missing @arch tag |
| `🔴breaks: N` | High impact - N files depend on this (3+) |
| `🟡breaks: N` | Medium impact - N files depend on this (1-2) |
| `(↑N ext, ↔M int)` | Dependency direction: N external imports, M internal imports |

### Role Categories

Files are automatically classified into roles based on name patterns and import analysis:

| Role | Description | When to Modify |
|------|-------------|----------------|
| **DEFINES** | Type definitions, schemas, interfaces, barrel exports | First - these define contracts |
| **IMPLEMENTS** | Repositories, services, managers, formatters | Second - update if contracts change |
| **ORCHESTRATES** | Scanners, processors, coordinators | Third - coordinates implementations |
| **CONSUMES** | External files that use this module | Last - may need updates |

### Full Mode Output

With `--full`, includes additional details:

```
─ DEFINES ─
  (modify first - type definitions, schemas, interfaces)
  schema.ts - schema definitions (144 lines) [archcodex.core.engine] 🔴breaks: 6
    → index.ts → manager.ts → src/cli/commands/map.ts (+3 more)
```

- Line counts for each file
- Impact chains showing cascade of dependents
- Internal dependency graph
- Entity references

### Use Cases

**Before modifying a module:**
```bash
archcodex map -m src/core/db/
```
See which files to modify first (DEFINES), what will break, and the impact chain.

**Find all files related to an entity:**
```bash
archcodex map -e UserService
```

**Check import relationships:**
```bash
archcodex map -f src/core/db/scanner.ts --depth 3
```

### MCP Tool

Available as `archcodex_map` with parameters:
- `entity`: Entity name to find related files
- `architecture`: Architecture ID to list files
- `file`: File path to get import graph
- `module`: Module path for full context
- `depth`: Import traversal depth
- `refresh`: Force re-scan before query

```json
{ "module": "src/core/db/", "refresh": false }
```

---

## `archcodex types [files...]`

Type consistency analysis - detect duplicate and similar type definitions.

```bash
# Scan all source files
archcodex types

# Scan specific directory
archcodex types src/models

# Higher similarity threshold (default: 80%)
archcodex types --threshold 90

# Include non-exported types
archcodex types --include-private

# JSON output
archcodex types --json
```

### Options

| Option | Description |
|--------|-------------|
| `--threshold <n>` | Similarity threshold percentage (default: 80) |
| `--include-private` | Include non-exported (private) types |
| `--json` | Output as JSON |

### Detection Types

| Type | Description |
|------|-------------|
| **Exact Duplicates** | Same name and identical structure in multiple files |
| **Renamed Duplicates** | Different names but identical structure |
| **Similar Types** | >80% property overlap (configurable) |

### Sample Output

```
🔍 Type Consistency Report

  Types scanned: 150

EXACT DUPLICATES (2):
  ≡ User
    → src/models/user.ts:5
    → src/api/types.ts:12
    Suggestion: Consolidate into single definition at src/models/user.ts:5

SIMILAR TYPES (1):
  ≈ UserProfile ~ UserData (85%)
    → src/ui/types.ts:3
    → src/api/types.ts:20
    Missing: createdAt
    Extra: displayName
    Suggestion: UserProfile and UserData are 85% similar - consider consolidating

──────────────────────────────────────────────────────────────

⚠ Duplicate types found. Consider consolidating.
```

---

## `archcodex garden`

Analyze codebase for pattern consistency and index health.

```bash
# Run full analysis
archcodex garden

# Detect naming patterns (e.g., *Card.tsx, *Service.ts)
archcodex garden --detect-patterns

# Check for inconsistent @arch usage
archcodex garden --check-consistency

# Suggest missing keywords (with quality filtering)
archcodex garden --suggest-keywords

# Analyze existing keywords and suggest removals
archcodex garden --cleanup-keywords

# Detect duplicate/similar type definitions (deprecated — use health --detect-type-duplicates)
archcodex garden --detect-type-duplicates

# Add suggested keywords to .arch/index.yaml
archcodex garden --apply-keywords

# Remove low-quality keywords from .arch/index.yaml
archcodex garden --apply-cleanup

# Use AST-based semantic analysis (slower but more accurate)
archcodex garden --semantic

# Adjust "too common" threshold (default: 3 architectures)
archcodex garden --max-keyword-usage 5

# JSON output
archcodex garden --json
```

### What It Detects

- **Patterns**: File clusters sharing naming conventions
- **Inconsistencies**: Same naming pattern, different @arch tags
- **Missing keywords**: High-quality terms that should be in the discovery index
- **Low-quality keywords**: Terms that should be removed from the index
- **Type duplicates**: Similar or identical type definitions across files (deprecated — use `archcodex health --detect-type-duplicates`)

### Keyword Quality Filters

| Filter | Description |
|--------|-------------|
| **Stopwords** | Common words blocked (handler, data, index, util, helper, etc.) |
| **Too common** | Keywords appearing in 3+ architectures don't help differentiate |
| **Too short** | Keywords < 4 characters filtered (except semantic terms) |
| **Non-descriptive** | File paths, regex patterns, long strings removed |
| **Semantic preservation** | Valuable terms kept (service, component, hook, repository, etc.) |

**Note:** The gardener suggests improvements; it doesn't block. It's a maintenance tool, not a gate.

---

## Related Documentation

- [CLI Validation](validation.md) - Checking files against constraints
- [AI Integration](../ai-integration.md) - AI-native features
- [Back to README](../../README.md)
