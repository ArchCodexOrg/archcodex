# SpecCodex CLI Reference

SpecCodex provides Specification by Example commands for deterministic test generation.

## Quick Reference

| Command | Description |
|---------|-------------|
| `spec init` | Initialize SpecCodex with base specs and mixins |
| `spec list` | List all specs in registry |
| `spec resolve` | Show fully resolved spec with mixins |
| `spec check` | Validate spec files |
| `spec generate` | Generate tests from spec |
| `spec verify` | Verify implementation matches spec |
| `spec drift` | Find gaps between specs and code |
| `spec discover` | Find specs by intent |
| `spec placeholder` | Expand @ placeholders |
| `spec doc` | Generate documentation from spec |
| `spec schema` | Show spec field reference |
| `spec infer` | Generate spec from existing code |

## Commands

### spec init

Initialize SpecCodex in your project with base specs and mixins.

```bash
# Initialize SpecCodex
archcodex spec init

# Force overwrite existing files
archcodex spec init --force

# Minimal mode (no example file)
archcodex spec init --minimal
```

**Options:**
- `--force` - Overwrite existing files
- `--minimal` - Only create essential files (no example)

**Creates:**
- `.arch/specs/_base.yaml` - Base specs (spec.function, spec.mutation, spec.query)
- `.arch/specs/_mixins.yaml` - Reusable mixins (requires_auth, logs_audit, rate_limited)
- `.arch/specs/example.spec.yaml` - Example spec demonstrating features (unless --minimal)
- Updates `.arch/config.yaml` with speccodex configuration section

**Prerequisites:**
- Must run `archcodex init` first to create `.arch/` directory

**Output:**
```
SpecCodex initialized successfully!

Created:
  + .arch/specs/_base.yaml
  + .arch/specs/_mixins.yaml
  + .arch/specs/example.spec.yaml
  + .arch/config.yaml (updated)

Next steps:
  1. Review .arch/specs/_base.yaml for base spec patterns
  2. Review .arch/specs/_mixins.yaml for reusable behaviors
  3. Study .arch/specs/example.spec.yaml for spec syntax
  4. Create your first spec: .arch/specs/your-feature.spec.yaml
  5. Generate tests: archcodex spec generate spec.your.feature --type unit
```

### spec list

List all specs in the registry.

```bash
archcodex spec list
archcodex spec list --json
```

**Options:**
- `--json` - Output as JSON

**Output:**
```
Found 12 specs:

spec.product.create      src/domain/products/mutations/create.ts
spec.product.delete      src/domain/products/mutations/delete.ts
spec.product.archive     src/domain/products/mutations/archive.ts
...
```

### spec resolve

Show fully resolved spec with inheritance and mixins expanded.

```bash
archcodex spec resolve spec.product.create
archcodex spec resolve spec.product.create --json
```

**Options:**
- `--json` - Output as JSON

**Output:**
```yaml
spec.product.create:
  inherits: spec.mutation
  appliedMixins: [requires_auth, logs_audit]

  intent: "User creates a new product listing"

  security:
    authentication: required  # from spec.mutation
    rate_limit: { requests: 60, window: "15m" }

  inputs:
    url: { type: string, validate: url, required: true }
    title: { type: string, max: 200 }

  examples:
    success:
      - name: "valid URL with title"
        ...
    errors:
      - name: "unauthenticated"  # from requires_auth mixin
        given: { user: null }
        then: { error: "NOT_AUTHENTICATED" }
```

### spec check

Validate spec files for structure and consistency.

```bash
archcodex spec check path/to/spec.yaml
archcodex spec check ".arch/specs/**/*.yaml"
archcodex spec check --all
```

**Options:**
- `--all` - Check all specs in registry
- `--strict` - Treat warnings as errors
- `--json` - Output as JSON

**Validates:**
- Required fields (`intent` is mandatory)
- Input/output type definitions
- Example structure
- Mixin references exist
- Implementation path format

### spec generate

Generate tests from a spec.

```bash
# Generate unit tests
archcodex spec generate spec.product.create --type unit

# Generate property-based tests
archcodex spec generate spec.product.create --type property

# Generate integration tests
archcodex spec generate spec.product.create --type integration

# Output to file
archcodex spec generate spec.product.create --type unit -o tests/product.test.ts

# Full coverage mode
archcodex spec generate spec.product.create --type unit --coverage full
```

**Options:**
- `--type` - Test type: `unit`, `property`, `integration` (required)
- `-o, --output` - Output file path
- `--framework` - Test framework: `vitest` (default), `jest`
- `--coverage` - Coverage mode: `examples` (default), `full`
- `--no-markers` - Omit regeneration markers

**Coverage Modes:**
- `examples` - Only generate tests from explicit examples
- `full` - Also generate tests from input schema (enum values, boundaries)

