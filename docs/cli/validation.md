# CLI: Validation Commands

Commands for checking and validating files against architectural constraints.

**Commands covered:** `check`, `verify`, `validate-plan`, `health`, `why`, `test-pattern`

---

## `archcodex check [files...]`

Validate files against architectural constraints.

```bash
# Check specific files
archcodex check src/payment/processor.ts

# Check all TypeScript files
archcodex check src/**/*.ts

# JSON output for CI
archcodex check src/**/*.ts --json

# Compact output for pre-commit
archcodex check --staged --format compact

# Strict mode (warnings = errors)
archcodex check src/**/*.ts --strict

# With thresholds for gradual adoption
archcodex check --max-errors 0 --max-warnings 50

# Project-level validation (cross-file constraints)
archcodex check --project

# Incremental validation (only changed files + dependents)
archcodex check --project --incremental

# Test with a specific registry file (auto-resolves dependencies)
archcodex check src/cli/commands/check.ts --registry .arch/registry/cli/command.yaml

# Load only CLI architectures for faster validation
archcodex check src/cli/**/*.ts --registry-pattern "cli/**"
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--format <fmt>` | Output format: `human`, `json`, `compact` |
| `--strict` | Treat warnings as errors |
| `--errors-only` | Only show errors, hide warnings |
| `--staged` | Only check git staged files |
| `--max-errors <n>` | Fail if errors exceed threshold |
| `--max-warnings <n>` | Fail if warnings exceed threshold |
| `--include <patterns>` | Include patterns for gradual adoption |
| `--exclude <patterns>` | Exclude patterns |
| `--precommit` | Use precommit settings from config |
| `--project` | Enable project-level validation (cross-file constraints) |
| `--incremental` | Only validate changed files and their dependents (requires `--project`) |
| `--registry <path>` | Custom registry file or directory path |
| `--registry-pattern <patterns>` | Load only matching registry patterns (e.g., `cli/**`) |
| `--record-violations` | Record violations to `.arch/feedback.json` for analysis |
| `--detect-duplicates` | Detect potential code duplication by structural similarity |
| `--similarity-threshold <n>` | Similarity threshold for duplicate detection (0-1, default: 0.7) |
| `--no-cache` | Disable validation caching (cache enabled by default) |

### Dynamic Registry Loading

Load only specific architectures for faster validation or testing:

```bash
# Test a specific architecture file (auto-resolves parent dependencies)
archcodex check src/cli/commands/check.ts --registry .arch/registry/cli/command.yaml

# Load by pattern (e.g., only CLI architectures)
archcodex check src/cli/**/*.ts --registry-pattern "cli/**"

# Combine patterns
archcodex check src/cli/**/*.ts --registry-pattern "cli/**" --registry-pattern "core/*"
```

**Auto-dependency resolution:** When using `--registry` with a single file from `.arch/registry/`, ArchCodex automatically loads:
- Parent architectures in the inheritance chain
- The `base.yaml` file
- The `_mixins.yaml` file if mixins are referenced

**Pattern matching for `--registry-pattern`:**

| Pattern | Matches |
|---------|---------|
| `cli/*` | `cli/command`, `cli/formatter` (single level) |
| `cli/**` | `cli/command`, `cli/mcp/tools` (any depth) |
| `core` | `core/_index` only |
| `base` | `base.yaml` |

### Project-Level Output (`--project`)

When using `--project`, the output includes:
- **Import graph stats** - files analyzed, build time
- **Cycle detection** - circular dependency details with file paths and architecture IDs
- **Package/layer violations** - boundary crossing imports

Cycle details show the full import chain:

```
Project analysis: 232 files, 2 cycles detected (145ms)

  Cycles:
    src/core/a.ts (app.core) → src/core/b.ts (app.core) → src/core/a.ts (app.core)
    src/utils/x.ts → src/utils/y.ts → src/utils/x.ts
```

Use `--json` to get structured cycle data for tooling.

---

## `archcodex verify [files...]`

LLM-based verification of behavioral hints that static analysis cannot enforce.

```bash
# Output prompts for Claude Code to verify
archcodex verify src/payment/processor.ts

# Use OpenAI API (requires OPENAI_API_KEY)
archcodex verify src/payment/processor.ts --provider=openai

# Use Anthropic API (requires ANTHROPIC_API_KEY)
archcodex verify src/payment/processor.ts --provider=anthropic

# List available providers
archcodex verify --list-providers
```

### Provider Options

| Provider | Description |
|----------|-------------|
| `prompt` (default) | Output prompts for external verification |
| `openai` | Use OpenAI API (requires `OPENAI_API_KEY`) |
| `anthropic` | Use Anthropic API (requires `ANTHROPIC_API_KEY`) |

### Self-Verification Workflow

When using prompt mode (default):

1. **Run the verify command** - outputs verification prompts
2. **Analyze the output** - each hint becomes a verification question
3. **Provide your analysis** for each hint:
   - **PASS**: Code complies with the hint
   - **FAIL**: Code violates the hint
   - **UNSURE**: Cannot determine from static analysis

