# CLI: Versioning & Development Commands

Commands for version control, migrations, and development workflow.

**Commands covered:** `diff`, `migrate`, `simulate`, `watch`, `init`, `fetch`, `feedback`

---

## `archcodex diff <range>`

Show architecture changes between commits or branches.

```bash
# Compare main branch to current HEAD
archcodex diff main

# Compare two branches
archcodex diff main..feature/new-arch

# Compare to previous commit
archcodex diff HEAD~1

# JSON output for CI
archcodex diff main --json

# Skip affected files scan
archcodex diff main --no-files

# Show all constraint details
archcodex diff main --verbose
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--no-files` | Skip scanning for affected files |
| `--verbose` | Show detailed constraint changes |

### Output

```
═══════════════════════════════════════════════════════════════════
ARCHITECTURE CHANGES: main..HEAD
═══════════════════════════════════════════════════════════════════

ADDED
────────────────────────────────────────
  + domain.payment.refund
    New refund processing architecture

MODIFIED
────────────────────────────────────────
  ~ domain.payment.processor
    + constraint: require_decorator: @Audited
    ~ inherits: domain → domain.payment

REMOVED
────────────────────────────────────────
  - domain.legacy.payment
    Deprecated payment architecture

AFFECTED FILES: 12
────────────────────────────────────────
  Using new architecture:
    src/payment/RefundProcessor.ts (domain.payment.refund)
  Affected by constraint changes:
    src/payment/CardProcessor.ts (domain.payment.processor)

Summary:
  Architectures: +1 ~1 -1
  Mixins: +0 ~0 -0
  Affected files: 12
```

---

## `archcodex migrate <range>`

Generate and apply migration tasks when architectures change between commits or branches.

```bash
# Generate migration plan from main to HEAD
archcodex migrate main

# Compare two branches
archcodex migrate main..feature/new-arch

# JSON output
archcodex migrate HEAD~3 --json

# Apply auto-fixable migrations
archcodex migrate main --apply

# Dry run (preview without changes)
archcodex migrate main --dry-run

# Verbose output with detailed steps
archcodex migrate main --verbose
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--apply` | Apply auto-fixable migrations |
| `--dry-run` | Show what would be applied without changes |
| `--no-files` | Skip scanning for affected files |
| `--verbose` | Show detailed migration steps per file |

### Migration Actions

| Action | Auto-Applicable | Description |
|--------|-----------------|-------------|
| `add_import` | Yes | Add required import statement |
| `update_arch_tag` | Yes | Update @arch tag to new architecture |
| `add_decorator` | No | Add required decorator (needs placement) |
| `remove_decorator` | No | Remove forbidden decorator |
| `remove_import` | No | Remove forbidden import (may need refactoring) |
| `manual_review` | No | Architecture removed, needs manual update |

### Output

```
═══════════════════════════════════════════════════════════════════
MIGRATION PLAN: main → HEAD
═══════════════════════════════════════════════════════════════════

1. domain.payment.processor
   [MODIFIED] Modified 'domain.payment.processor': +2 constraints
   Files: 5
   Actions: add_import, add_decorator

2. domain.legacy.payment
   [REMOVED] Architecture 'domain.legacy.payment' removed
   Files: 3
   Actions: manual_review

────────────────────────────────────────
Summary:
  Tasks: 2
  Files: 8
  Auto-applicable: 5
  Manual review: 3

To apply auto-fixable migrations:
  archcodex migrate main..HEAD --apply
```

---

## `archcodex simulate [proposed-registry]`

Preview the impact of registry changes before applying them. Useful for risk assessment before deploying architectural changes.

```bash
# Compare current registry to a proposed registry file
archcodex simulate proposed-registry.yaml

# Compare from a git ref to current registry
archcodex simulate --from main

# Compare from a git ref to a proposed file
archcodex simulate proposed-registry.yaml --from main

# JSON output for CI/tooling
archcodex simulate proposed-registry.yaml --json

# Verbose output with file-by-file breakdown
archcodex simulate --from main --verbose

# Limit files analyzed
archcodex simulate proposed-registry.yaml --max-files 100

# Filter to specific file patterns
archcodex simulate --from main --include "src/payment/**" "src/billing/**"
```

### Options

| Option | Description |
|--------|-------------|
| `--from <ref>` | Git ref to compare from (e.g., `main`, `HEAD~1`) |
| `--json` | Output as JSON |
| `--verbose` | Show detailed file-by-file breakdown |
| `--max-files <n>` | Maximum files to analyze |
| `--include <patterns...>` | File patterns to include |

### Output

```
══════════════════════════════════════════════════════════════════
                    SIMULATION REPORT
══════════════════════════════════════════════════════════════════

Registry Changes
────────────────────────────────────────
  ADDED:    2 architecture(s)
    + domain.payment.refund
    + domain.payment.subscription
  MODIFIED: 1 architecture(s)
    ~ domain.payment.processor (added constraints)
  REMOVED:  1 architecture(s)
    - domain.legacy.payment

Impact Analysis
────────────────────────────────────────
  Files scanned:        175
  Currently passing:    170
  Currently failing:    5

  After applying changes:
    Would BREAK:         3 files  ⚠
    Would FIX:           5 files  ✓
    Unchanged:          167 files
    New coverage:        2 files

  Risk Level: MEDIUM

Breaking Changes (3 files)
────────────────────────────────────────
  ✗ src/payment/CardProcessor.ts
    New constraint: require_decorator:@Audited
  ✗ src/payment/LegacyBridge.ts
    Architecture 'domain.legacy.payment' removed
  ... and 1 more (use --verbose for full list)

Fixed by Changes (5 files)
────────────────────────────────────────
  ✓ src/payment/RefundService.ts
    Now matches domain.payment.refund
  ... and 4 more (use --verbose for full list)

Recommendations
────────────────────────────────────────
  → Add @Audited decorator to affected payment processors
  → Migrate files using domain.legacy.payment to domain.payment
```

