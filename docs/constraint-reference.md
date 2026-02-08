# Constraint Reference

A complete reference for all ArchCodex constraint rules and patterns.

---

## Constraint Rules Table

| Rule | Description | Example |
|------|-------------|---------|
| `must_extend` | Class must extend parent | `BaseProcessor` |
| `implements` | Class must implement interface | `IPaymentProcessor` |
| `forbid_import` | Block specific imports | `[console, http]` |
| `require_import` | Require specific imports | `[@core/logger]` |
| `allow_import` | Override parent's forbid | `[axios]` |
| `require_decorator` | Require class decorator | `@Traceable` |
| `forbid_decorator` | Block decorator | `@Deprecated` |
| `naming_pattern` | Filename regex | `^[A-Z].*Processor\.ts$` |
| `location_pattern` | Required path prefix | `src/processors/` |
| `max_public_methods` | Limit public methods | `10` |
| `max_file_lines` | Limit file length | `300` |
| `require_test_file` | Require companion test file | `[*.test.ts, *.spec.ts]` |
| `importable_by` | Restrict which architectures can import | `[domain.payment.*, test.**]` |
| `forbid_circular_deps` | Prevent circular import dependencies | `true` |
| `forbid_call` | Block specific function calls | `[setTimeout, setInterval]` |
| `require_try_catch` | Require try/catch around calls | `around: [fetch, api.*]` |
| `forbid_mutation` | Block mutation of global objects | `[process.env, window]` |
| `require_call` | Require specific function calls | `[validateInput, sanitize*]` |
| `require_pattern` | Require regex pattern in content | `pattern: isDeleted.*false` |
| `forbid_pattern` | Block regex pattern in content | `pattern: console\\.log` |
| `allow_pattern` | Override parent's forbid_pattern | `pattern: console\\.log` |
| `require_one_of` | Require at least ONE of patterns | `[isDeleted, @no-soft-delete]` |
| `require_export` | Require specific exports | `[*Provider, use*]` |
| `require_call_before` | Require calls before other calls | `before: [ctx.db.*]` |
| `require_coverage` | Cross-file coverage check | `source_type: union_members` |
| `max_similarity` | DRY detection - flag files exceeding similarity | `0.8` |
| `require_companion_call` | Require paired method calls | `target: cache, operations: [set], call: save` |
| `require_companion_file` | Require companion files (barrels, tests, styles) | `./index.ts` or `{ path: "${name}.test.ts", must_export: true }` |

---

## LLM-friendly Structured Patterns

ArchCodex supports structured alternatives to regex that are easier for LLM agents to write and understand.

### Structured Naming Pattern

Instead of writing regex, use the `naming` object:

```yaml
# Traditional regex approach:
constraints:
  - rule: naming_pattern
    value: ^[A-Z][a-zA-Z0-9]*Service\.ts$
    severity: error

# LLM-friendly structured approach:
constraints:
  - rule: naming_pattern
    naming:
      case: PascalCase        # PascalCase | camelCase | snake_case | UPPER_CASE | kebab-case
      suffix: Service         # Required suffix
      extension: .ts          # File extension
    examples: [PaymentService.ts, UserService.ts]
    counterexamples: [paymentService.ts, service.ts]
    severity: error
    why: "Service files must be PascalCase with Service suffix"
```

**Available naming options:**

| Field | Description | Example |
|-------|-------------|---------|
| `case` | Naming convention | `PascalCase`, `camelCase`, `snake_case`, `UPPER_CASE`, `kebab-case` |
| `prefix` | Required prefix | `I` (for interfaces) |
| `suffix` | Required suffix | `Service`, `Controller`, `Repository` |
| `extension` | File extension | `.ts`, `.tsx`, `.py` |

### Documentation Fields

Add context for LLM agents with documentation fields:

```yaml
constraints:
  - rule: require_pattern
    pattern: isDeleted\s*===?\s*false
    intent: "Filter out soft-deleted records"      # Human-readable description
    codeExample: "where: { isDeleted: false }"     # Code example
    examples: ['isDeleted === false', 'isDeleted: false']
    severity: error
    why: "Queries must filter soft-deleted records"
```

| Field | Description | Used For |
|-------|-------------|----------|
| `examples` | Valid examples (not validated) | LLM context, error messages |
| `counterexamples` | Invalid examples | LLM context |
| `intent` | Human-readable intent | AI format output, error messages |
| `codeExample` | Code showing correct usage | AI format output |