**Output:**
```typescript
import { describe, it, expect } from 'vitest';
import { create } from './src/domain/products/mutations/create';

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('create', () => {
  describe('success cases', () => {
    it('valid URL with title', async () => {
      const result = await create({ url: "https://github.com", title: "GitHub" });
      expect(result.valid).toBe(true);
      expect(result.title).toBe("GitHub");
    });
  });
  // ...
});
// @speccodex:end
```

### spec verify

Verify implementation matches its spec.

```bash
archcodex spec verify spec.product.create
archcodex spec verify --all
archcodex spec verify spec.product.create --json
```

**Options:**
- `--all` - Verify all specs
- `--json` - Output as JSON

**Checks:**
- Implementation file exists
- Export name exists in file
- Function signature matches inputs
- Return type matches outputs

### spec infer

Generate spec YAML from existing TypeScript implementation. Enables a reverse workflow: write code first, then generate the spec from it.

```bash
# Infer spec from implementation
archcodex spec infer src/utils/helpers.ts#formatDate

# Write to file
archcodex spec infer src/utils/helpers.ts#formatDate --output .arch/specs/utils/helpers.spec.yaml

# Update existing spec with implementation changes
archcodex spec infer src/utils/helpers.ts#formatDate --update spec.utils.helpers.formatDate

# Override auto-detected base spec
archcodex spec infer src/handler.ts#handle --inherits spec.action

# Preview without writing
archcodex spec infer src/utils/helpers.ts#formatDate --dry-run

# Machine-readable output
archcodex spec infer src/utils/helpers.ts#formatDate --json
```

**Options:**
- `--output <path>` - Write spec to file instead of stdout
- `--update <specId>` - Update existing spec (merge mode, preserves goal/intent/examples/invariants)
- `--inherits <base>` - Override auto-detected base spec
- `--dry-run` - Preview without writing
- `--json` - Machine-readable output

**Auto-Detection:**

| Code Pattern | Detected Base Spec | Security |
|---|---|---|
| `makeAuthMutation(...)` | `spec.mutation` | `authentication: required` |
| `makeAuthQuery(...)` | `spec.query` | `authentication: required` |
| `makeAuthAction(...)` | `spec.action` | `authentication: required` |
| `use*` (hook naming) | `spec.hook` | `authentication: none` |
| Plain exported function | `spec.function` | `authentication: none` |

**Also Detects:**
- Side effects (`ctx.db.insert/patch/delete`, `logAudit`, `ctx.scheduler.runAfter`)
- Error codes (`ConvexError({ code: "..." })`)
- `@arch` tags from file headers
- TypeScript types → spec types (`Id<"table">` → `id`, string unions → `enum`, etc.)

**Update Mode:**

When using `--update`, the merge preserves hand-written sections:
- Goal, intent, examples, and invariants are never overwritten
- New inputs are annotated with `# NEW:` comments
- Removed inputs are commented out with `# REMOVED:` prefix

### spec drift

Find gaps between specs and code.

```bash
archcodex spec drift
archcodex spec drift --json
```

**Options:**
- `--json` - Output as JSON

**Output:**
```
Spec Coverage Report

WIRED (implementation linked):
  spec.product.create       → src/domain/products/mutations/create.ts#create
  spec.product.delete       → src/domain/products/mutations/delete.ts#delete

UNWIRED (no implementation):
  spec.product.archive      Missing implementation field

Coverage: 45/46 specs (98%)
```

### spec discover

Find specs by natural language intent.

```bash
archcodex spec discover "create a product"
archcodex spec discover "delete product"
archcodex spec discover "user authentication"
```

**Output:**
```
Found 2 specs matching "create a product":

spec.product.create (0.92)
  Intent: User creates a new product listing
  Implementation: src/domain/products/mutations/create.ts

spec.product.quicksave (0.78)
  Intent: Quickly create a draft product
  Implementation: src/domain/products/mutations/quicksave.ts
```

### spec placeholder

Expand @ placeholder syntax.

```bash
# Expand a placeholder
archcodex spec placeholder "@string(100)"
archcodex spec placeholder "@int(1, 100)"
archcodex spec placeholder "@uuid"

# List all placeholders
archcodex spec placeholder --list
```

**Options:**
- `--list` - List all available placeholders

**Value Generators:**
| Placeholder | Description | Example Output |
|-------------|-------------|----------------|
| `@string(n)` | String of length n | `"abcdefghij..."` |
| `@url(n)` | Valid URL of ~n chars | `"https://example.com/abc..."` |
| `@uuid` | UUID v4 | `"550e8400-..."` |
| `@now` | Current timestamp | `1706745600000` |
| `@now(-1d)` | Timestamp offset | `1706659200000` |
| `@authenticated` | Auth user context | `{ id: "...", permissions: [...] }` |
| `@no_access` | User without access | `{ id: "...", permissions: [] }` |

