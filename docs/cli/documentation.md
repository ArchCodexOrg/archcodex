# Documentation CLI Reference

Generate Architecture Decision Records (ADRs) and API documentation from architectures and specs.

## Quick Reference

| Command | Description |
|---------|-------------|
| `doc adr` | Generate ADR from architecture |
| `doc adr --all` | Generate all ADRs with index |
| `doc watch` | Watch and regenerate on changes |
| `doc verify` | CI: verify docs are up-to-date |
| `doc templates` | List/init custom templates |
| `spec doc` | Generate docs from spec |

## Commands

### doc adr

Generate an Architecture Decision Record from an architecture definition.

```bash
# Generate ADR for single architecture
archcodex doc adr domain.service

# Output to file
archcodex doc adr domain.service -o docs/adr/

# Generate all ADRs with index
archcodex doc adr --all -o docs/adr/

# Include inheritance chain details
archcodex doc adr domain.service --include-inheritance

# Include reference implementations
archcodex doc adr domain.service --include-references

# Compact format (less verbose)
archcodex doc adr domain.service --format compact
```

**Options:**
- `-o, --output` - Output directory (prints to stdout if omitted)
- `--all` - Generate ADRs for all architectures
- `--include-inheritance` - Show inheritance chain details
- `--include-references` - Include reference implementations
- `--format` - Output format: `standard` (default), `compact`
- `--json` - Output metadata as JSON

**Output (standard):**
```markdown
# ADR: domain.service

**Status:** Active
**Architecture ID:** domain.service

## Context

Domain service for business logic

### Rationale

Services contain pure business logic.
They should be framework-agnostic and easily testable.

### Inheritance Chain

1. base
2. domain
3. domain.service

### Applied Mixins

- tested
- dip

## Decision

### Constraints

| Rule | Value | Severity | Why |
|------|-------|----------|-----|
| forbid_import | express, fastify | error | Services must be framework-agnostic |
| require_test_file | *.test.ts | warning | All services must be tested |

### Hints

- Prefer composition over inheritance
- Use dependency injection

## Consequences

### Positive
- Framework-agnostic, easily testable code
- Clear boundaries between business logic and infrastructure

### Negative
- May require more boilerplate for dependency injection

## Reference Implementations

- `src/services/user.service.ts`
```

### doc adr --all

Generate ADRs for all architectures with an index file.

```bash
archcodex doc adr --all -o docs/adr/
```

**Creates:**
```
docs/adr/
├── index.md              # Index of all ADRs
├── base.md
├── domain.md
├── domain.service.md
├── domain.repository.md
├── convex.mutation.md
└── ...
```

**Index format:**
```markdown
# Architecture Decision Records

| Architecture | Description |
|--------------|-------------|
| [base](base.md) | Base constraints for all files |
| [domain](domain.md) | Domain layer constraints |
| [domain.service](domain.service.md) | Domain service for business logic |
...
```

### doc watch

Watch registry and spec files for changes and regenerate documentation automatically.

```bash
# Watch all doc types
archcodex doc watch --type all -o docs/

# Watch ADRs only
archcodex doc watch --type adr -o docs/adr/

# Watch spec docs only
archcodex doc watch --type spec -o docs/api/

# Clear terminal between runs
archcodex doc watch --type all -o docs/ --clear

# Custom debounce delay
archcodex doc watch --type all -o docs/ --debounce 500
```

**Options:**
- `--type` - Doc type: `adr`, `spec`, `all` (default: `all`)
- `-o, --output` - Output directory (required)
- `--clear` - Clear terminal between regenerations
- `--debounce` - Debounce delay in ms (default: 300)

**Watched files:**
- ADRs: `.arch/registry/**/*.yaml`
- Specs: `.arch/specs/**/*.yaml`, `**/*.spec.yaml`

**Output:**
```
Watching for changes...
  Registry: .arch/registry/**/*.yaml
  Specs: .arch/specs/**/*.yaml

[12:34:56] Change detected: .arch/registry/domain/service.yaml
[12:34:56] Regenerating ADRs...
[12:34:57] Generated 36 ADRs

[12:35:10] Change detected: .arch/specs/products/create.spec.yaml
[12:35:10] Regenerating spec docs...
[12:35:11] Generated 1 spec doc
```

### doc verify

Verify generated documentation is up-to-date. Use in CI pipelines.

```bash
# Verify all docs
archcodex doc verify --type all -o docs/

# Verify ADRs only
archcodex doc verify --type adr -o docs/adr/

# Verify spec docs only
archcodex doc verify --type spec -o docs/api/

# Auto-fix stale docs
archcodex doc verify --type all -o docs/ --fix

# JSON output for CI
archcodex doc verify --type all -o docs/ --json
```

**Options:**
- `--type` - Doc type: `adr`, `spec`, `all` (default: `all`)
- `-o, --output` - Directory containing docs to verify (required)
- `--fix` - Auto-regenerate stale docs
- `--json` - Output as JSON

**Exit codes:**
- `0` - All docs are up-to-date
- `1` - Stale docs found (or directory not found)

**Output (docs up-to-date):**
```
Verifying documentation...

ADRs: 36 files checked
Spec docs: 12 files checked

All documentation is up-to-date.
```

