# CLI: Scaffolding Commands

Commands for creating and tagging files.

**Commands covered:** `scaffold`, `action`, `feature`, `tag`, `infer`, `bootstrap`, `learn`

---

## `archcodex scaffold <arch_id>`

Generate a new file from template.

```bash
archcodex scaffold domain.payment.processor --name RefundProcessor

# Preview without writing
archcodex scaffold domain.payment.processor --name RefundProcessor --dry-run

# Specify output directory
archcodex scaffold domain.payment.processor --name RefundProcessor --output src/payment
```

### Options

| Option | Description |
|--------|-------------|
| `--name <name>` | Name for the generated class/component |
| `--output <path>` | Output directory (overrides `default_path`) |
| `--template <template>` | Template to use for scaffolding |
| `--dry-run` | Preview without writing file |
| `--overwrite` | Overwrite existing file if it exists |

### Generated File Features

Creates a file with:
- Correct `@arch` tag
- Required imports based on reference implementations
- Class structure skeleton from `reference_implementations` (if defined)
- Smart path/naming from `default_path` and `file_pattern` (if defined)

### AI-native Fields

Architectures can define scaffolding hints:

```yaml
domain.payment.processor:
  file_pattern: "${name}Processor.ts"
  default_path: "src/payment"
  reference_implementations:
    - src/payment/CardProcessor.ts
```

---

## `archcodex action [query]`

Intent-based discovery — transforms "I want to add X" into actionable guidance.

```bash
# List all available actions
archcodex action list

# Show details for a specific action
archcodex action show add-constraint

# Find matching action by query
archcodex action "add validation rule"
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### Output

Returns:
- Architecture to use
- Suggested intents
- File patterns
- Checklist of steps

---

## `archcodex feature <name>`

Multi-file scaffolding - create multiple related files from a feature template.

```bash
# List available feature templates
archcodex feature list

# Show feature details
archcodex feature show validation-rule

# Preview what will be created
archcodex feature validation-rule --name MyRule --dry-run

# Scaffold the feature
archcodex feature validation-rule --name MyRule
```

### Options

| Option | Description |
|--------|-------------|
| `--name <name>` | Name for the feature components |
| `--dry-run` | Preview what files will be created |
| `--overwrite` | Overwrite existing files |
| `--skip-optional` | Skip optional template files |
| `--json` | Output as JSON |

Custom variables can be passed as additional flags (e.g., `--constraint-name MyConstraint`).

### What Gets Created

Creates all related files with proper `@arch` tags:
- Implementation file
- Test file
- Type definitions (if applicable)

---

## `archcodex tag <pattern>`

Bulk add `@arch` tags to files matching a glob pattern.

```bash
# Tag all files in a directory
archcodex tag "src/components/**/*.tsx" --arch frontend.component

# Preview changes without modifying files
archcodex tag "src/hooks/**/*.ts" --arch frontend.hook --dry-run

# Overwrite existing @arch tags
archcodex tag "src/services/**/*.ts" --arch domain.service --force

# Quiet mode (no output except errors)
archcodex tag "src/**/*.ts" --arch base --quiet
```

### Options

| Option | Description |
|--------|-------------|
| `-a, --arch <archId>` | Architecture ID to apply (required) |
| `--dry-run` | Show what would be changed without modifying files |
| `-f, --force` | Overwrite existing @arch tags |
| `-q, --quiet` | Suppress output except errors |

---

## `archcodex infer <pattern>`

Suggest architecture for files based on content analysis.

```bash
# Infer architecture for files
archcodex infer "src/**/*.ts"

# JSON output
archcodex infer "src/**/*.ts" --json

# Only show untagged files
archcodex infer "src/**/*.ts" --untagged-only

# Quiet mode (only show matches)
archcodex infer "src/**/*.ts" --quiet
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `-u, --untagged-only` | Only show files without existing @arch tags |
| `-q, --quiet` | Only show matches, suppress other output |

### Detected Patterns

| Pattern | Architecture | Confidence |
|---------|--------------|------------|
| `use*.ts` with export | `frontend.hook` | high |
| `createContext` call | `frontend.context` | high |
| `index.ts` with re-exports | `base.barrel` | high |
| `mutation()` call | `convex.mutation` | high |
| `query()` call | `convex.query` | high |
| `.tsx` with JSX return | `frontend.component` | medium |
| `*.types.ts` | `base.types` | medium |
| `*.test.ts` | `base.test` | high |

### Intent Suggestions

When `suggest_for_paths` or `suggest_for_archs` are defined on intents, they appear in infer output:

```
→ src/admin/users.ts
   Suggested: api.admin.controller [high]
   Intents:   @intent:admin-only
              └ admin-only: Restricted to admin users (path match)
```

---

## `archcodex bootstrap [pattern]`

Auto-tag all untagged files in a codebase using inference rules. Combines `infer` + `tag` for migration.