### Risk Levels

| Level | Exit Code | Description |
|-------|-----------|-------------|
| `low` | 0 | No breaking changes |
| `medium` | 0 | Some breaking changes, manageable |
| `high` | 0 | Many breaking changes, review carefully |
| `critical` | 1 | Significant breaking changes, blocks CI |

### Use Cases

1. **Before merging registry changes** - Run simulate on PR branches
2. **Before deploying** - Assess impact of constraint changes
3. **During planning** - Preview impact of proposed architectural changes
4. **After `learn` command** - Preview impact of AI-generated registry

---

## `archcodex watch [patterns...]`

Watch files and re-validate on changes during development.

```bash
# Watch default patterns (src/**/*.ts)
archcodex watch

# Watch specific patterns
archcodex watch "src/**/*.ts" "lib/**/*.ts"

# Clear terminal between runs
archcodex watch --clear

# Custom debounce delay
archcodex watch --debounce 500
```

### Options

| Option | Description |
|--------|-------------|
| `--clear` | Clear terminal between validation runs |
| `--debounce <ms>` | Debounce delay in milliseconds (default: 300) |
| `-c, --config` | Path to config file |

### Automatic Cache Invalidation

Watch mode also monitors registry and config files. When these change:
- Validation cache is automatically cleared
- Registry and config are reloaded
- Validation engine is recreated with fresh settings

This ensures constraint changes are immediately reflected without restarting watch mode.

---

## `archcodex init`

Initialize `.arch/` directory structure.

```bash
archcodex init

# Overwrite existing configuration
archcodex init --force
```

### Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing `.arch/` configuration |

### Created Structure

```
.arch/
├── config.yaml      # Configuration
├── registry/        # Architecture definitions (multi-file)
│   ├── base.yaml
│   ├── _mixins.yaml
│   ├── _intents.yaml
│   └── ...
├── index.yaml       # Discovery keywords
├── docs/            # Documentation
└── templates/       # Scaffolding templates
```

---

## `archcodex fetch <uri>`

Resolve and return content for a pointer URI.

```bash
archcodex fetch "arch://payment/pci-guidelines"
archcodex fetch "code://src/core/base-processor.ts"
```

### URI Schemes

| Scheme | Description |
|--------|-------------|
| `arch://` | Architecture documentation pointer |
| `code://` | Source code file reference |

---

## `archcodex feedback`

Agent feedback loop - record violations and generate recommendations.

### Recording Violations

```bash
# Record violations to .arch/feedback.json
archcodex check --record-violations

# Combine with other options
archcodex check src/**/*.ts --record-violations --format compact
```

### Generating Reports

```bash
# Generate a feedback report (last 30 days by default)
archcodex feedback report

# Customize the time period and top N
archcodex feedback report --days 60 --top 15

# Output as JSON for CI/CD integration
archcodex feedback report --json
```

### Sample Report

```
══════════════════════════════════════════════════
ARCHCODEX FEEDBACK REPORT
══════════════════════════════════════════════════

Period: 12/1/2024 - 12/31/2024 (30 days)

Summary
  Total violations: 127
  Total overrides: 34
  Unique rules violated: 8
  Files affected: 45

Top Violated Constraints
  1. forbid_import:console - 45 violations (12 overrides)
  2. max_file_lines (500) - 23 violations (8 overrides)
  3. require_decorator:@Injectable - 15 violations

Recommendations
  ⚡ Consider relaxing forbid_import
     The constraint forbid_import:console has been overridden 12 times...
     Action: Add 'allow_import: [console]' to the architecture...

  🏗 Update archcodex.cli.command architecture
     All 15 violations occur in files with architecture 'archcodex.cli.command'...
```

### Viewing Statistics

```bash
# View all violation stats
archcodex feedback stats

# Filter by rule
archcodex feedback stats --rule forbid_import

# Output as JSON
archcodex feedback stats --json
```

### Managing Feedback Data

```bash
# Remove entries older than 90 days
archcodex feedback prune --days 90

# Clear all feedback data
archcodex feedback clear --confirm
```

### Recommendation Types

| Type | Icon | Description |
|------|------|-------------|
| `relax_constraint` | ⚡ | High override ratio suggests the constraint is too strict |
| `update_architecture` | 🏗 | All violations in same architecture - consider updating it |
| `review_pattern` | 🔍 | Widespread violations with few overrides - review the code pattern |
| `add_override` | ✎ | Suggest adding override for specific cases |

---

## Related Documentation

- [CI Integration](../ci-integration.md) - Pre-commit and CI setup
- [CLI Validation](validation.md) - check command with `--record-violations`
- [Configuration](../configuration.md) - Validation settings
- [Back to README](../../README.md)