**Output (stale docs):**
```
Verifying documentation...

ADRs: 36 files checked
Spec docs: 12 files checked

STALE FILES (2):
  docs/adr/domain.service.md
  docs/api/spec.product.create.md

Documentation is out of date. Run with --fix to regenerate.
Exit code: 1
```

**JSON output:**
```json
{
  "upToDate": false,
  "staleFiles": [
    "docs/adr/domain.service.md",
    "docs/api/spec.product.create.md"
  ],
  "adrCount": 36,
  "specCount": 12
}
```

### doc templates

List available templates or initialize custom templates.

```bash
# List available templates
archcodex doc templates

# Initialize custom templates in .arch/templates/docs/
archcodex doc templates --init
```

**Options:**
- `--init` - Create default templates in `.arch/templates/docs/`

**Available templates:**
| Template | Description |
|----------|-------------|
| `adr.md.hbs` | Single ADR document |
| `adr-index.md.hbs` | ADR index page |
| `spec-api.md.hbs` | Spec API reference |
| `spec-examples.md.hbs` | Spec usage examples |
| `spec-errors.md.hbs` | Spec error reference |
| `spec-all.md.hbs` | Combined spec documentation |

**Custom templates location:**
```
.arch/templates/docs/
├── adr.md.hbs           # Custom ADR template
├── adr-index.md.hbs     # Custom ADR index
├── spec-api.md.hbs      # Custom API reference
└── ...
```

### spec doc

Generate documentation from a spec. (Also documented in [SpecCodex CLI](./speccodex.md))

```bash
# Generate API reference
archcodex spec doc spec.product.create --type api

# Generate usage examples
archcodex spec doc spec.product.create --type examples

# Generate error reference
archcodex spec doc spec.product.create --type errors

# Generate all documentation
archcodex spec doc spec.product.create --type all

# Output to directory
archcodex spec doc spec.product.create --type all -o docs/api/
```

**Options:**
- `--type` - Doc type: `api`, `examples`, `errors`, `all` (required)
- `-o, --output` - Output directory

## Custom Templates

### Template Syntax

Templates use Handlebars-style syntax:

```markdown
# {{ARCH_ID}}

{{DESCRIPTION}}

## Constraints

{{CONSTRAINTS_TABLE}}

{{#if HINTS}}
## Hints

{{HINTS_LIST}}
{{/if}}
```

### ADR Template Variables

| Variable | Description |
|----------|-------------|
| `{{ARCH_ID}}` | Architecture ID |
| `{{DESCRIPTION}}` | Architecture description |
| `{{RATIONALE}}` | Why this architecture exists |
| `{{INHERITANCE_CHAIN}}` | List of parent architectures |
| `{{APPLIED_MIXINS}}` | List of applied mixins |
| `{{CONSTRAINTS_TABLE}}` | Formatted constraints table |
| `{{HINTS_LIST}}` | Formatted hints list |
| `{{REFERENCE_IMPLEMENTATIONS}}` | List of reference files |

### Spec Template Variables

| Variable | Description |
|----------|-------------|
| `{{SPEC_ID}}` | Spec identifier |
| `{{INTENT}}` | Spec intent |
| `{{GOAL}}` | Strategic goal |
| `{{INPUTS_TABLE}}` | Formatted inputs table |
| `{{OUTPUTS_TABLE}}` | Formatted outputs table |
| `{{SECURITY_SECTION}}` | Security requirements |
| `{{EXAMPLES_TABLE}}` | Success examples |
| `{{ERROR_TABLE}}` | Error examples |
| `{{IMPLEMENTATION}}` | Implementation path |

### Conditionals

```markdown
{{#if RATIONALE}}
## Rationale

{{RATIONALE}}
{{/if}}

{{#unless HINTS}}
*No hints defined*
{{/unless}}
```

## CI Integration

### GitHub Actions Example

```yaml
name: Docs Verification

on:
  pull_request:
    paths:
      - '.arch/**'
      - 'docs/**'

jobs:
  verify-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Verify documentation
        run: npx archcodex doc verify --type all -o docs/
```

### Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit

# Regenerate docs if registry changed
if git diff --cached --name-only | grep -q "^\.arch/"; then
  npx archcodex doc adr --all -o docs/adr/
  git add docs/adr/
fi
```

## Workflows

### Development Workflow

```bash
# Start watch mode during development
archcodex doc watch --type all -o docs/ --clear

# Make changes to .arch/registry/ or .arch/specs/
# Docs regenerate automatically
```

### Release Workflow

```bash
# Before release, ensure docs are current
archcodex doc verify --type all -o docs/

# Or auto-fix and commit
archcodex doc verify --type all -o docs/ --fix
git add docs/
git commit -m "docs: regenerate documentation"
```

### Full Documentation Generation

```bash
# Generate everything
archcodex doc adr --all -o docs/adr/

# For each spec
for spec in $(archcodex spec list --json | jq -r '.[].specId'); do
  archcodex spec doc $spec --type all -o docs/api/
done
```

## Configuration

### docs section in `.arch/config.yaml`

```yaml
docs:
  # ADR output settings
  adr:
    output: docs/adr/
    includeInheritance: true
    includeReferences: true
    format: standard

  # Spec doc output settings
  spec:
    output: docs/api/
    types: [api, examples, errors]

  # Watch mode settings
  watch:
    debounce: 300
    clear: false
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Stale docs found / verification failed |
| 2 | Architecture or spec not found |
| 3 | Output directory not found |
