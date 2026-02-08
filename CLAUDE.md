# Claude Code Instructions for ArchCodex

This project uses ArchCodex for architectural constraints.

## BEFORE MODIFYING CODE

**STOP.** Call this MCP tool first:
```json
archcodex_context { "projectRoot": "/absolute/path/to/project", "module": "src/path/to/module/" }
```

> `projectRoot` must be an absolute path where `.arch/` exists (contains the SQLite database).

This gives you **everything in one call**:
- **Project Rules** - Layer hierarchy + shared constraints across all architectures
- **Modification Order** - DEFINES → IMPLEMENTS → ORCHESTRATES
- **🔴N Impact** - How many files break if you change this one
- **Layer Boundaries** - CAN/CANNOT import lists
- **Entity Schemas** - Fields, relationships, behaviors (inline)
- **Architecture Constraints** - forbid, patterns, require, all hints
- **Validation Command** - Run after changes

## Workflow

```
1. archcodex_context       ← GET FULL CONTEXT FIRST (module or entity)
2. Read tool               ← READ files (code content)
   archcodex_read          ← GET per-file constraints (auto-injected via pre-read hook)
3. Write code              ← Follow modification order, respect constraints
4. archcodex_check         ← VALIDATE AFTER CHANGES (auto-run via post-write hook)
```

> **Note:** `archcodex_read` returns only architectural data (constraints, boundaries, hints) — never file content. Use the agent's native `Read` tool for code content. The pre-read hook auto-injects constraints when reading src/ files.

## MCP Tools

| When | Tool Call |
|------|-----------|
| Before modifying | `archcodex_context { "projectRoot": "/path", "module": "src/dir/" }` |
| Before creating | `archcodex_discover { "projectRoot": "/path", "query": "description" }` |
| After changes | `archcodex_check { "projectRoot": "/path", "files": ["src/**/*.ts"] }` |
| Entity work | `archcodex_context { "projectRoot": "/path", "entity": "EntityName" }` |
| Task guidance | `archcodex_action { "projectRoot": "/path", "query": "add order action" }` |
| Verify wiring | `archcodex_feature_audit { "projectRoot": "/path", "mutation": "duplicateOrder", "entity": "orders" }` |
| Scaffold spec | `archcodex_spec_scaffold_touchpoints { "projectRoot": "/path", "specId": "spec.orders.duplicateOrder", "entity": "orders" }` |

> **Note:** `projectRoot` must be absolute path to project root (where `.arch/` exists).

## Understanding Context Output

```yaml
# src/core/db/ (9 files, 10 entities)

## 0. Project Rules

Layer Hierarchy:
  config → (leaf)
  utils → (leaf)
  core → [utils, validators]          ← core can import utils, validators
  cli → [utils, core, validators]     ← cli can import core, utils, validators

Shared Constraints (apply to ALL files):
  forbid: commander, chalk, ora       ← Never import these anywhere
  patterns: console\.(log|error)      ← Forbidden code patterns
  hints: [SRP] Each file should have one reason to change

## 1. Modification Order

DEFINES (modify first):
  types.ts [arch.id] 🔴4              ← Change FIRST, 4 files depend on this

IMPLEMENTS (update when contracts change):
  service.ts [arch.id] 🔴2            ← Change SECOND

ORCHESTRATES (modify last):
  handler.ts [arch.id]                ← Change LAST

## 2. Boundaries

layer: core
CAN import: [utils, validators]       ← Safe to import from these layers
CANNOT import: [cli, mcp, llm]        ← NEVER import from these layers

## 4. Impact

Consumers (will break if you change exports):
  src/cli/commands/map.ts
  src/mcp/handlers/context.ts

## 5. ArchCodex

architecture: archcodex.core.engine
constraints:
  forbid: [commander, chalk, ora]     ← Forbidden imports for this architecture
  patterns: [explicit any type]       ← Forbidden code patterns
hints:
  - Core modules should be framework-agnostic
  - [DIP] Import interfaces/types, not concrete implementations
  - [KISS] Prefer simple solutions

validate: archcodex_check { ... }     ← Run this after changes
```

## @arch Tags

Every new file MUST have:
```typescript
/** @arch <architecture-id> */
```

Use `archcodex_discover` to find the right architecture ID.

## Common Architectures

| Pattern | When to Use |
|---------|-------------|
| `archcodex.core.types` | Pure type definitions |
| `archcodex.core.engine` | Use case orchestrators |
| `archcodex.cli.command` | CLI command handlers |
| `archcodex.cli.mcp.handler` | MCP tool handlers |
| `archcodex.util` | Pure utility functions |

## UI Component Awareness

ArchCodex tracks coupled UI component groups that must be updated together.

