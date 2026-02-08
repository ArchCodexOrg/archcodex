# SpecCodex: Specification by Example

SpecCodex extends ArchCodex with a **Specification by Example** language that enables deterministic generation of tests and documentation from structured YAML specs.

## Design Philosophy

### Specs as Source of Truth

Specs define the behavioral contract. Test generation is deterministic templating (not LLM creativity), enabling validation that generated tests match spec structure.

### Co-Creation with AI

Specs are collaboratively written by humans AND coding agents together:
- LLM can draft specs from conversation
- LLM suggests examples and identifies missing edge cases
- Humans validate intent and approve
- Generated tests are deterministic and reviewable

### Call Pattern Detection

SpecCodex detects the **call pattern** of your implementation and projects customize their test templates based on that pattern:

| Pattern | Description | Example |
|---------|-------------|---------|
| `direct` | Function with positional parameters | `createUser(name, email)` |
| `destructured` | Function with object parameter | `createUser({ name, email })` |
| `factory` | Returns object requiring further invocation | `makeAuthMutation(async (ctx, args) => ...)` |

This approach means SpecCodex doesn't need framework-specific generators. Instead:
1. SpecCodex detects the pattern from your implementation's AST
2. Your project provides templates for each pattern
3. Generated tests use the appropriate invocation style

## Quick Start

### 1. Initialize SpecCodex

```bash
# First, initialize ArchCodex (if not done)
archcodex init

# Then initialize SpecCodex
archcodex spec init
```

This creates:
- `.arch/specs/_base.yaml` - Base specs to inherit from
- `.arch/specs/_mixins.yaml` - Reusable behaviors
- `.arch/specs/example.spec.yaml` - Example to learn from

### 2. Create a Spec

Create specs in `.arch/specs/` or colocate with implementation:

```yaml
# .arch/specs/products/create.spec.yaml
# OR: src/domain/products/mutations/create.spec.yaml (colocated)

spec.product.create:
  # Link to implementation (optional if colocated)
  implementation: src/domain/products/mutations/create.ts#create

  # === STRATEGIC (WHY) ===
  goal: "Enable users to create product listings"
  outcomes:
    - "Create any valid product <100ms"
    - "Detect duplicates"

  # === OPERATIONAL (WHAT) ===
  intent: "User creates a new product listing"

  inputs:
    name: { type: string, required: true, max: 200 }
    price: { type: number, required: true }
    categoryId: { type: id, table: categories }

  outputs:
    _id: { type: id, table: products }
    name: { type: string }
    price: { type: number }

  # === EXAMPLES ===
  examples:
    success:
      - name: "valid product with name"
        given: { name: "Widget", price: 29.99 }
        then: { result.valid: true, result.name: "Widget" }

      - name: "product with default category"
        given: { name: "Gadget", price: 49.99 }
        then: { result.name: "Gadget" }

    errors:
      - name: "invalid price format"
        given: { name: "Widget", price: -1 }
        then: { error: "INVALID_PRICE" }

      - name: "unauthenticated user"
        given: { user: null, name: "Widget", price: 9.99 }
        then: { error: "NOT_AUTHENTICATED" }
```

### 3. Generate Tests

```bash
# Generate unit tests
archcodex spec generate spec.product.create --type unit

# Generate property-based tests (from invariants)
archcodex spec generate spec.product.create --type property

# Generate integration tests (from effects)
archcodex spec generate spec.product.create --type integration
```

### 4. Verify Implementation

```bash
# Check implementation matches spec
archcodex spec verify spec.product.create

# Find drift between specs and code
archcodex spec drift
```

## Reverse Workflow: Code First

When code already exists, generate specs from it instead of writing them from scratch.

### Infer a Spec

```bash
# Generate spec from existing implementation
archcodex spec infer src/domain/products/mutations/create.ts#create
```

This auto-detects:
- **Base spec** from wrapper patterns (`makeAuthMutation` → `spec.mutation`, `makeAuthQuery` → `spec.query`, `use*` → `spec.hook`, plain → `spec.function`)
- **Security** requirements (auth wrappers → `authentication: required`)
- **Side effects** (`ctx.db.insert/patch/delete`, `logAudit`, scheduled actions)
- **Error codes** from `ConvexError({ code: "..." })` patterns
- **TypeScript types** mapped to spec types (`Id<"table">` → `id`, string unions → `enum`, `T[]` → `array`)
- **`@arch` tags** from file headers