These fields appear in `--format ai` output and error messages, helping LLMs understand the pattern without parsing regex.

### Context-Dependent Alternatives (`also_valid`)

For constraints where multiple approaches are valid depending on context (e.g., performance, architecture choices), use `also_valid`:

```yaml
constraints:
  - rule: forbid_pattern
    value: N+1 query pattern
    pattern: "for.*await.*db\\."
    category: performance
    why: Sequential queries are slow - batch or use single query
    codeExample: |
      // Batch with Promise.all
      const results = await Promise.all(ids.map(id => db.get(id)));
    also_valid:
      - pattern: "Single query with IN clause"
        when: "Same entity type, simple lookup"
        codeExample: "await db.query({ id: { $in: ids } })"
      - pattern: "Streaming/pagination"
        when: "Large datasets that shouldn't load all at once"
      - pattern: "Sequential with caching"
        when: "True data dependency chain"
```

| Field | Required | Description |
|-------|----------|-------------|
| `pattern` | Yes | Name/description of the alternative approach |
| `when` | Yes | Context where this alternative is appropriate |
| `codeExample` | No | Optional code example |

**Use sparingly** - only for genuinely context-dependent cases like performance antipatterns or architecture choices where the "right" answer depends on context.

---

## OR Semantics (`match: any`)

By default, array-based constraints like `require_import` require ALL values to be present. Use `match: any` for OR semantics:

```yaml
# Default behavior (match: all) - ALL imports required
constraints:
  - rule: require_import
    value: [Logger, Metrics]
    severity: error
    why: "Both logging and metrics must be imported"

# OR behavior (match: any) - at least ONE import required
constraints:
  - rule: require_import
    value: [ConvexError, Errors]
    match: any
    severity: error
    why: "Must use either ConvexError or Errors for error handling"
```

**Use cases:**
- Error handling: Accept either `ConvexError` OR custom `Errors` class
- HTTP clients: Allow `fetch` OR `axios` OR custom client
- Validation: Require either `zod` OR `joi` OR `yup`

---

## Cross-File Constraints

The `importable_by` and `forbid_circular_deps` rules are **project-level constraints** that analyze import relationships across the entire codebase. They require the `--project` flag:

```bash
archcodex check --project
```

### `importable_by`

Restrict which architectures can import this code:

```yaml
domain.payment:
  constraints:
    - rule: importable_by
      value: [domain.payment.*, api.payment.*, test.**]
      severity: error
      why: "Payment domain should not leak to other domains"
```

**Pattern matching:**
- `*` matches any single segment (e.g., `domain.*` matches `domain.payment`)
- `**` matches any number of segments (e.g., `test.**` matches `test.unit.payment`)

### `forbid_circular_deps`

Prevent circular dependencies:

```yaml
domain.payment:
  constraints:
    - rule: forbid_circular_deps
      severity: error
      why: "Circular dependencies make code hard to maintain"
```

---

## Monorepo Package Boundaries

For monorepos, define package-level import boundaries in `.arch/config.yaml`:

```yaml
packages:
  - path: packages/core
    can_import: []  # no dependencies - leaf package
  - path: packages/shared
    can_import: [packages/core]
  - path: packages/api
    can_import: [packages/core, packages/shared]
  - path: packages/web
    name: "@myorg/web"  # optional custom name
    can_import: [packages/core, packages/shared, packages/api]
```

**How it works:**
- Each package defines which other packages it can import from
- Imports within the same package are always allowed
- Files outside defined packages are not checked
- Violations are reported during `--project` validation

---

## Layer Boundaries

For projects using glob patterns for layer enforcement:

```yaml
layers:
  - name: utils
    paths: ["src/utils/**", "src/common/**"]
    can_import: []  # leaf layer

  - name: core
    paths: ["src/core/**"]
    can_import: [utils]

  - name: infra
    paths: ["src/infra/**", "src/validators/**"]
    can_import: [utils, core]

  - name: cli
    paths: ["src/cli/**"]
    can_import: [utils, core, infra]  # top layer

  - name: api
    paths: ["src/api/**"]
    can_import: [utils, core]
    exclude:  # skip generated files
      - "src/api/generated/**"
```

**Difference from packages:**
- **Packages** use path prefixes (e.g., `packages/core`) - good for monorepos
- **Layers** use glob patterns (e.g., `src/core/**`) - good for layered architectures

---

## Coverage Constraints (`require_coverage`)

Ensures cross-file completeness - for example, that every domain event has a handler.

