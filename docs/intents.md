# Semantic Intent Annotations

Guide to using `@intent:` annotations in ArchCodex.

---

## Overview

Intent annotations (`@intent:name`) declare semantic patterns that code follows. Unlike overrides (which are exceptions), intents are first-class patterns that can satisfy constraints like `require_one_of` and exempt code from `forbid_call` constraints.

---

## Using Intent Annotations

### File-Level Intents

Add `@intent:` annotations in file header comments to apply to the entire file:

```typescript
/**
 * @arch domain.query
 * @intent:includes-deleted
 */
export const listDeletedDocuments = query({
  // This query intentionally includes deleted records (e.g., trash view)
  handler: async (ctx) => {
    return await ctx.db.query("documents").collect();
  }
});
```

### Function-Level Intents

Intents can also be applied to individual functions or methods for more granular control:

```typescript
/**
 * @arch archcodex.core.engine
 */

/** @intent:cli-output */
function printReport(data: Report): void {
  console.log(data);  // ✓ allowed - function has cli-output intent
}

function processData(items: Item[]): void {
  console.log('debug');  // ✗ ERROR - no intent on this function
}
```

Function-level intents work with:
- **JSDoc comments** on function declarations
- **JSDoc comments** on arrow functions (`/** @intent:x */ const fn = () => {}`)
- **JSDoc comments** on class methods

**Resolution order**: When checking intents, ArchCodex uses:
1. The containing function's intents (if any)
2. Falls back to file-level intents

Function-level intents take precedence over file-level intents (more specific wins).

---

## Intent vs Override

> **Intents are architectural decisions; overrides are technical debt.**
> Intents document known, legitimate deviations. Overrides handle unanticipated exceptions — and signal that a new intent may be needed.

| Aspect | Override | Intent |
|--------|----------|--------|
| Purpose | Skip a rule (exception) | Follow an alternative pattern |
| Expires | Yes (required) | No |
| Searchable | `grep @override` | `grep @intent:includes-deleted` |
| Self-documenting | Needs `@reason` | Name explains intent |
| Satisfies constraints | No (bypasses) | Yes (fulfills `require_one_of`) |
| Evolution | Temporary → promote to intent | Permanent architectural decision |

**Use intents when:**
- The code follows a valid alternative pattern
- The pattern is intentional, not exceptional
- Other files might follow the same pattern

**Use overrides when:**
- You encounter an unanticipated exception
- The code violates rules due to legacy/migration
- You don't yet know if this will become a pattern

### The Override → Intent Lifecycle

Overrides are a discovery mechanism. When the same override pattern recurs across files, it signals a known deviation that should be promoted to an intent:

```
1. Constraint violation encountered
2. Override added (temporary, with @expires)
3. Same override appears in 2-3 files → pattern emerges
4. Define new intent in _intents.yaml
5. Add `unless: ["@intent:new-name"]` to the constraint
6. Replace @override with @intent:new-name in affected files
```

**Example: the `cli-output` intent evolution**

A constraint forbids `console.log`. Early on, CLI files add overrides:
```typescript
// Before: each file has a temporary override
@override forbid_pattern:console\.(log|error)
@reason Entry point needs console for CLI output
@expires 2026-06-01
```

The recurring pattern becomes an intent:
```yaml
# _intents.yaml
cli-output:
  description: "File outputs to stdout/stderr for CLI user interaction"
```

```yaml
# Constraint now has an unless clause for the known deviation
- rule: forbid_pattern
  pattern: 'console\.(log|error|warn|debug)'
  unless:
    - "@intent:cli-output"
```

```typescript
// After: permanent architectural decision
@intent:cli-output
```

### Writing Intent-Aware Constraints

When defining constraints, add `unless` clauses for **known, anticipated** deviations:

```yaml
constraints:
  - rule: forbid_pattern
    pattern: '\.arch/registry\.yaml'
    unless:
      - "@intent:registry-infrastructure"  # Known: loader files need this
    why: "Use loadRegistry() for auto-detection"
```

You cannot predict every future deviation — that's what overrides are for. The `unless` clause documents deviations you know about at design time. Overrides surface the ones you didn't anticipate, and those may later become new intents.

---

## Defining Intents

Define intents in `.arch/registry/_intents.yaml`:

```yaml
intents:
  admin-only:
    description: "Restricted to admin users"
    requires:
      - "/isAdmin|hasAdminRole|checkAdmin/i"  # Must have this pattern
    conflicts_with:
      - public-endpoint  # Can't be both admin and public
    category: auth

  stateless:
    description: "Component has no internal state requiring cleanup"
    forbids:
      - "this\\.cache"
      - "this\\.disposables"
    category: lifecycle

  cached:
    description: "Response can be cached"
    requires_intent:
      - idempotent  # Must also have @intent:idempotent
    category: performance
```

### Intent Definition Fields

| Field | Description |
|-------|-------------|
| `description` | What this intent means |
| `requires` | Code patterns that must exist (regex or literal) |
| `forbids` | Code patterns that must NOT exist |
| `conflicts_with` | Other intents that cannot coexist |
| `requires_intent` | Other intents that must also be present |
| `category` | Grouping for discovery (auth, lifecycle, performance) |
| `suggest_for_paths` | Glob patterns that suggest this intent |
| `suggest_for_archs` | Architecture patterns that suggest this intent |

---

## Using Intents in Constraints

### With `require_one_of`

Intents can satisfy `require_one_of` constraints:

```yaml
constraints:
  - rule: require_one_of
    value:
      - "isDeleted === false"       # Code pattern
      - "deletedFilter"             # Alternative code pattern
      - "@intent:includes-deleted"  # Semantic annotation!
    severity: warning
    why: "Queries should filter soft-deleted records or explicitly opt out"
```

Files can comply by either:
1. Including the soft-delete check in code
2. Adding `@intent:includes-deleted` annotation (file-level or function-level)

### With `forbid_call`

Intents can exempt code from `forbid_call` constraints using the `unless` field:

```yaml
constraints:
  - rule: forbid_call
    value: [console.log, console.warn, console.error]
    severity: error
    why: "Use structured logger instead"
    unless:
      - "@intent:cli-output"  # Files/functions with this intent are exempt
```

With function-level intents, you can allow specific functions to make forbidden calls, while keeping the rest of the file constrained:

```typescript
/**
 * @arch core.engine
 */

/** @intent:cli-output */
function displayResults(results: Result[]): void {
  console.log(JSON.stringify(results, null, 2));  // ✓ allowed
}

function processResults(results: Result[]): Result[] {
  console.log('Processing...');  // ✗ ERROR - no intent
  return results.map(transform);
}
```

---

## Built-in Intents

ArchCodex ships with 13 starter intents across 6 categories:

### lifecycle
| Intent | Description |
|--------|-------------|
| `stateless` | Component has no internal state requiring cleanup |

### auth
| Intent | Description |
|--------|-------------|
| `admin-only` | Restricted to admin users |
| `owner-only` | Restricted to resource owner |
| `public-endpoint` | Endpoint requires no authentication |
| `system-internal` | System-only operations (no user access) |

### data-access
| Intent | Description |
|--------|-------------|
| `includes-deleted` | Query intentionally includes soft-deleted records |
| `deleted-only` | Query returns only deleted records (trash view) |

### performance
| Intent | Description |
|--------|-------------|
| `cacheable` | Response can be cached (requires `idempotent`) |
| `real-time-required` | Cannot use caching, must be fresh data |

### audit
| Intent | Description |
|--------|-------------|
| `audit-reads` | Sensitive data access that must be logged |
| `no-audit-required` | Explicitly does not need audit logging |

### output
| Intent | Description |
|--------|-------------|
| `cli-output` | File legitimately uses console.* for CLI user output |
| `documentation-examples` | File contains documentation/example text (may include patterns like "any" in strings) |

---

## Intent Suggestions

ArchCodex can suggest relevant intents based on file location or architecture.

### Defining Suggestions

```yaml
intents:
  admin-only:
    description: "Restricted to admin users"
    category: auth
    suggest_for_paths:
      - "**/admin/**"
      - "**/backoffice/**"
    suggest_for_archs:
      - "api.admin.*"
      - "*.admin.*"
```

### Where Suggestions Appear

**In `archcodex infer`:**
```
→ src/admin/users.ts
   Suggested: api.admin.controller [high]
   Intents:   @intent:admin-only
              └ admin-only: Restricted to admin users (path match)
```

**In `archcodex scaffold`:**
```bash
archcodex scaffold api.admin.controller --name UserAdmin --output src/admin/
# Output includes:
# Suggested intents for this file:
#   @intent:admin-only - Restricted to admin users (path match)
```

### Pattern Types

- `suggest_for_paths`: Glob patterns matching file paths (uses minimatch)
- `suggest_for_archs`: Architecture patterns with wildcards (`*` matches one segment)

---

## Intent Validation

### CLI Commands

```bash
# List all defined intents
archcodex intents --list

# Show details for a specific intent
archcodex intents --show admin-only

# Show intent usage across codebase
archcodex intents --usage

# Validate all intent usage
archcodex intents --validate
```

### Validation Checks

| Check | Description |
|-------|-------------|
| **Undefined intents** | Used but not in registry |
| **Missing patterns** | `@intent:admin-only` without `isAdmin` in code |
| **Forbidden patterns** | `@intent:stateless` with `this.cache` in code |
| **Conflicts** | `@intent:public-endpoint` + `@intent:admin-only` |
| **Missing required intents** | `@intent:cached` without `@intent:idempotent` |

### Sample Validation Output

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

---

## Intent Health Metrics

The `archcodex health` command includes intent metrics:

```
Intent Health
────────────────────────────────────────
  Files with intents: 17/186 (9%)
  Total intents:      22 (5 unique)
  Undefined:       1 intent(s)
  Issues:          3 validation issue(s)
```

---

## Example: Soft-Delete Pattern

### Define the Intent

```yaml
# .arch/registry/_intents.yaml
intents:
  includes-deleted:
    description: "Query intentionally includes soft-deleted records"
    category: data-access
    suggest_for_paths:
      - "**/trash/**"
      - "**/admin/**"
```

### Use in Constraint

```yaml
# Architecture definition
domain.query:
  constraints:
    - rule: require_one_of
      value:
        - "isDeleted === false"
        - "@intent:includes-deleted"
      severity: error
      why: "Queries must filter soft-deleted records or explicitly opt out"
```

### Use in Code

```typescript
/**
 * @arch domain.query
 * @intent:includes-deleted
 */
export const listTrashDocuments = query({
  handler: async (ctx) => {
    // Intentionally returns deleted documents for trash view
    return await ctx.db.query("documents")
      .filter(q => q.eq(q.field("isDeleted"), true))
      .collect();
  }
});
```

---

## Related Documentation

- [Constraint Reference](constraint-reference.md) - Using intents with `require_one_of`
- [CLI Registry](cli/registry.md) - `intents` command reference
- [CLI Validation](cli/validation.md) - Health dashboard includes intent metrics
- [Back to README](../README.md)