The generated spec includes `TODO` placeholders for fields that require human judgment (goal, intent, invariants, examples).

### Write to File and Complete

```bash
# Write inferred spec to file
archcodex spec infer src/domain/products/mutations/create.ts#create \
  --output .arch/specs/products/create.spec.yaml

# Edit the spec: fill in goal, intent, examples, invariants
# Then validate
archcodex spec check .arch/specs/products/create.spec.yaml

# Generate tests from completed spec
archcodex spec generate spec.products.mutations.create --type unit
```

### Update Existing Specs

When implementation changes, merge inferred changes into an existing spec without overwriting hand-written content:

```bash
archcodex spec infer src/domain/products/mutations/create.ts#create \
  --update spec.products.mutations.create \
  --output .arch/specs/products/create.spec.yaml
```

The merge preserves `goal`, `intent`, `examples`, and `invariants` verbatim. New inputs are annotated with `# NEW:` and removed inputs are commented out with `# REMOVED:`.

## Spec Structure

### Complete Spec Example

```yaml
spec.product.create:
  # === METADATA ===
  version: "1.0.0"
  inherits: spec.mutation           # Inherit from base spec
  mixins: [secure_mutation, logs_audit]  # Apply mixins
  architectures: [convex.mutation]  # Link to architectures
  implementation: path/to/file.ts#exportName

  # === STRATEGIC (WHY) ===
  goal: "Enable users to create product listings"
  outcomes:
    - "Create any valid product <100ms"
    - "Detect duplicates"
    - "Searchable within 1s"

  # === SECURITY ===
  security:
    authentication: required
    rate_limit: { requests: 60, window: "15m" }
    permissions: [product.create]
    sanitization: [title, description]

  # === OPERATIONAL (WHAT) ===
  intent: "User creates a new product listing"

  inputs:
    name: { type: string, required: true, max: 200 }
    price: { type: number, required: true }
    categoryId: { type: id, table: categories }

  outputs:
    _id: { type: id, table: products }
    name: { type: string }
    createdAt: { type: number }

  # === INVARIANTS (ALWAYS TRUE) ===
  invariants:
    - { property: "result.price", condition: "gte(0)" }
    - { property: "result.userId", condition: "equals(ctx.userId)" }
    - { property: "result.isDeleted", condition: "equals(false)" }

  # === EXAMPLES ===
  defaults: &auth
    user: "@authenticated"

  examples:
    success:
      - name: "valid product with name"
        given: { <<: *auth, name: "Widget", price: 29.99 }
        then: { result.valid: true, result.name: "Widget" }

    errors:
      - name: "negative price"
        given: { <<: *auth, name: "Widget", price: -1 }
        then: { error: "INVALID_PRICE" }

    boundaries:
      - name: "name at max length"
        given: { <<: *auth, name: "@string(200)", price: 9.99 }
        then: { result.valid: true }

  # === EFFECTS (INTEGRATION) ===
  effects:
    - { audit_log: { action: "product.create", resourceType: "product" } }
    - { embedding: generated_async }
```

### Input Types

| Type | Description | Validation |
|------|-------------|------------|
| `string` | Text value | `max`, `min`, `pattern`, `validate: url\|email` |
| `number` | Numeric value | `max`, `min` |
| `boolean` | True/false | - |
| `enum` | Fixed set of values | `values: [a, b, c]` |
| `id` | Database ID | `table: tableName` |
| `array` | List of items | `items: { type: ... }` |
| `object` | Nested object | `properties: { ... }` |

### Placeholder System

Use `@` placeholders in examples for dynamic test data:

**Value Generators (use in `given` clause):**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `@string(n)` | String of length n | `@string(100)` |
| `@url(n)` | Valid URL of ~n characters | `@url(2048)` |
| `@uuid` | Generate UUID v4 | `@uuid` |
| `@now` | Current timestamp | `@now` |
| `@now(±Nd)` | Timestamp with offset | `@now(-1d)` |
| `@authenticated` | Test user with auth | `@authenticated` |
| `@no_access` | User without permission | `@no_access` |

**Assertions (use in `then` clause):**