### Component Groups
Defined in `.arch/component-groups.yaml`, these specify components that render the same entity:
```yaml
component-groups:
  order-cards:
    components:
      - path: src/components/orders/cards/PendingCard.tsx
      - path: src/components/orders/cards/ProcessingCard.tsx
    triggers:
      entities: [orders]
```

### Feature Audit
After implementing a feature, verify all layers are wired:
```json
archcodex_feature_audit { "mutation": "duplicateOrder", "entity": "orders" }
```

Checks:
- **Backend**: Mutation exists, exported from barrel
- **Frontend**: Hook wrapper exists, handler function exists
- **UI**: Each component in matched group references the handler

### Action Checklists
When using `archcodex_action`, checklists automatically expand component groups:
```
ui:
  - Wire to ALL 5 order cards:
  - [ ] PendingCard
  - [ ] ProcessingCard
  - [ ] ShippedCard
  - [ ] CompletedCard
  - [ ] CancelledCard
```

## Handling Violations

1. **Fix the code** - Use `suggestion` from `--json` output
2. **Use an intent** - If it's a known valid pattern
3. **Add override** (last resort) - Requires `@reason` and `@expires`

## Documentation

- [AI Integration](docs/ai-integration.md) - MCP tools, prompt templates
- [Constraint Reference](docs/constraint-reference.md) - All rules

---

## SpecCodex: Specification by Example

SpecCodex generates deterministic tests from YAML specs. Define behavior once, generate unit/property/integration tests automatically.

### Setup (One-time)
```bash
archcodex spec init
```

### Core Workflow

**1. Create a spec** at `.arch/specs/<domain>/<name>.spec.yaml`:
```yaml
version: "1.0"

spec.myapp.validateUser:
  inherits: spec.function
  implementation: src/services/user.ts#validateUser

  goal: "Validate user input before saving"
  intent: "Check user data has required fields and valid format"

  inputs:
    user:
      type: object
      required: true
      properties:
        email: { type: string }
        age: { type: number }

  outputs:
    valid: { type: boolean }
    errors: { type: array }

  examples:
    success:
      - name: "valid user"
        given:
          user: { email: "test@example.com", age: 25 }
        then:
          result.valid: true
          result.errors: "@length(0)"
    errors:
      - name: "missing email"
        given:
          user: { age: 25 }
        then:
          result.valid: false
          result.errors: "@hasItem('email is required')"
```

**2. Validate → Generate → Verify:**
```bash
archcodex spec check .arch/specs/myapp/validate-user.spec.yaml
archcodex spec generate spec.myapp.validateUser --type unit --output src/services/user.test.ts
archcodex spec verify spec.myapp.validateUser
```

### Key Placeholders

| Placeholder | Use | Generated Code |
|-------------|-----|----------------|
| `@length(N)` | Array/string length | `expect(x).toHaveLength(N)` |
| `@hasItem('x')` | Array contains string | `expect(arr).toContain('x')` |
| `@hasItem({k:v})` | Array contains object | `expect(arr).toEqual(expect.arrayContaining([...]))` |
| `@hasProperties({k:v})` | Object has properties | `expect(obj).toMatchObject({k:v})` |
| `@all(a, b)` | Multiple assertions | Both assertions on same value |
| `@gt(N)` / `@lt(N)` | Comparisons | `expect(x).toBeGreaterThan(N)` |

### Commands

| Command | Purpose |
|---------|---------|
| `spec init` | Initialize SpecCodex |
| `spec check <path>` | Validate spec YAML |
| `spec generate <id> --type unit` | Generate tests |
| `spec verify <id>` | Verify implementation |
| `spec infer <impl>` | Generate spec from existing code |
| `spec infer --update <id>` | Update existing spec from code changes |
| `spec list` | List all specs |
| `spec placeholder --list` | Show all placeholders |
| `spec help <topic>` | Help (topics: writing, generating, inferring, placeholders) |

### Reverse Workflow (Code First)

When code exists before the spec, generate a spec from it:

```bash
# Infer spec from implementation (auto-detects patterns, types, effects)
archcodex spec infer src/services/user.ts#validateUser --output .arch/specs/services/user.spec.yaml

# Fill in TODO placeholders (goal, intent, examples, invariants), then:
archcodex spec check .arch/specs/services/user.spec.yaml
archcodex spec generate spec.services.user.validateUser --type unit

# When implementation changes, update spec preserving hand-written content:
archcodex spec infer src/services/user.ts#validateUser --update spec.services.user.validateUser
```

### Tips
- Single object input → function called as `fn(obj)` not `fn({obj})`
- Keys with hyphens (`Content-Type`) are auto-quoted in generated code
- Use `@hasProperties` for objects, `@hasItem` for arrays