**Basic Assertions:**
| Placeholder | Description | Generated Assertion |
|-------------|-------------|---------------------|
| `@exists` | Not null | `expect(x).not.toBeNull()` |
| `@defined` | Is defined | `expect(x).toBeDefined()` |
| `@empty` | Is empty | `expect(x).toHaveLength(0)` |
| `@length(n)` | Has length | `expect(x).toHaveLength(n)` |
| `@contains('x')` | Contains | `expect(x).toContain('x')` |
| `@lt(n)` / `@gt(n)` | Less/greater | `expect(x).toBeLessThan(n)` |
| `@between(1, 100)` | In range | `expect(x).toBeGreaterThanOrEqual(1)` |
| `@matches('re')` | Regex match | `expect(x).toMatch(/re/)` |
| `@type('array')` | Type check | `expect(Array.isArray(x)).toBe(true)` |
| `@oneOf(['a','b'])` | One of values | `expect(['a','b']).toContain(x)` |

**Array/Object Assertions:**
| Placeholder | Description | Example |
|-------------|-------------|---------|
| `@hasItem('x')` | Array has string | `@hasItem('active')` |
| `@hasItem(42)` | Array has number | `@hasItem(42)` |
| `@hasItem({...})` | Array has object | `@hasItem({ status: 'ok' })` |
| `@hasProperties({})` | Object matches | `@hasProperties({ valid: true })` |

**Composite Assertions:**
| Placeholder | Description | Example |
|-------------|-------------|---------|
| `@all(...)` | All pass | `@all(@gt(0), @lt(100))` |
| `@any(...)` | Any passes | `@any(@contains('a'), @empty)` |
| `@not(...)` | Negation | `@not(@contains('error'))` |

### spec doc

Generate documentation from a spec.

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

**Output (--type api):**
```markdown
# spec.product.create

User creates a new product listing

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Product name |
| price | number | No | Product price (max 99999) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| _id | id | Product ID |
| name | string | Product name |
```

### spec schema

Show spec field reference and examples.

```bash
# Show all spec fields
archcodex spec schema

# Show input/output types
archcodex spec schema --filter inputs

# Show working examples
archcodex spec schema --examples
```

**Options:**
- `--filter` - Filter to category: `inputs`, `outputs`, `security`, `examples`
- `--examples` - Show working YAML examples

## Workflows

### Writing a New Spec

```bash
# 1. Find similar specs for reference
archcodex spec discover "your feature"

# 2. Check available schema fields
archcodex spec schema --examples

# 3. Create spec file
# .arch/specs/feature/action.spec.yaml

# 4. Validate structure
archcodex spec check .arch/specs/feature/action.spec.yaml

# 5. Generate tests
archcodex spec generate spec.feature.action --type unit

# 6. Run tests to verify
npm test
```

### Test Generation Workflow

```bash
# Generate tests for all types
archcodex spec generate spec.product.create --type unit -o tests/unit/
archcodex spec generate spec.product.create --type property -o tests/property/
archcodex spec generate spec.product.create --type integration -o tests/integration/
```

### Code-First Workflow (Reverse)

When code already exists and you want to generate specs from it:

```bash
# 1. Infer spec from implementation
archcodex spec infer src/domain/products/mutations/create.ts#create \
  --output .arch/specs/products/create.spec.yaml

# 2. Review and fill in goal, intent, examples, invariants
# (the generated spec has TODO placeholders)

# 3. Validate the spec
archcodex spec check .arch/specs/products/create.spec.yaml

# 4. Generate tests from the completed spec
archcodex spec generate spec.products.mutations.create --type unit

# 5. Verify spec matches implementation
archcodex spec verify spec.products.mutations.create
```

### Keeping Specs in Sync

When implementation changes, update the spec:

```bash
# Update spec with changes from code (preserves hand-written content)
archcodex spec infer src/domain/products/mutations/create.ts#create \
  --update spec.products.mutations.create \
  --output .arch/specs/products/create.spec.yaml

# Verify everything still matches
archcodex spec verify spec.products.mutations.create
```

### CI Integration

```bash
# In CI pipeline:
# 1. Validate specs
archcodex spec check --all --strict

# 2. Check for drift
archcodex spec drift

# 3. Verify implementations
archcodex spec verify --all
```

## Configuration

### speccodex section in `.arch/config.yaml`

```yaml
speccodex:
  # Test output locations
  test_output:
    unit: colocated              # Same directory as spec
    property: tests/property/    # Specific directory
    integration: tests/integration/

  # Test framework
  framework: vitest              # vitest | jest

  # Default coverage mode
  coverage: examples             # examples | full
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation errors found |
| 2 | Spec not found |
| 3 | Implementation not found |