| Placeholder | Description | Generated Assertion |
|-------------|-------------|---------------------|
| `@exists` | Value is not null | `expect(x).not.toBeNull()` |
| `@defined` | Value is defined | `expect(x).toBeDefined()` |
| `@undefined` | Value is undefined | `expect(x).toBeUndefined()` |
| `@empty` | Array/string is empty | `expect(x).toHaveLength(0)` |
| `@length(n)` | Has length n | `expect(x).toHaveLength(n)` |
| `@contains('x')` | Contains string | `expect(x).toContain('x')` |
| `@lt(n)` / `@gt(n)` | Less/greater than | `expect(x).toBeLessThan(n)` |
| `@lte(n)` / `@gte(n)` | Less/greater or equal | `expect(x).toBeLessThanOrEqual(n)` |
| `@between(min, max)` | Value in range | Two assertions: `>=min` and `<=max` |
| `@matches('regex')` | Matches pattern | `expect(x).toMatch(/regex/)` |
| `@type('name')` | Type check | `expect(typeof x).toBe('name')` |
| `@oneOf(['a','b'])` | One of values | `expect(['a','b']).toContain(x)` |

**Array/Object Assertions:**

| Placeholder | Description | Generated Assertion |
|-------------|-------------|---------------------|
| `@hasItem('x')` | Array contains string | `expect(arr).toContain('x')` |
| `@hasItem(42)` | Array contains number | `expect(arr).toContain(42)` |
| `@hasItem({...})` | Array contains object | `expect(arr).toEqual(expect.arrayContaining([...]))` |
| `@hasProperties({...})` | Object has properties | `expect(obj).toMatchObject({...})` |

**Composite Assertions:**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `@all(...)` / `@and(...)` | All must pass | `@all(@gt(0), @lt(100))` |
| `@any(...)` / `@or(...)` | Any must pass | `@any(@contains('a'), @contains('b'))` |
| `@not(...)` | Negation | `@not(@contains('error'))` |

## Inheritance & Mixins

### Base Specs

Define reusable base specs in `.arch/specs/_base.yaml`:

```yaml
spec.mutation:
  security:
    authentication: required

spec.query:
  security:
    authentication: required

spec.function:
  # Base for any function spec
```

### Mixins

Define reusable behaviors in `.arch/specs/_mixins.yaml`:

```yaml
mixins:
  requires_auth:
    examples:
      errors:
        - name: "unauthenticated"
          given: { user: null }
          then: { error: "NOT_AUTHENTICATED" }

  requires_permission:
    examples:
      errors:
        - name: "no permission"
          given: { user: "@authenticated", permission: false }
          then: { error: "PERMISSION_DENIED" }

  logs_audit:
    effects:
      - audit_log: { action: "${action}", resourceType: "${resource}" }
```

### Using Inheritance

```yaml
spec.product.create:
  inherits: spec.mutation
  mixins: [requires_auth, logs_audit]

  # Your spec fields override/extend inherited ones
  intent: "Create a product"
```

## Test Generation

### Unit Tests

Generated from `examples.success` and `examples.errors`:

```bash
archcodex spec generate spec.product.create --type unit
```

Output:
```typescript
import { describe, it, expect } from 'vitest';
import { create } from './src/domain/products/mutations/create';

describe('create', () => {
  describe('success cases', () => {
    it('valid product with name', async () => {
      const result = await create({ name: "Widget", price: 29.99 });
      expect(result.valid).toBe(true);
      expect(result.name).toBe("Widget");
    });
  });

  describe('error cases', () => {
    it('invalid price format', async () => {
      await expect(create({ name: "Widget", price: -1 }))
        .rejects.toMatchObject({ data: { code: 'INVALID_PRICE' } });
    });
  });
});
```

### Property-Based Tests

Generated from `invariants`:

```bash
archcodex spec generate spec.product.create --type property
```

Output:
```typescript
import { fc } from 'fast-check';

describe('create invariants', () => {
  it('price is always non-negative', () => {
    fc.assert(fc.asyncProperty(
      fc.nat(),
      async (price) => {
        const result = await create({ name: "Test", price });
        expect(result.price).toBeGreaterThanOrEqual(0);
      }
    ));
  });
});
```

### Integration Tests

Generated from `effects`:

```bash
archcodex spec generate spec.product.create --type integration
```

## Documentation Generation

### API Documentation

```bash
# Generate API docs from spec
archcodex spec doc spec.product.create --type api

# Generate all doc types
archcodex spec doc spec.product.create --type all
```

