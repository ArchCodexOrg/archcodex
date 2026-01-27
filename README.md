# ArchCodex

[![CI](https://github.com/ArchCodexOrg/archcodex/actions/workflows/ci.yml/badge.svg)](https://github.com/ArchCodexOrg/archcodex/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/archcodex.svg)](https://www.npmjs.com/package/archcodex)
[![codecov](https://codecov.io/gh/ArchCodexOrg/archcodex/branch/main/graph/badge.svg)](https://codecov.io/gh/ArchCodexOrg/archcodex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The Architectural Compiler for LLM Agents**

ArchCodex enforces architectural constraints through context hydration. Developers write minimal `@arch` tags; LLM agents see fully hydrated headers with constraints, hints, and documentation references.

```
Developer sees:    /** @arch domain.payment.processor */
LLM Agent sees:    Full constraints, hints, pointers, and documentation
```

## Why ArchCodex?

LLM agents are good at writing code that *works*. They're bad at writing code that *belongs*.

Every codebase has an implicit architecture: conventions, patterns, module boundaries, the "how we do things here" that experienced developers carry as tribal knowledge. LLMs can't read tribal knowledge. They write code that compiles and passes tests, but violates architectural boundaries — using manual permission checks instead of the centralized helper, importing across layer boundaries, reinventing utilities that already exist.

Worse, **drift compounds**. When inconsistency creeps into a codebase — multiple ways of doing the same thing, competing patterns, duplicate utilities — LLMs perform *worse*. They copy the wrong pattern because it appeared more recently in context. Each drifted commit makes the next one more likely. The codebase doesn't drift all at once; it drifts one "working" commit at a time.

ArchCodex solves this by:

- **Injecting constraints** directly into file context when agents read code
- **Validating compliance** on save, commit, and CI
- **Guiding new file creation** with discovery and scaffolding
- **Documenting exceptions** with auditable overrides

## Installation

```bash
# Install globally
npm install -g archcodex

# Or as a dev dependency
npm install --save-dev archcodex
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

| Category        | Commands                                                              | Description                     |
| --------------- | --------------------------------------------------------------------- | ------------------------------- |
| **Validation**  | `check`, `verify`, `health`, `why`, `test-pattern`                    | Validate files and check health |
| **Discovery**   | `discover`, `decide`, `resolve`, `diff-arch`, `schema`, `graph`       | Find and explore architectures  |
| **Scaffolding** | `scaffold`, `action`, `feature`, `tag`, `infer`, `bootstrap`, `learn` | Create and tag files            |
| **Analysis**    | `read`, `neighborhood`, `types`, `garden`                             | Analyze code with context       |
| **Registry**    | `reindex`, `sync-index`, `migrate-registry`, `audit`, `intents`       | Manage registry and index       |
| **Versioning**  | `diff`, `migrate`, `simulate`, `watch`, `init`, `fetch`, `feedback`   | Version control and migrations  |

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

## Pre-Commit Integration

```bash
# Husky
npm run build && archcodex check --staged --format compact --max-errors 0

# GitHub Actions
- run: npx archcodex check --format compact --max-errors 0
```

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
| **Guides**                                           |                                                         |
| [Getting Started](docs/getting-started.md)           | Comprehensive tutorial for new and existing projects    |
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
├── config.yaml      # Configuration
├── registry/        # Architecture definitions (multi-file)
│   ├── base.yaml
│   ├── _mixins.yaml
│   └── ...
├── index.yaml       # Discovery keywords
├── patterns.yaml    # Canonical implementations
└── concepts.yaml    # Semantic concept mappings

src/
├── domain/
│   └── payment/
│       └── Processor.ts  # @arch domain.payment.processor
└── ...
```

## Requirements

- Node.js 18+
- TypeScript/JavaScript projects (Python, Go, Java support planned)

## Community & Support

- **Issues** — Report bugs or request features via [GitHub Issues](../../issues)
- **Discussions** — Ask questions and share ideas via [GitHub Discussions](../../discussions)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
