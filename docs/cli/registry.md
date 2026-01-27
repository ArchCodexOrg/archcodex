# CLI: Registry Commands

Commands for registry and index management.

**Commands covered:** `reindex`, `sync-index`, `migrate-registry`, `audit`, `intents`

---

## `archcodex reindex [arch_id]`

Auto-generate keywords for the discovery index using LLM analysis.

```bash
# Generate keywords for all architectures
archcodex reindex

# Generate keywords for a specific architecture
archcodex reindex domain.payment.processor

# Dry run (preview without updating index.yaml)
archcodex reindex --dry-run
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview keywords without updating index.yaml |
| `-p, --provider <name>` | LLM provider: `openai`, `anthropic`, `prompt` (default: `prompt`) |
| `--list-providers` | List available LLM providers |
| `--json` | Output as JSON |
| `-c, --config <path>` | Path to config file (default: `.arch/config.yaml`) |

### Prompt Mode

When using prompt mode (default provider), provide keywords as a JSON array:

```json
["engine", "orchestrator", "use case", "validation", "workflow"]
```

---

## `archcodex sync-index`

Sync discovery index with registry after changes.

```bash
# Check if index is stale
archcodex sync-index

# Force regeneration
archcodex sync-index --force

# Check staleness only (exits 1 if stale, 0 if up-to-date)
archcodex sync-index --check

# JSON output
archcodex sync-index --json
```

### Options

| Option | Description |
|--------|-------------|
| `--force` | Force regeneration even if index appears up-to-date |
| `--check` | Check staleness without syncing (exit code indicates status) |
| `--quiet` | Suppress non-essential output |
| `--json` | Output detailed staleness information as JSON |

### When to Use

After modifying `.arch/registry/`:
- Adding new architectures
- Updating architecture descriptions
- Changing inheritance

The discovery index caches architecture keywords. Run `sync-index` to update it, or use `discover --auto-sync` for automatic syncing.

---

## `archcodex migrate-registry`

Convert single-file `registry.yaml` to multi-file directory structure for better organization.

```bash
# Preview what will be created
archcodex migrate-registry --dry-run

# Execute migration
archcodex migrate-registry

# Force overwrite existing directory
archcodex migrate-registry --force
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be created without writing files |
| `--force` | Overwrite existing registry directory |

### File Naming Convention

| Architecture ID | File Path |
|-----------------|-----------|
| `base` | `base.yaml` |
| `archcodex.cli` | `cli/_index.yaml` |
| `archcodex.cli.command` | `cli/command.yaml` |
| `archcodex.core.domain` | `core/domain/_index.yaml` |
| `archcodex.core.domain.schema` | `core/domain/schema.yaml` |
| mixins | `_mixins.yaml` |

### Benefits of Multi-File Registry

- **Partial invalidation** - Only reload changed files
- **LLM readability** - Load only relevant architectures
- **Better git diffs** - Changes isolated to specific files
- **Scalability** - Registry can grow without becoming unwieldy

---

## `archcodex audit`

List all active overrides in the codebase.

```bash
# List all overrides
archcodex audit

# Show expired overrides
archcodex audit --expired

# Expiring within 30 days
archcodex audit --expiring 30

# Show override clusters that could become intents
archcodex audit --suggest-intents

# JSON output
archcodex audit --json
```

### Options

| Option | Description |
|--------|-------------|
| `--expired` | Show only expired overrides |
| `--expiring <days>` | Show overrides expiring within N days (default: 30) |
| `--suggest-intents` | Show override clusters that could be promoted to intents |
| `--json` | Output as JSON |
| `-c, --config <path>` | Path to config file (default: `.arch/config.yaml`) |

### Override Format

```typescript
/**
 * @arch domain.payment.processor
 * @override forbid_import:http
 * @reason Legacy API requires direct HTTP access - migration planned for Q3
 * @expires 2026-06-01
 * @ticket ARCH-123
 */
```

---

## `archcodex intents`

Discover, manage, and validate semantic intent annotations.

```bash
# List all defined intents
archcodex intents --list

# Show details for a specific intent
archcodex intents --show admin-only

# Show intent usage across codebase
archcodex intents --usage

# Validate all intent usage
archcodex intents --validate

# JSON output
archcodex intents --list --json
```

### Options

| Option | Description |
|--------|-------------|
| `-l, --list` | List all defined intents by category |
| `-s, --show <name>` | Show details for a specific intent |
| `-u, --usage` | Show intent usage across codebase |
| `-v, --validate` | Validate all intent usage (patterns, conflicts) |
| `--json` | Output as JSON |

### Output (--list)

```
DEFINED INTENTS
════════════════════════════════════════════════════════════

  auth
    admin-only           Restricted to admin users ✓req ⚡conf
    public-endpoint      Endpoint requires no authentication ✗forb ⚡conf

  lifecycle
    stateless            Component has no internal state ✗forb

  Total: 11 intents
```

### Output (--validate)

```
INTENT VALIDATION
════════════════════════════════════════════════════════════

Missing Required Patterns (1)
  src/api/admin.ts
    Intent '@intent:admin-only' requires pattern '/isAdmin/i'

Conflicting Intents (2)
  src/api/endpoint.ts
    Intent '@intent:admin-only' conflicts with '@intent:public-endpoint'

✗ 3 issues found in 22 intents
```

### Validation Checks

- **Undefined intents**: Used but not in registry
- **Missing patterns**: `@intent:admin-only` without `isAdmin` in code
- **Forbidden patterns**: `@intent:stateless` with `this.cache`
- **Conflicts**: `@intent:public-endpoint` + `@intent:admin-only`
- **Missing required intents**: `@intent:cached` without `@intent:idempotent`

---

## Related Documentation

- [Semantic Intents](../intents.md) - Full intent documentation
- [CLI Validation](validation.md) - Health dashboard includes intent metrics
- [Configuration](../configuration.md) - Registry configuration
- [Back to README](../../README.md)