Generates:
- **API Reference** - Inputs, outputs, types
- **Usage Examples** - From spec examples
- **Error Reference** - From error examples

### Custom Templates

Place custom templates in `.arch/templates/docs/`:

```
.arch/templates/docs/
├── spec-api.md.hbs      # API reference template
├── spec-examples.md.hbs # Examples template
├── spec-errors.md.hbs   # Error reference template
└── spec-all.md.hbs      # Combined template
```

Template variables:
- `{{SPEC_ID}}` - Spec identifier
- `{{INTENT}}` - Spec intent
- `{{INPUTS_TABLE}}` - Formatted inputs
- `{{OUTPUTS_TABLE}}` - Formatted outputs
- `{{EXAMPLES_TABLE}}` - Success examples
- `{{ERROR_TABLE}}` - Error examples

## CLI Reference

### Core Commands

```bash
# List all specs
archcodex spec list

# Resolve spec with inheritance expanded
archcodex spec resolve spec.product.create

# Check spec validity
archcodex spec check .arch/specs/**/*.yaml

# Discover spec by intent
archcodex spec discover "create a product"
```

### Test Generation

```bash
# Generate unit tests
archcodex spec generate spec.product.create --type unit

# Generate property tests
archcodex spec generate spec.product.create --type property

# Generate integration tests
archcodex spec generate spec.product.create --type integration

# Full coverage mode (includes schema-derived tests)
archcodex spec generate spec.product.create --type unit --coverage full
```

### Verification

```bash
# Verify implementation matches spec
archcodex spec verify spec.product.create

# Find drift between specs and code
archcodex spec drift

# Expand placeholder for testing
archcodex spec placeholder "@string(100)"
```

### Documentation

```bash
# Generate API docs
archcodex spec doc spec.product.create --type api

# Generate all doc types
archcodex spec doc spec.product.create --type all -o docs/api/
```

## File Organization

### Registry Location

```
.arch/
├── specs/                    # Spec registry
│   ├── _base.yaml           # Base specs
│   ├── _mixins.yaml         # Reusable mixins
│   └── products/
│       ├── create.spec.yaml
│       └── delete.spec.yaml
```

### Colocated Specs

Specs can be colocated with implementation:

```
src/domain/products/mutations/
├── create.ts              # Implementation
└── create.spec.yaml       # Spec (linked by filename)
```

When colocated:
- No `implementation` field needed
- `create.ts` ↔ `create.spec.yaml` linked automatically
- Spec is source of truth for behavior

## Best Practices

### 1. Start with Intent

Always begin with a clear intent that describes the user action:

```yaml
intent: "User creates a new product listing"  # Good
intent: "Create product mutation"         # Too technical
```

### 2. Include Error Cases

Cover common error scenarios:

```yaml
examples:
  errors:
    - name: "unauthenticated user"
    - name: "invalid input format"
    - name: "resource not found"
    - name: "permission denied"
```

### 3. Use Boundaries

Test edge cases with boundary examples:

```yaml
examples:
  boundaries:
    - name: "title at max length"
      given: { title: "@string(200)" }
    - name: "empty optional field"
      given: { title: null }
```

### 4. Leverage Inheritance

Don't repeat common patterns:

```yaml
# Instead of repeating auth checks everywhere:
spec.product.create:
  inherits: spec.mutation
  mixins: [requires_auth]
```

### 5. Link to Implementation

Always specify the implementation for accurate test generation:

```yaml
implementation: src/domain/products/mutations/create.ts#create

## UI Section

The `ui` section defines UI interaction specifications for frontend components. This enables deterministic generation of interaction and accessibility tests.

### UI Section Structure

```yaml
spec.item.duplicate:
  intent: "User duplicates an item from the context menu"

  ui:
    # How the action is triggered
    trigger:
      location: "context menu"      # Where in UI (context menu, toolbar, button)
      label: "Duplicate"            # Button/menu item text
      icon: "copy"                  # Icon name
      shortcut: "Cmd+D"             # Keyboard shortcut

    # Interaction flow
    interaction:
      flow:                         # Step-by-step interaction
        - "User right-clicks item"
        - "Context menu appears"
        - "User clicks Duplicate"
        - "New item appears below"
      optimistic: true              # Shows result before server confirms
      loading: "Inline spinner"     # Loading indicator style

    # Accessibility requirements
    accessibility:
      role: "menuitem"              # ARIA role
      label: "Duplicate item"       # Accessible label
      keyboardNav:                  # Keyboard navigation
        - { key: "Enter", action: "activate" }
        - { key: "Escape", action: "close" }

    # User feedback
    feedback:
      success: "Item duplicated"    # Success message
      error: "Failed to duplicate"  # Error message
