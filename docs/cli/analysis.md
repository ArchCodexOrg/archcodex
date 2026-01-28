# CLI: Analysis Commands

Commands for code analysis and context retrieval.

**Commands covered:** `session-context`, `plan-context`, `read`, `neighborhood`, `types`, `garden`

---

## `archcodex session-context [patterns...]`

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

1. **Session start**: `archcodex session-context --with-patterns`
2. **Edit files**: Constraints are already in context
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