---

## `archcodex why <file> [constraint]`

Explain why a constraint applies to a file through inheritance tracing.

```bash
# Explain all constraints for a file
archcodex why src/payment/Processor.ts

# Explain a specific constraint
archcodex why src/payment/Processor.ts forbid_import:axios
```

### Output

```
Foo.ts is tagged: domain.payment.processor
domain.payment.processor inherits: domain.payment
domain.payment has constraint: forbid_import [http, axios]
Reason: "Use ApiClient for PCI-compliant logging"
```

The output shows:
- The file's `@arch` tag
- The inheritance chain
- Which architecture introduced the constraint
- The `why` explanation

---

## `archcodex health`

Show architectural health dashboard with override debt, coverage metrics, bloat detection, and recommendations.

```bash
# Interactive dashboard
archcodex health

# JSON output for CI
archcodex health --json

# Show all untagged files
archcodex health --verbose

# Custom expiring threshold
archcodex health --expiring-days 60

# Include file counts per architecture
archcodex health --by-arch

# Detect duplicate/similar type definitions across files
archcodex health --detect-type-duplicates
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `-v, --verbose` | Show all untagged files (default shows sample of 5) |
| `--expiring-days <n>` | Days threshold for expiring overrides (default: 30) |
| `--by-arch` | Include file counts per architecture |
| `--low-usage-threshold <n>` | Threshold for low usage warnings (default: 2) |
| `--no-cache` | Bypass progressive cache (slower but ensures fresh results) |
| `--no-layers` | Skip layer coverage analysis (faster on large codebases) |
| `--detect-type-duplicates` | Find duplicate/similar type definitions across files |

### Bloat Detection

The health command automatically detects registry bloat patterns:

| Detection | Default Threshold | Severity | Description |
|-----------|-------------------|----------|-------------|
| **Single-file architectures** | 1 file | warning | Architecture used by only 1 file |
| **Low-usage architectures** | ≤2 files | info | Architecture used by few files |
| **Similar architectures** | ≥80% overlap | warning | Sibling architectures with same direct constraints |
| **Redundant architectures** | no unique value | info | Leaf nodes adding no constraints/mixins/hints |
| **Deep inheritance** | >4 levels | info | Long inheritance chain |
| **Singleton violations** | >1 file | error | Architecture marked `singleton: true` used by multiple files |

All thresholds are configurable in `.arch/config.yaml` under the `health` key. See [Configuration Reference](../configuration.md#health).

> **Note:** Similar architectures detection compares only **direct constraints** (what each architecture adds on top of its parent), not inherited constraints. This prevents false positives where sibling architectures appear similar simply because they share a common parent.

### Layer Coverage

When `layers` are configured in `.arch/config.yaml`, the health command also detects:

| Detection | Severity | Description |
|-----------|----------|-------------|
| **Orphan files** | warning | Source files not covered by any layer's `paths` pattern — no import boundary enforcement |
| **Phantom paths** | info | Layer `paths` patterns that match zero files on disk — consider removing |
| **Stale exclusions** | info | `files.scan.exclude` patterns where all matched files already have `@arch` tags |

### Sample Output

```
══════════════════════════════════════════════════════════════
                    ARCHCODEX HEALTH REPORT
══════════════════════════════════════════════════════════════

Override Debt
────────────────────────────────────────
  Active:       23 overrides across 15 files
  Expiring:     7 (within 30 days)
  Expired:      2 ⚠

Architecture Coverage
────────────────────────────────────────
  Tagged files: 275/320 (86%)
  Untagged:     45 files

Registry Health
────────────────────────────────────────
  Architectures: 28/31 in use (90%)
  Unused:        3 architectures

Layer Coverage
────────────────────────────────────────
  Files in layers: 310/320 (96.9%)
  Orphan files:    10
    src/scripts/migrate.ts
    src/standalone/tool.ts
    ... and 8 more (use --verbose to see all)

Type Duplicates
────────────────────────────────────────
  ⚠ UserConfig [exact]
    → src/api/types.ts:12
    → src/web/types.ts:45
    Suggestion: Consolidate into a shared types file

Top Overridden Constraints
────────────────────────────────────────
  12 overrides: forbid_import:console
  8 overrides: max_file_lines

Intent Health
────────────────────────────────────────
  Files with intents: 17/186 (9%)
  Total intents:      22 (5 unique)
  Undefined:       1 intent(s)
  Issues:          3 validation issue(s)

Recommendations
────────────────────────────────────────
  ⚠ Expired overrides
    2 override(s) have expired and should be resolved or renewed.
    Run: archcodex audit --expired

  ⚠ Similar architectures detected
    'api.handler' and 'api.controller' are 95% similar.
    Consider consolidating with mixins.

  ⚠ Type duplicates detected
    1 duplicate type(s) found (1 exact).
    Run: archcodex health --detect-type-duplicates --json | jq .typeDuplicates