```bash
# Preview what would be tagged (default pattern: src/**/*.{ts,tsx})
archcodex bootstrap --dry-run

# Tag only high-confidence matches (default)
archcodex bootstrap --min-confidence high

# Include medium confidence matches
archcodex bootstrap --min-confidence medium

# Custom pattern
archcodex bootstrap "packages/**/src/**/*.ts" --dry-run

# JSON output
archcodex bootstrap --json
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be tagged without modifying files |
| `-c, --min-confidence <level>` | Minimum confidence to auto-tag: `high`, `medium`, `low` (default: `high`) |
| `--json` | Output results as JSON |

### Output

```
Analyzing 150 file(s)...
✓ src/hooks/useAuth.ts → @arch frontend.hook [high]
✓ src/components/UserCard.tsx → @arch frontend.component [medium]
[dry-run] src/utils/helpers.ts → @arch base.barrel [high]

Bootstrap Summary:
  Tagged:          12
  Already tagged:  85
  Low confidence:  23 (below high)
  No match:        30

Files needing manual review:
  ? src/lib/parser.ts → frontend.component [medium]
  ? src/utils/config.ts (no pattern match)
```

---

## `archcodex learn [path]` *(Experimental)*

Bootstrap architecture by analyzing your codebase with an LLM. Extracts code structure and generates a draft registry. This command is experimental — output quality depends on the LLM provider and may require manual review and adjustment.

```bash
# Analyze src/ directory (default)
archcodex learn

# Analyze a specific path
archcodex learn lib/

# Specify output location
archcodex learn -o .arch/registry-draft.yaml

# Use specific LLM provider
archcodex learn -p anthropic

# Extract skeleton only (no LLM call)
archcodex learn --dry-run

# Output skeleton as JSON
archcodex learn --dry-run --json

# Limit files analyzed
archcodex learn --max-files 50

# Provide hints for the LLM
archcodex learn --hints "This is a payment processing system with PCI compliance requirements"

# List available LLM providers
archcodex learn --list-providers
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output path for draft registry (default: `.arch/registry-draft.yaml`) |
| `-p, --provider <name>` | LLM provider: `openai`, `anthropic`, or `prompt` (default: auto-detect) |
| `--dry-run` | Extract skeleton only, do not call LLM |
| `--json` | Output skeleton as JSON (with `--dry-run`) |
| `--max-files <n>` | Maximum files to analyze |
| `--hints <text>` | Additional hints for the LLM about your codebase |
| `--list-providers` | List available LLM providers |

### Output

```
════════════════════════════════════════════════════════════════
  ARCHCODEX LEARN
════════════════════════════════════════════════════════════════

Analyzing: src/
Found: 175 files in 342ms
Clusters: 8
Existing tags: 12

Provider: anthropic

────────────────────────────────────────────────────────────────
GENERATED REGISTRY
────────────────────────────────────────────────────────────────

Output: .arch/registry-draft.yaml
Confidence: 85%
Tokens: 12543 (8234 in, 4309 out)

Explanation:
Detected a payment processing system with clear domain boundaries.
Created architectures for payment, billing, and shared utilities.
Applied PCI-related constraints based on payment module patterns.

Next Steps:
  → Review the generated registry at .arch/registry-draft.yaml
  → Run 'archcodex simulate .arch/registry-draft.yaml' to preview impact
  → Refine constraints based on your specific requirements
  → Move to .arch/registry.yaml when satisfied

────────────────────────────────────────────────────────────────

Preview the generated registry:
  cat .arch/registry-draft.yaml

Simulate the impact before applying:
  archcodex simulate .arch/registry-draft.yaml
```

### Prompt Mode

When no API keys are configured (or using `-p prompt`), the command outputs a prompt you can copy to Claude Code or another LLM:

```
Prompt mode: Copy the above prompt to Claude Code or another LLM.
Paste the generated YAML into: .arch/registry-draft.yaml
```

### What Gets Extracted

The skeleton extractor analyzes:
- **File structure** - Directory organization and naming patterns
- **Import clusters** - Which files import from each other
- **Existing @arch tags** - Already-tagged files for reference
- **Code patterns** - Classes, functions, decorators

### Workflow

1. **Extract** - Run `learn` to analyze your codebase
2. **Review** - Check the generated `registry-draft.yaml`
3. **Simulate** - Run `simulate registry-draft.yaml` to preview impact
4. **Refine** - Edit the draft based on your requirements
5. **Deploy** - Move/rename to `registry.yaml` or `registry/` directory

---

## Related Documentation

- [CLI Discovery](discovery.md) - Finding the right architecture
- [CLI Analysis](analysis.md) - Reading files with context
- [CLI Versioning](versioning.md) - `simulate` command for previewing impact
- [Configuration](../configuration.md) - Inference rules and LLM configuration
- [Back to README](../../README.md)