```

### UI Test Generation

Generate UI tests from the `ui` section:

```bash
# Generate Playwright tests (default)
archcodex spec generate spec.item.duplicate --type ui

# Generate Cypress tests
archcodex spec generate spec.item.duplicate --type ui --framework cypress

# Generate Testing Library tests
archcodex spec generate spec.item.duplicate --type ui --framework testing-library

# With accessibility plugin (axe-core)
archcodex spec generate spec.item.duplicate --type ui --accessibility axe
```

### Generated Test Example

From the spec above, generates:

```typescript
import { test, expect } from '@playwright/test';

test.describe('spec.item.duplicate UI', () => {
  test.describe('Trigger', () => {
    test('shows Duplicate in context menu', async ({ page }) => {
      // TODO: Navigate to page with item
      await page.click('[data-item]', { button: 'right' });
      await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
    });

    test('Cmd+D triggers duplicate when item focused', async ({ page }) => {
      // TODO: Focus an item
      await page.keyboard.press('Meta+D');
      // TODO: Assert duplicate action triggered
    });
  });

  test.describe('Accessibility', () => {
    test('Enter key activates menu item', async ({ page }) => {
      // TODO: Navigate to context menu
      await page.keyboard.press('Enter');
      // TODO: Assert action triggered
    });
  });
});
```

## Fixture System

Fixtures provide reusable test data that can be referenced in examples using `@fixtureName` syntax.

### Built-in Fixtures

| Fixture | Description | Mode |
|---------|-------------|------|
| `@authenticated` | Valid user with read/write permissions | generate |
| `@no_access` | User without permissions | generate |
| `@admin_user` | Admin user with all permissions | generate |

### Project-Defined Fixtures

Create `.arch/specs/_fixtures.yaml` to define project-specific fixtures:

```yaml
version: "1.0"

fixtures:
  # Generate mode - returns actual test data
  validTask:
    description: "Pre-existing task item"
    mode: generate
    value:
      _id: "item_test_task"
      itemType: "task"
      title: "Test Task"
      status: "pending"

  # Documentation mode - for human readers only
  archivedItem:
    description: "Item that has been archived"
    mode: documentation
    setup: "Archive an item via API before test"

  # Fixture with dependencies
  taskWithProject:
    description: "Task linked to a project"
    mode: generate
    depends_on: [validProject]
    value:
      _id: "item_task_linked"
      projectId: "project_test"
      title: "Linked Task"
```

### Using Fixtures in Examples

```yaml
spec.item.duplicate:
  examples:
    success:
      - name: "duplicate existing task"
        given:
          user: "@authenticated"
          item: "@validTask"            # Resolves to fixture value
        then:
          result.title: "@contains('Copy of')"

    errors:
      - name: "cannot duplicate archived"
        given:
          user: "@authenticated"
          item: "@archivedItem"         # Documentation-only fixture
        then:
          error: "ITEM_ARCHIVED"
```

### Fixture CLI Commands

```bash
# List available fixtures
archcodex spec fixture --list

# Show fixture details
archcodex spec fixture validTask

# Get fixtures template
archcodex spec fixture --template
```

### Fixture Modes

| Mode | Behavior |
|------|----------|
| `generate` | Returns fixture value in generated tests |
| `documentation` | Returns `@fixtureName` as-is (for human-readable docs) |

## Integration with ArchCodex

### Architecture Linking

Specs can reference architectures:

```yaml
spec.product.create:
  architectures: [convex.mutation, convex.mutation.guarded]
```

This ensures:
- Spec examples align with architecture constraints
- Generated tests respect architecture boundaries
- Documentation includes architectural context

### Shared Validation

Run both architecture and spec validation:

```bash
# Validate architecture constraints
archcodex check src/**/*.ts

# Validate specs
archcodex spec check .arch/specs/**/*.yaml

# Combined CI check
archcodex check src/**/*.ts && archcodex spec drift
```