```

### Preventing Architecture Bloat

To avoid creating too many similar architectures:

1. **Use mixins** for shared behaviors instead of creating new architectures
2. **Prefer parent architectures** when the only difference is context
3. **Review health recommendations** regularly to catch bloat early

### Singleton Architectures

Mark architectures as `singleton: true` when they're designed for a single file:

```yaml
app.entry-point:
  inherits: app
  rationale: "Main application entry point - only one per app"
  singleton: true
  constraints:
    - rule: naming_pattern
      value: "^(main|index|app)\\.(ts|js)$"
```

---

## `archcodex test-pattern <regex> [glob]`

Test a regex pattern against source files before committing it as a constraint. Uses the same regex flags (`gms`) as `forbid_pattern` and `require_pattern`.

```bash
# Test a pattern against all TypeScript files
archcodex test-pattern "console\\.log" "src/**/*.ts"

# Show context around matches
archcodex test-pattern "eval\\(" "src/**/*.ts" --context 2

# Limit output
archcodex test-pattern "TODO" --max-matches 5

# JSON output
archcodex test-pattern "console\\.log" --json
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-matches <n>` | `20` | Maximum matches to show |
| `--context <n>` | `0` | Lines of context around each match |
| `--json` | | Output as JSON |

### Sample Output

```
Pattern: console\.log
Flags: gms (global, multiline, dotAll)

MATCHES (12 in 5 files):
  src/utils/debug.ts:23
    console.log('Debug:', value);
  src/cli/commands/health.ts:156
    console.log(formatted);
  ... 10 more (use --max-matches to see all)

No match in 170 files
```

### Use Cases

- **Preview matches** before adding `forbid_pattern` constraints
- **Debug regex** to ensure patterns match intended code
- **Audit codebase** for anti-patterns before defining constraints
- **Validate patterns** work correctly with `gms` flags

---

## `archcodex validate-plan [planFile]`

Pre-execution validation of proposed changes. Validates a plan against architectural constraints **before** writing code, catching violations early.

```bash
# From piped JSON (agent pipes plan)
echo '{"changes":[
  {"path":"src/core/health/scorer.ts","action":"create","archId":"archcodex.core.engine","newImports":["../config/loader.js"]},
  {"path":"src/core/health/analyzer.ts","action":"modify","newImports":["./scorer.js"]}
]}' | archcodex validate-plan --stdin

# From a plan file
archcodex validate-plan plan.json

# JSON output
archcodex validate-plan plan.json --json
```

### Options

| Option | Description |
|--------|-------------|
| `[planFile]` | Path to JSON plan file |
| `--stdin` | Read plan from standard input |
| `--json` | Output as JSON |
| `-c, --config <path>` | Path to config file |

### Input Format

```json
{
  "changes": [
    {
      "path": "src/core/health/scorer.ts",
      "action": "create",
      "archId": "archcodex.core.engine",
      "newImports": ["../config/loader.js"],
      "codePatterns": ["console.log"]
    },
    {
      "path": "src/core/health/analyzer.ts",
      "action": "modify",
      "newImports": ["./scorer.js"]
    }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `path` | Yes | File path (relative to project root) |
| `action` | Yes | `create`, `modify`, or `delete` |
| `archId` | For `create` | Architecture ID for new files |
| `newImports` | No | New imports being added |
| `codePatterns` | No | Code patterns being introduced |
| `newPath` | For renames | New path if file is being moved |

### Checks Performed

1. **Missing `@arch` tag** on `create` actions without `archId`
2. **Invalid `archId`** (not found in registry)
3. **Forbidden imports** (`newImports` vs `forbid_import` constraints)
4. **Layer boundary violations** (e.g., core importing from cli)
5. **Forbidden patterns** (`codePatterns` vs `forbid_pattern` constraints)
6. **Missing test files** (warns when `require_test_file` constraint exists)
7. **Impact analysis** (identifies files that import modified/deleted files)

### Output

```
Plan validation: PASS
2 files checked, 0 errors, 1 warning

Warnings:
  src/core/health/scorer.ts: require_test_file - No test file planned for new file
    fix: Add tests/unit/core/health/scorer.test.ts

Impacted files (1):
  src/cli/commands/health.ts
```

### MCP Tool

Available as `archcodex_validate_plan` with parameters:
- `changes`: Array of proposed change objects

```json
{ "changes": [
  {"path": "src/core/health/scorer.ts", "action": "create", "archId": "archcodex.core.engine"}
] }
```

### Workflow

Use `validate-plan` as a pre-flight check in the plan-mode workflow:

1. `plan-context src/core/health/` - Get scoped constraints
2. Design your changes
3. `validate-plan` - Validate before writing code
4. Write code
5. `check "src/core/health/*.ts"` - Post-flight validation

---

## Related Documentation

- [Constraint Reference](../constraint-reference.md) - All constraint rules
- [Configuration](../configuration.md) - Config file options
- [CI Integration](../ci-integration.md) - Pre-commit and CI setup
- [Back to README](../../README.md)
