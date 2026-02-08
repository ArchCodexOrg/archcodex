# ArchCodex

[![CI](https://github.com/ArchCodexOrg/archcodex/actions/workflows/ci.yml/badge.svg)](https://github.com/ArchCodexOrg/archcodex/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ArchCodexOrg/archcodex/branch/main/graph/badge.svg)](https://codecov.io/gh/ArchCodexOrg/archcodex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The Architectural Compiler for LLM Agents**

> **Research Project:** This is an experimental tool exploring whether explicit architectural constraints and context hydration can prevent architectural drift in AI-assisted codebases and produce more predictable, consistent agent output.

ArchCodex enforces architectural constraints through context hydration. Developers write minimal `@arch` tags; LLM agents retrieve fully hydrated headers with constraints, hints, and documentation references via the `archcodex read` command.

```
Developer writes:  /** @arch domain.payment.processor */
Agent retrieves:   archcodex read file.ts --format ai → Full constraints, hints, documentation
```

## Why ArchCodex?

LLM agents are good at writing code that *works*. They're bad at writing code that *belongs*.

Every codebase has an implicit architecture: conventions, patterns, module boundaries, the "how we do things here" that experienced developers carry as tribal knowledge. LLMs can't read tribal knowledge. They write code that compiles and passes tests, but violates architectural boundaries — using manual permission checks instead of the centralized helper, importing across layer boundaries, reinventing utilities that already exist.

Worse, **drift compounds**. When inconsistency creeps into a codebase — multiple ways of doing the same thing, competing patterns, duplicate utilities — LLMs perform *worse*. They copy the wrong pattern because it appeared more recently in context. Each drifted commit makes the next one more likely. The codebase doesn't drift all at once; it drifts one "working" commit at a time.

ArchCodex solves this by:

- **Hydrating constraints** via the `archcodex read` command for AI agents
- **Validating compliance** on save, commit, and CI
- **Guiding new file creation** with discovery and scaffolding
- **Documenting exceptions** with auditable overrides

## Installation

> **Note:** ArchCodex is not yet published to npm. Install from source:

```bash
# Clone the repository
git clone https://github.com/ArchCodexOrg/archcodex.git
cd archcodex

# Install dependencies and build
npm install
npm run build

# Link globally (optional)
npm link
```

## Quick Start

### 1. Initialize your project

```bash
archcodex init
```

Creates `.arch/` directory with configuration files.

### 2. Define architectures

In `.arch/registry/` (or a single `.arch/registry.yaml`):

```yaml
domain:
  description: "Base domain constraints"
  rationale: "Foundation for all domain code"
  constraints:
    - rule: forbid_import
      value: [console]
      severity: error
      why: "Use Logger service instead"

domain.payment:
  inherits: domain
  description: "Payment domain - PCI compliance"
  rationale: "Use for any code handling payment data"
  constraints:
    - rule: forbid_import
      value: [http, axios]
      severity: error
      why: "Use ApiClient for PCI-compliant logging"
  hints:
    - "Redact CVV/PAN before logging"
```

### 3. Tag your files

```typescript
/** @arch domain.payment */
export class PaymentService {
  // ...
}
```

### 4. Validate

```bash
archcodex check src/**/*.ts
```

> **New to ArchCodex?** See the [Getting Started Guide](docs/getting-started.md) for a comprehensive tutorial covering new projects and existing codebase adoption.

## Core Concepts

### @arch Tags

Every source file should have an `@arch` tag declaring its architecture:

```typescript
/**
 * @arch domain.payment.processor
 */
```

Use `archcodex discover "description"` to find the right architecture for new files.

### Constraints

Rules enforced on files:

| Constraint            | Description               |
| --------------------- | ------------------------- |
| `forbid_import`       | Block specific imports    |
| `require_import`      | Require specific imports  |
| `require_decorator`   | Require class decorators  |
| `max_file_lines`      | Limit file length         |
| `require_test_file`   | Require companion tests   |
| `require_call_before` | Require permission checks |

See [Constraint Reference](docs/constraint-reference.md) for all 28 constraint types.

### Inheritance & Mixins

Architectures inherit from parents and compose mixins:

```yaml
domain.payment.processor:
  inherits: domain.payment
  mixins: [tested, srp]
```

### Overrides

When a legitimate exception is needed:

```typescript
/**
 * @arch domain.payment.processor
 * @override forbid_import:http
 * @reason Legacy API requires direct HTTP access
 * @expires 2026-06-01
 */
```

### Semantic Intents

Declare intentional patterns that satisfy constraints. Intents work at file-level or function-level:

```typescript
// File-level intent (applies to entire file)
/**
 * @arch domain.query
 * @intent:includes-deleted
 */

// Function-level intent (applies to specific function)
/** @intent:cli-output */
function printReport() {
  console.log(report);  // ✓ allowed
}
```

See [Semantic Intents](docs/intents.md) for details.

## CLI Quick Reference

| Category        | Commands                                                              | Description                      |
| --------------- | --------------------------------------------------------------------- | -------------------------------- |
| **Validation**  | `check`, `verify`, `health`, `why`, `test-pattern`                    | Validate files and check health  |
| **Discovery**   | `discover`, `decide`, `resolve`, `diff-arch`, `schema`, `graph`       | Find and explore architectures   |
| **Scaffolding** | `scaffold`, `action`, `feature`, `tag`, `infer`, `bootstrap`, `learn` | Create and tag files             |
| **Analysis**    | `read`, `neighborhood`, `types`, `garden`                             | Analyze code with context        |
| **Registry**    | `reindex`, `sync-index`, `migrate-registry`, `audit`, `intents`       | Manage registry and index        |
| **Versioning**  | `diff`, `migrate`, `simulate`, `watch`, `init`, `fetch`, `feedback`   | Version control and migrations   |
| **SpecCodex**   | `spec list`, `spec generate`, `spec verify`, `spec infer`, `spec drift` | Specification by Example testing |
| **Docs**        | `doc adr`, `doc watch`, `doc verify`, `doc templates`                 | Generate documentation           |

### Essential Commands

```bash
# Discover architecture for new file
archcodex discover "payment processor"

# Read file with architectural context (AI-optimized)
archcodex read src/payment/processor.ts --format ai

# Check import boundaries before adding imports
archcodex neighborhood src/payment/processor.ts

# Validate files
archcodex check src/**/*.ts --json

# Generate new file from template
archcodex scaffold domain.payment.processor --name RefundProcessor

# View architecture health
archcodex health
```

## Configuration

### `.arch/config.yaml`

```yaml
version: "1.0"

files:
  untagged:
    policy: warn  # allow | warn | deny

validation:
  fail_on_warning: false
  precommit:
    max_errors: 0
    output_format: compact
```

See [Configuration Reference](docs/configuration.md) for all options.

### `.archignore`

Exclude files from validation (gitignore syntax):

```gitignore
dist/
node_modules/
**/*.test.ts
```

## AI Integration

ArchCodex integrates with AI coding assistants:

- **AI-optimized output** - `archcodex read --format ai`
- **MCP Server** - Native Claude Code integration
- **Pattern registry** - Canonical implementations
- **Actionable errors** - Structured fix suggestions

See [AI Integration Guide](docs/ai-integration.md) for setup.

## SpecCodex: Specification by Example

ArchCodex validates **structure** — imports, layer boundaries, naming patterns. SpecCodex validates **behavior** — function contracts, examples, invariants. Together they catch both structural drift and behavioral drift: code that compiles but violates boundaries *and* code that passes tests but doesn't match its documented contract.

### How It Works

```
Write spec → Validate → Generate tests → Verify implementation → Detect drift
```

| Phase | Command | What it does |
|-------|---------|-------------|
| **Write** | Manual or `spec infer` | Define behavioral contract in YAML |
| **Validate** | `spec check` | Verify spec structure, inheritance, mixins |
| **Generate** | `spec generate` | Deterministic test generation (unit, property, integration) |
| **Verify** | `spec verify` | Check implementation matches spec (bidirectional) |
| **Drift** | `spec drift` | Find specs without implementations and vice versa |

### Spec Structure

```yaml
spec.product.create:
  inherits: spec.mutation                              # Inherits auth defaults
  implementation: src/domain/products/mutations.ts#create

  # Strategic — why this exists
  goal: "Create a new product with validation"
  intent: "User creates a product listing"

  # Contract — inputs, outputs, security
  inputs:
    name: { type: string, required: true, max: 200 }
    price: { type: number, required: true }
    category: { type: enum, values: [electronics, clothing, food] }

  outputs:
    _id: { type: id, table: products }
    name: { type: string }
    createdAt: { type: number }

  security:
    authentication: required
    authorization:
      - { resource: products, access_level: edit }

  # Behavioral rules that must always hold
  invariants:
    - "createdAt must be within 5 seconds of request time"
    - "price must be greater than 0"

  # Concrete test cases — deterministic test generation
  examples:
    success:
      - name: "create with valid data"
        given: { name: "Widget", price: 29.99, category: "electronics" }
        then:
          result._id: "@defined"
          result.name: "Widget"
          result.createdAt: "@gte(@now() - 5000)"
    errors:
      - name: "missing name"
        given: { price: 29.99 }
        then: { error: "INVALID_INPUT" }
      - name: "unauthenticated"
        given: { user: null, name: "Test", price: 10 }
        then: { error: "NOT_AUTHENTICATED" }
```

### Inheritance & Mixins

Specs inherit from base types and compose reusable behavioral patterns:

```yaml
# Base specs provide defaults
spec.function    # Pure functions, no auth
spec.mutation    # Authenticated writes (inherits security defaults)
spec.query       # Authenticated reads
spec.action      # External API calls with side effects

# Mixins add cross-cutting concerns
spec.product.create:
  inherits: spec.mutation
  mixins:
    - requires_auth
    - logs_audit: { action: "product.create", resource: "product" }
    - rate_limited: { requests: 60, window: "15m" }
```

Mixins inject security rules, error examples, effects, and invariants automatically. `requires_auth` adds the "unauthenticated" error example. `logs_audit` adds an audit log effect. Variable substitution (`${action}`) makes mixins parameterizable.

### Placeholders

Specs use placeholders for value generation and assertions:

| Category | Placeholder | Generated code |
|----------|------------|----------------|
| **Values** | `@string(50)`, `@uuid`, `@now` | `"a".repeat(50)`, UUID, `Date.now()` |
| **Auth** | `@authenticated`, `@no_access` | Mock user objects |
| **Assertions** | `@defined`, `@length(3)`, `@gt(0)` | `toBeDefined()`, `toHaveLength(3)`, `toBeGreaterThan(0)` |
| **Content** | `@contains("x")`, `@matches("re")` | `toContain("x")`, `toMatch(/re/)` |
| **Composite** | `@all(@gt(0), @lt(100))` | Both assertions must pass |
| **Collections** | `@hasItem("x")`, `@hasProperties({...})` | `toContain("x")`, `toMatchObject({...})` |

### Architecture + Spec Integration

The analysis engine cross-validates architectural constraints against spec claims:

```bash
archcodex analyze
```

```
SEC-1: Spec claims authentication required but implementation
       is in utility layer (no auth enforcement)
       → spec.product.create declares security.authentication: required
       → but @arch tag is archcodex.util (utility layer forbids auth)

CON-2: Spec claims audit logging but architecture has no logging constraint
       → Move to a layer with audit requirements, or add constraint

DAT-3: Spec output 'discount' is nullable but no example tests the null case
       → Add an error example where discount is null
```

This is the key differentiator: structural analysis meets behavioral contracts. Issues that neither linting nor unit tests can catch — like a security claim that the architecture doesn't enforce — are detected automatically.

### Commands

```bash
# Initialize SpecCodex in your project
archcodex spec init

# Validate spec structure
archcodex spec check .arch/specs/products/create.spec.yaml

# Generate tests (unit, property, or integration)
archcodex spec generate spec.product.create --type unit

# Verify implementation matches spec (bidirectional)
archcodex spec verify spec.product.create

# Detect unwired specs and missing implementations
archcodex spec drift

# View fully resolved spec (with inheritance + mixins expanded)
archcodex spec resolve spec.product.create

# Generate spec from existing code (reverse workflow)
archcodex spec infer src/utils/helpers.ts#formatDate \
  --output .arch/specs/utils/helpers.spec.yaml

# Find spec by intent
archcodex spec discover "create a product"
```

### Reverse Workflow

When code exists before the spec:

```bash
# 1. Infer spec from implementation (detects patterns, types, errors)
archcodex spec infer src/domain/products/mutations.ts#create \
  --output .arch/specs/products/create.spec.yaml

# 2. Fill in TODOs — goal, intent, examples, invariants

# 3. Generate deterministic tests
archcodex spec generate spec.product.create --type unit
```

When implementation changes, update the spec preserving hand-written content:

```bash
archcodex spec infer src/domain/products/mutations.ts#create \
  --update spec.product.create
```

See [SpecCodex Guide](docs/speccodex.md) for comprehensive documentation.

## Documentation Generation

Generate Architecture Decision Records (ADRs) and API documentation from your architectures and specs.

```bash
# Generate ADR for an architecture
archcodex doc adr domain.service -o docs/adr/

# Generate all ADRs with index
archcodex doc adr --all -o docs/adr/

# Generate API docs from spec
archcodex spec doc spec.product.create --type all

# Watch mode for development
archcodex doc watch --type all -o docs/

# CI verification (exit 1 if stale)
archcodex doc verify --type all -o docs/
```

See [Documentation Generation](docs/cli/documentation.md) for details.

## Pre-Commit Integration

```bash
# Husky (after linking archcodex globally with npm link)
archcodex check --staged --format compact --max-errors 0
```

> **Note:** CI integration examples assume `archcodex` is available in PATH (via `npm link` or added to project).

See [CI Integration Guide](docs/ci-integration.md) for full setup.

## Documentation

| Document                                             | Description                                             |
| ---------------------------------------------------- | ------------------------------------------------------- |
| **CLI Reference**                                    |                                                         |
| [Validation](docs/cli/validation.md)                 | check, verify, health, why                              |
| [Discovery](docs/cli/discovery.md)                   | discover, decide, resolve, diff-arch, schema, graph     |
| [Scaffolding](docs/cli/scaffolding.md)               | scaffold, action, feature, tag, infer, bootstrap, learn |
| [Analysis](docs/cli/analysis.md)                     | read, neighborhood, types, garden                       |
| [Registry](docs/cli/registry.md)                     | reindex, sync-index, migrate-registry, audit, intents   |
| [Versioning](docs/cli/versioning.md)                 | diff, migrate, simulate, watch, init, fetch, feedback   |
| [SpecCodex](docs/cli/speccodex.md)                   | spec list, resolve, generate, verify, drift, discover   |
| [Documentation](docs/cli/documentation.md)           | doc adr, watch, verify, templates                       |
| **Guides**                                           |                                                         |
| [Getting Started](docs/getting-started.md)           | Comprehensive tutorial for new and existing projects    |
| [SpecCodex Guide](docs/speccodex.md)                 | Specification by Example language                       |
| [Constraint Reference](docs/constraint-reference.md) | All constraint rules and patterns                       |
| [Configuration](docs/configuration.md)               | Config file reference                                   |
| [AI Integration](docs/ai-integration.md)             | LLM agent integration                                   |
| [Semantic Intents](docs/intents.md)                  | @intent annotations                                     |
| [CI Integration](docs/ci-integration.md)             | Pre-commit and CI setup                                 |
| [Architecture](docs/architecture.md)                 | Technical architecture                                  |
| **Other**                                            |                                                         |
| [CLAUDE.md](CLAUDE.md)                               | Instructions for working on ArchCodex itself            |

## Project Structure

```
.arch/
├── config.yaml        # Configuration
├── registry/          # Architecture definitions (multi-file)
│   ├── base.yaml
│   ├── _mixins.yaml
│   └── ...
├── specs/             # SpecCodex specs
│   ├── _base.yaml     # Base specs (spec.mutation, spec.query)
│   ├── _mixins.yaml   # Reusable spec mixins
│   └── products/
│       └── create.spec.yaml
├── templates/         # Custom doc templates
│   └── docs/
│       ├── adr.md.hbs
│       └── spec-api.md.hbs
├── index.yaml         # Discovery keywords
├── patterns.yaml      # Canonical implementations
└── concepts.yaml      # Semantic concept mappings

src/
├── domain/
│   └── payment/
│       └── Processor.ts  # @arch domain.payment.processor
└── ...
```

## Requirements

- Node.js 20+
- TypeScript/JavaScript projects (ts-morph AST parsing)
- Python and Go support (experimental, tree-sitter AST parsing)
- Java support planned

## Community & Support

- **Issues** — Report bugs or request features via [GitHub Issues](../../issues)
- **Discussions** — Ask questions and share ideas via [GitHub Discussions](../../discussions)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
