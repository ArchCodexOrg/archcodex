# Claude Code Instructions for ArchCodex

This project uses **ArchCodex** to enforce architectural constraints. Every source file in `src/**/*.ts` must have an `@arch` tag.

## Getting Help

```bash
archcodex help                    # List help topics
archcodex help creating           # Starting new files
archcodex help validating         # Checking code
archcodex help understanding      # Learning constraints
archcodex help --full             # All commands
```

**MCP users:** Use `archcodex_help` tool with optional `topic` parameter.

## Critical Workflow

### Before Creating a New File

```bash
# Find the right architecture
archcodex discover "what you're building"

# Scaffold with the discovered architecture
archcodex scaffold <arch_id> --name ClassName
```

### Before Reading/Editing a File

```bash
# Get constraints in AI-optimized format
archcodex read src/path/file.ts --format ai

# Check import boundaries before adding imports
archcodex neighborhood src/path/file.ts

# Check impact before refactoring
archcodex impact src/path/file.ts
```

### After Making Changes

```bash
# Validate (supports glob patterns)
archcodex check "src/**/*.ts"
```

### Before Committing

```bash
npm run validate
```

## AI Session Workflows

### Session Start (Broad Understanding)

Prime context with all constraints at session start (~70% fewer tool calls):

```bash
archcodex session-context                 # Default: compact + deduplicated
archcodex session-context --with-patterns # Include canonical implementations
```

### Plan Mode (Multi-File Changes)

When working on a specific area, use scoped context:

```bash
# 1. Get scoped constraints for planning
archcodex plan-context src/core/health/

# 2. Validate proposed changes BEFORE writing
echo '{"changes":[
  {"path":"src/core/health/scorer.ts","action":"create","archId":"archcodex.core.engine"}
]}' | archcodex validate-plan --stdin

# 3. Write code, then validate
archcodex check "src/core/health/*.ts"
```

### When to Use Which

| Scenario | Command |
|----------|---------|
| Session start / broad understanding | `session-context` |
| Multi-file changes in specific area | `plan-context <dir>` |
| Single file editing | `read --format ai` |
| Pre-flight validation | `validate-plan` |
| Post-edit validation | `check` |

## The @arch Tag

Every new source file MUST have an `@arch` tag:

```typescript
/**
 * @arch archcodex.core.domain.parser
 */
```

Use `archcodex discover` if unsure which architecture to use.

## Common Architectures (This Project)

| Pattern | When to Use |
|---------|-------------|
| `archcodex.core.types` | Pure type definitions (`*.types.ts`) |
| `archcodex.core.domain` | Business logic with tests |
| `archcodex.core.domain.schema` | Zod schemas |
| `archcodex.core.domain.constraint` | Constraint validators |
| `archcodex.core.engine` | Use case orchestrators |
| `archcodex.cli.command` | CLI command handlers |
| `archcodex.util` | Pure utility functions |

Run `archcodex schema --architectures` for the full list.

## Mixins (Reusable Constraint Sets)

Mixins are reusable constraint/hint bundles applied via `mixins: [name]` in architectures:

| Mixin | Purpose | Key Constraint |
|-------|---------|----------------|
| `srp` | Single Responsibility | max_public_methods: 7 |
| `ocp` | Open/Closed Principle | Extension hints |
| `lsp` | Liskov Substitution | Contract hints |
| `isp` | Interface Segregation | max_public_methods: 5 |
| `dip` | Dependency Inversion | Abstraction hints |
| `tested` | Requires test file | require_test_file |
| `pure` | No side effects | forbid_import: [fs, path] |
| `barrel` | Re-exports only | naming_pattern: index.ts |
| `types` | Type definitions only | naming_pattern: *.types.ts |

See `.arch/registry/_mixins.yaml` for full definitions.

## Handling Violations

When a constraint violation occurs:

1. **Fix the code** - Use the `suggestion` and `didYouMean` from `--json` output
2. **Use an intent** - If it's a known valid pattern: `archcodex intents --list`
3. **Add an override** - Last resort, requires `@reason` and `@expires`:

```typescript
/**
 * @arch archcodex.core.domain
 * @override forbid_import:fs
 * @reason Need filesystem access for config loading
 * @expires 2026-06-01
 */
```

## Pattern Registry

Before creating utilities, check `.arch/patterns.yaml` for canonical implementations:

- **Logging** - Use `logger` from `src/utils/logger.ts`
- **File I/O** - Use `src/utils/file-system.ts`
- **YAML parsing** - Use `parseYaml` from `src/utils/yaml.ts`
- **Glob matching** - Use `globFiles` from `src/utils/file-system.ts`

## Quick Command Reference

| Task | Command |
|------|---------|
| Find architecture | `archcodex discover "query"` |
| Read with context | `archcodex read <file> --format ai` |
| Check imports | `archcodex neighborhood <file>` |
| Validate | `archcodex check <file>` |
| Explain constraint | `archcodex why <file> <constraint>` |
| List intents | `archcodex intents --list` |
| Health dashboard | `archcodex health` |

## Documentation

Comprehensive documentation is in `docs/`:

- [Getting Started](docs/getting-started.md) - Core concepts, workflows
- [AI Integration](docs/ai-integration.md) - Session context, MCP tools
- [Constraint Reference](docs/constraint-reference.md) - All 28 rules
- [Intents](docs/intents.md) - Semantic intent annotations
- [CI Integration](docs/ci-integration.md) - Pre-commit, GitHub Actions

## Project Structure

```
.arch/
├── config.yaml       # Configuration
├── registry/         # Architecture definitions (multi-file)
│   ├── _mixins.yaml     # Reusable constraint/hint sets (SOLID, DRY, etc.)
│   ├── _actions.yaml    # Scaffold actions for common tasks
│   ├── _features.yaml   # Multi-file scaffolding templates
│   ├── _intents.yaml    # Intent annotations for exceptions
│   ├── base.yaml        # Root architecture (inherited by all)
│   └── <layer>/         # Layer-specific architectures
│       └── _index.yaml  # Parent architecture for the layer
├── index.yaml        # Discovery keywords (auto-generated)
├── patterns.yaml     # Canonical implementations
└── concepts.yaml     # Semantic concept mappings

src/
├── cli/commands/     # CLI command handlers
├── core/             # Domain logic (validation, hydration, discovery)
├── llm/              # LLM integration (verify, reindex)
├── mcp/              # MCP server
├── utils/            # Shared utilities
└── validators/       # Language-specific validators
```

### Registry _index.yaml Files

Each registry subdirectory has a `_index.yaml` defining the parent architecture for that layer:
- `cli/_index.yaml` defines `archcodex.cli`
- `core/_index.yaml` defines `archcodex.core`
- `infra/_index.yaml` defines `archcodex.infra`

Child architectures in the same directory inherit from their layer's parent.