```yaml
domain.events:
  constraints:
    - rule: require_coverage
      value:
        source_type: union_members
        source_pattern: "DomainEventType"
        in_files: "src/events/types.ts"
        target_pattern: "${value}"
        transform: "handle${PascalCase}"
        in_target_files: "src/handlers/**/*.ts"
      severity: error
      why: "Every domain event must have a handler"
```

### Source Types

| Type | Description | `source_pattern` |
|------|-------------|------------------|
| `export_names` | Exported identifiers matching a glob | `*Event` |
| `string_literals` | String literals extracted via regex | `EventType\\s*=\\s*([^;]+)` |
| `file_names` | File basenames (without extension) | `*` |
| `union_members` | TypeScript union type string literals | `DomainEventType` |
| `object_keys` | TypeScript object literal keys | `handlers` |

### Transform Parameter

| Placeholder | Example Input | Output |
|-------------|---------------|--------|
| `${value}` | `product.archived` | `product.archived` |
| `${PascalCase}` | `product.archived` | `ProductArchived` |
| `${camelCase}` | `product.archived` | `productArchived` |
| `${snake_case}` | `productArchived` | `product_archived` |
| `${UPPER_CASE}` | `product.archived` | `PRODUCT_ARCHIVED` |
| `${kebab-case}` | `productArchived` | `product-archived` |

### Constraint Fields

| Field | Required | Description |
|-------|----------|-------------|
| `source_type` | Yes | How to extract sources |
| `source_pattern` | Yes | Pattern to extract sources |
| `extract_values` | No | Regex to extract values (for `string_literals`) |
| `in_files` | Yes | Glob pattern for source files |
| `target_pattern` | Yes | Pattern to find handlers |
| `transform` | No | Transform template (e.g., `handle${PascalCase}`) |
| `in_target_files` | Yes | Glob pattern for handler files |

---

## DRY Detection (`max_similarity`)

Detects files that are too similar, surfacing potential DRY violations:

```yaml
domain.service:
  constraints:
    - rule: max_similarity
      value: 0.8
      severity: warning
      why: "High similarity suggests code duplication"
```

**How it works:**
- Compares files with the same architecture tag against each other
- Uses Jaccard similarity on methods (35%), exports (35%), classes (15%), imports (15%)
- Files exceeding threshold are flagged

**Recommended thresholds:**
- `0.9` - Very strict: only flag near-duplicates
- `0.8` - Balanced: flag files with similar structure
- `0.7` - Relaxed: flag files with overlapping patterns

---

## Companion Constraints

### `require_companion_file`

Ensures sibling files exist (barrels, tests, styles, stories):

```yaml
constraints:
  # Simple path - require barrel file
  - rule: require_companion_file
    value: "./index.ts"
    severity: warning
    why: "All modules need barrel exports"

  # Variable substitution - require test file
  - rule: require_companion_file
    value: "${name}.test.ts"
    severity: warning
    why: "All files need tests"

  # Object with must_export - verify barrel exports this file
  - rule: require_companion_file
    value:
      path: "./index.ts"
      must_export: true
    severity: warning
    why: "Barrel must re-export this module"

  # Multiple companions
  - rule: require_companion_file
    value:
      - "./index.ts"
      - "${name}.test.tsx"
      - "${name}.stories.tsx"
    severity: warning
    why: "Components need barrel, tests, and stories"
```

**Variable substitution:**

| Variable | Description | Example Input | Output |
|----------|-------------|---------------|--------|
| `${name}` | File basename (without extension) | `MyService.ts` | `MyService` |
| `${name:kebab}` | Kebab-case basename | `MyService.ts` | `my-service` |
| `${ext}` | File extension (without dot) | `Button.tsx` | `tsx` |
| `${dir}` | Parent directory name | `src/components/Button.tsx` | `components` |

**Phases:**
1. **Existence check**: Verifies the companion file exists
2. **Export validation** (`must_export: true`): Verifies the companion exports from the source file
3. **Auto-fix suggestions**: Provides template content for missing files

**Skipped files:** Validation is skipped for files that are themselves companions:
- Barrel files: `index.ts`, `index.tsx`, `index.js`
- Test files: `*.test.ts`, `*.spec.ts`
- Story files: `*.stories.ts`, `*.stories.tsx`

### `require_companion_call`

Ensures certain method calls are paired with companion calls:

```yaml
constraints:
  # Cache operations must be followed by save
  - rule: require_companion_call
    value:
      target: cacheManager
      operations: [set, delete, clear]
      call: save
      location: same_file
    pattern: "cacheManager.*"
    severity: warning
    why: "Cache changes must be persisted"

  # Multiple companion rules
  - rule: require_companion_call
    value:
      rules:
        - target: db
          operations: [insert, update, delete]
          call: commit
        - target: transaction
          operations: [begin]
          call: commit
      location: same_function
    severity: error
    why: "Database operations must be committed"
```

**Configuration fields:**

| Field | Description |
|-------|-------------|
| `target` | Target to match (receiver in method_chain mode) |
| `operations` | Method names that trigger the rule |
| `call` | Required companion call |
| `rules` | Array of companion rules (alternative to single rule) |
| `location` | Where companion must be: `same_function`, `same_file`, `after` |

**Target detection modes** (configured in `.arch/config.yaml`):

```yaml
table_detection:
  mode: method_chain    # cacheManager.set() → target is 'cacheManager'
  # Or:
  mode: first_argument  # db.insert(TABLE) → target is TABLE
```

---

## Runtime Constraints

### `forbid_call`

Block specific function/method calls:

```yaml
constraints:
  - rule: forbid_call
    value: [setTimeout, setInterval, Function]
    severity: error
    why: "Use controlled timing utilities instead"
```

**Pattern matching:**
- Exact match: `setTimeout` matches `setTimeout()`
- Wildcard: `console.*` matches `console.log()`, `console.error()`
- Deep wildcard: `api.**` matches `api.client.fetch()`
- Regex: `/^window\./` matches any window property access

**Intent exemptions:**

Use `unless` with `@intent:` to exempt files or functions with specific intents:

```yaml
constraints:
  - rule: forbid_call
    value: [console.log, console.warn]
    severity: error
    why: "Use structured logger"
    unless:
      - "@intent:cli-output"
```

With function-level intents, you can exempt specific functions while keeping the rest of the file constrained:

```typescript
/** @intent:cli-output */
function printHelp(): void {
  console.log("Usage: ...");  // ✓ allowed - function has intent
}

function process(): void {
  console.log("debug");  // ✗ ERROR - no intent
}
```

### `require_try_catch`

Require try/catch blocks around specific calls:

```yaml
constraints:
  - rule: require_try_catch
    around: [fetch, api.*, database.*]
    severity: warning
    why: "External calls must handle errors gracefully"
```

### `forbid_mutation`

Prevent mutation of global objects:

```yaml
constraints:
  - rule: forbid_mutation
    value: [process.env, window, globalThis, global]
    severity: error
    why: "Global state mutation is forbidden"
```

**Detected mutation types:**
- Assignment operators: `=`, `+=`, `-=`, etc.
- Delete operations: `delete obj.prop`
- Increment/decrement: `++`, `--`

---

## Security & Validation Constraints

### `require_call`

Require specific function calls to be present:

```yaml
constraints:
  - rule: require_call
    value: [validateInput, sanitizeOutput]
    severity: error
    why: "All mutations must validate input"
```

### `require_pattern`

Require specific patterns to exist (regex-based):

```yaml
constraints:
  - rule: require_pattern
    value: "soft delete filter"
    pattern: 'isDeleted\s*===?\s*false'
    severity: error
    why: "Queries must filter soft-deleted records"
```

### `forbid_pattern`

Block specific patterns (regex-based):

```yaml
constraints:
  - rule: forbid_pattern
    value: "console.log statements"
    pattern: 'console\.log'
    severity: error
    why: "Use structured logger instead"
```

### `allow_pattern`

Override a parent's `forbid_pattern`:

```yaml
debug.utilities:
  inherits: base
  constraints:
    - rule: allow_pattern
      value: "console.log allowed here"
      pattern: 'console\.log'  # Must match the forbid exactly
```

### `require_one_of`

Require at least one of several patterns:

```yaml
constraints:
  - rule: require_one_of
    value:
      - "isDeleted === false"           # Literal match
      - "@no-soft-delete"               # Annotation in comment
      - "/isDeleted\\s*!==?\\s*true/"   # Regex pattern
    severity: error
    why: "Queries must filter soft-deleted records or explicitly opt out"
```

**Pattern types:**
| Pattern | Syntax | Matches |
|---------|--------|---------|
| Literal | `isDeleted` | Exact string anywhere in file |
| Annotation | `@no-soft-delete` | Pattern in comments only |
| Regex | `/pattern/` | Regex match with `ms` flags |

### `require_export`

Require specific exports:

```yaml
constraints:
  - rule: require_export
    value: ["*Provider", "use*"]
    severity: error
    why: "Context files must export Provider and hook"
```

### `require_call_before`

Require certain calls to happen before other calls:

```yaml
constraints:
  - rule: require_call_before
    value: [canAccessProject, checkPermission, isAdmin]
    before: ["ctx.db.patch", "ctx.db.delete", "ctx.db.replace"]
    severity: error
    why: "Permission checks required before data modifications"
```

---

## Conditional Constraints

### `when` Clause

Apply constraints conditionally based on file characteristics:

```yaml
api.controller:
  constraints:
    - rule: require_decorator
      value: "@Authenticated"
      severity: error
      when:
        has_decorator: "@HttpHandler"
      why: "All HTTP handlers must be authenticated"
```

### Available Conditions

**Positive conditions** (apply when condition IS met):

| Condition | Example |
|-----------|---------|
| `has_decorator` | `has_decorator: "@Controller"` |
| `has_import` | `has_import: "express"` or `has_import: "@nestjs/*"` |
| `extends` | `extends: "BaseController"` |
| `file_matches` | `file_matches: "*.controller.ts"` |
| `implements` | `implements: "IService"` |
| `method_has_decorator` | `method_has_decorator: "@Get"` |

**Negated conditions** (apply when condition is NOT met):

| Condition | Example |
|-----------|---------|
| `not_has_decorator` | `not_has_decorator: "@Generated"` |
| `not_has_import` | `not_has_import: "@internal/server"` |
| `not_extends` | `not_extends: "BaseEntity"` |
| `not_file_matches` | `not_file_matches: "**/generated/**"` |
| `not_implements` | `not_implements: "IMockable"` |
| `not_method_has_decorator` | `not_method_has_decorator: "@Test"` |

---

## Content-Based Conditions

### `applies_when` and `unless`

More readable, declarative conditional constraints:

```yaml
constraints:
  - rule: forbid_pattern
    value: "console\\.(log|error|warn)"
    applies_when: "console\\."           # Only check if file contains this
    unless:
      - import:structuredLogger              # Skip if imports structuredLogger
      - "@intent:debug-only"             # Skip if has @intent:debug-only
      - decorator:@DevOnly               # Skip if has @DevOnly decorator
    why: "Use structuredLogger for structured logging"
    alternative: structuredLogger
```

### `unless` Formats

| Format | Description | Example |
|--------|-------------|---------|
| `import:module` | File imports this module | `import:structuredLogger` |
| `@intent:name` | File has this @intent | `@intent:debug-only` |
| `decorator:@Name` | File uses this decorator | `decorator:@DevOnly` |
| `plainString` | Treated as import | `structuredLogger` |

### Comparison with `when`

| Feature | `when` clause | `applies_when`/`unless` |
|---------|---------------|-------------------------|
| Syntax | Object with conditions | Simple strings |
| Logic | Positive conditions | Pattern + exceptions |
| Readability | More verbose | More declarative |
| Use case | Complex conditions | Simple content-based rules |

Both can be used together - `when` is checked after `applies_when`/`unless`.

---

## Constraint Inheritance Control

### Override Flag

Use `override: true` to **replace ALL parent constraints with the same rule**:

```yaml
domain.external:
  inherits: base
  constraints:
    - rule: forbid_import
      value: [console]  # Only forbid console, allow http/axios
      severity: error
      override: true    # Removes ALL inherited forbid_import rules
```

### Exclude Constraints

Use `exclude_constraints` to **remove specific inherited constraints**:

```yaml
domain.generated:
  inherits: base
  exclude_constraints:
    - "forbid_import:console"    # Remove specific forbid_import
    - "max_file_lines"           # Remove all max_file_lines
```

**Exclusion patterns:**

| Pattern | Effect |
|---------|--------|
| `rule:value` | Remove exact constraint (e.g., `forbid_import:console`) |
| `rule` | Remove ALL constraints with that rule |
| `rule:` | Remove ALL constraints with that rule prefix |

### When to Use Which

| Scenario | Use |
|----------|-----|
| Replace ALL constraints of a rule type | `override: true` |
| Remove specific inherited constraints | `exclude_constraints` |
| Add to parent constraints | Default (additive) |
| Skip constraint for specific files | `when` with negated conditions |

---

## Related Documentation

- [Configuration](configuration.md) - Config file reference
- [Semantic Intents](intents.md) - Using intents with `require_one_of`
- [CLI Validation](cli/validation.md) - check command options
- [Back to README](../README.md)
