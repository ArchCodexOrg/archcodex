# Getting Started with ArchCodex

A comprehensive guide for using ArchCodex to enforce architectural constraints in your codebase.

---

## Table of Contents

- [Introduction](#introduction)
- [Core Concepts](#core-concepts)
- [Getting Started with a New Project](#getting-started-with-a-new-project)
- [Essential Workflows](#essential-workflows)
- [Adopting ArchCodex in an Existing Project](#adopting-archcodex-in-an-existing-project)
- [CI/CD Integration](#cicd-integration)
- [Working with AI Agents](#working-with-ai-agents)
- [Common Patterns & Examples](#common-patterns--examples)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [Next Steps](#next-steps)

---

## Introduction

### What is ArchCodex?

**ArchCodex is the Architectural Compiler for LLM Agents.** It enforces architectural constraints through context hydration - developers write minimal `@arch` tags, and LLM agents see fully hydrated headers with constraints, hints, and documentation.

```
Developer sees:    /** @arch app.domain.payment.processor */
LLM Agent sees:    Full constraints, hints, pointers, and documentation
```

### The Problem

LLM agents can write code, but they struggle to follow architectural patterns consistently. Without ArchCodex, agents don't know:
- Which modules can import which others
- What patterns are required in certain layers
- Which functions must be called before database access
- What naming conventions apply to different file types

Without guidance, agents create code that works but violates architectural boundaries, leading to technical debt.

### The Solution

ArchCodex solves this by:
- **Injecting constraints** directly into file context when agents read code
- **Validating compliance** on save, commit, and CI
- **Guiding new file creation** with discovery and scaffolding
- **Documenting exceptions** with auditable overrides

### When to Use ArchCodex

ArchCodex is valuable when:
- You're using AI coding assistants (Claude Code, Cursor, Copilot)
- You have a multi-developer team that needs consistent patterns
- You're building microservices or modular architectures
- You have compliance requirements (PCI, HIPAA, SOC2)
- You want machine-readable architectural documentation

---

## Core Concepts

Before diving in, understand these foundational concepts.

### @arch Tags

Every source file declares its architecture with an `@arch` tag:

```typescript
/**
 * @arch app.domain.payment.processor
 */
export class PaymentProcessor {
  // ...
}
```

The tag tells ArchCodex which rules apply to this file. When an AI agent reads the file, ArchCodex expands this into full constraint information.

**Naming requirement:** Architecture IDs must contain at least one dot (`.`). This prevents false matches when `@arch` appears in prose text.

| Valid | Invalid |
|-------|---------|
| `@arch domain.service` | `@arch domain` |
| `@arch api.controller` | `@arch controller` |
| `@arch util.string` | `@arch util` |

Use a hierarchical naming convention: `layer.component` or `layer.sublayer.component`.

### Architectures

Architectures are hierarchical rule definitions stored in `.arch/registry/` (multi-file directory). They specify:
- **description** - What this architecture is for
- **rationale** - When to use it (and when not to)
- **inherits** - Parent architecture (rules are inherited)
- **constraints** - Rules to enforce
- **hints** - Behavioral guidance for LLM agents

```yaml
app.domain.payment:
  description: "Payment domain - PCI compliance required"
  rationale: "Use for any code handling payment data"
  inherits: app.domain
  constraints:
    - rule: forbid_import
      value: [axios, http]
      why: "Use ApiClient for PCI-compliant logging"
  hints:
    - "Redact CVV/PAN before logging"
```

### Constraints

Constraints are rules enforced on files. ArchCodex includes 28 constraint rules:

| Rule | Description |
|------|-------------|
| `forbid_import` | Block specific imports |
| `require_import` | Require specific imports |
| `require_test_file` | Require companion test file |
| `max_file_lines` | Limit file length |
| `require_decorator` | Require class decorators |
| `require_call_before` | Require permission checks |

See [Constraint Reference](constraint-reference.md) for the full list.

### Mixins

Mixins are reusable constraint bundles that can be applied to any architecture:

```yaml
app.domain.payment.processor:
  inherits: domain.payment
  mixins: [tested, srp]  # Requires tests + single responsibility
```

Common mixins:
- `tested` - Requires companion test file
- `srp` - Single Responsibility Principle (max public methods)
- `dip` - Dependency Inversion Principle
- `pure` - Pure functions only (no side effects)

### Overrides

When a legitimate exception is needed, use an override:

```typescript
/**
 * @arch app.domain.payment.processor
 * @override forbid_import:fs
 * @reason Legacy config loading requires filesystem access
 * @expires 2026-06-01
 */
```

Overrides require:
- `@reason` - Explain why the exception is needed
- `@expires` - Expiration date (enforced)

### Intents

Intents are semantic patterns that satisfy constraints. Unlike overrides (which are exceptions), intents document intentional patterns:

```typescript
/**
 * @arch app.domain.query
 * @intent:includes-deleted
 */
export const listDeletedDocuments = query({
  // This query intentionally includes deleted records
});
```

---

## Getting Started with a New Project

Follow these steps to add ArchCodex to a new project.

### Step 1: Install

```bash
# Global installation
npm install -g archcodex

# Or as a dev dependency
npm install --save-dev archcodex
```

### Step 2: Initialize

```bash
archcodex init
```

This creates the `.arch/` directory:

```
.arch/
├── config.yaml      # Configuration
├── registry/        # Architecture definitions (multi-file)
│   ├── base.yaml
│   ├── _mixins.yaml
│   ├── _intents.yaml
│   └── ...          # Organized by layer (cli/, core/, etc.)
├── index.yaml       # Discovery keywords
└── docs/            # Documentation
```

### Step 3: Define Your First Architecture

Add architecture files to `.arch/registry/`:

```yaml
# Base architecture - for inheritance only (not used in @arch tags)
app.base:
  description: "Base constraints for all files"
  constraints:
    - rule: forbid_import
      value: [console]
      severity: warning
      why: "Use logger instead of console"

# Domain layer - for inheritance only
app.domain:
  description: "Domain/business logic"
  inherits: app.base
  mixins: [tested]
  constraints:
    - rule: max_file_lines
      value: 300
      why: "Keep domain logic focused"

# Payment processing layer - used in @arch tags
app.domain.payment:
  description: "Payment domain - PCI compliance required"
  inherits: app.domain
  constraints:
    - rule: forbid_import
      value: [axios, http]
      why: "Use ApiClient for PCI-compliant logging"
  hints:
    - "Redact CVV/PAN before logging"
```

> **Note:** All architecture IDs have dots because `@arch` tags require at least one dot to be recognized. Even parent architectures used only for inheritance should follow this pattern for consistency.

### Step 4: Create Your First File

Use `discover` to find the right architecture:

```bash
archcodex discover "payment processor"
```

Output:
```
MATCHES (ranked by relevance):
  1. app.domain.payment [0.85]
     Payment domain - PCI compliance required
     └ Use for any code handling payment data
```

Then scaffold the file:

```bash
# Preview first
archcodex scaffold app.domain.payment --name PaymentProcessor --output src/payment --dry-run

# Create the file
archcodex scaffold app.domain.payment --name PaymentProcessor --output src/payment
```

This creates `src/payment/PaymentProcessor.ts`:

```typescript
/**
 * @arch app.domain.payment
 */
export class PaymentProcessor {
  // TODO: Implement
}
```

### Step 5: Validate

Check your file for constraint violations:

```bash
archcodex check src/payment/PaymentProcessor.ts
```

If the file is missing a test, you'll see:

```
WARNINGS (1):
   require_test_file
     Missing companion test file
     Expected: PaymentProcessor.test.ts or PaymentProcessor.spec.ts
```

### Step 6: Iterate

As your project grows, add more architectures:

```yaml
# Add API controller layer
app.api.controller:
  description: "HTTP API controllers"
  inherits: app.base
  constraints:
    - rule: require_decorator
      value: ["@Controller"]
    - rule: location_pattern
      value: "src/api/"

# Add repository layer
app.infra.repository:
  description: "Data access repositories"
  inherits: app.base
  constraints:
    - rule: naming_pattern
      naming:
        suffix: Repository
        case: PascalCase
```

---

## Essential Workflows

These are the patterns you'll use daily.

### Creating New Files

```bash
# 1. Find the right architecture
archcodex discover "payment processor"

# 2. Preview the scaffolded file
archcodex scaffold app.domain.payment --name RefundProcessor --dry-run

# 3. Create the file
archcodex scaffold app.domain.payment --name RefundProcessor

# 4. Implement the file, then validate
archcodex check src/payment/RefundProcessor.ts
```

### Reading Files with Context

For AI agents, use AI-optimized output:

```bash
# Read with constraints
archcodex read src/payment/processor.ts --format ai

# Include reference implementation from patterns.yaml
archcodex read src/payment/processor.ts --format ai --with-example
```

Output:
```
ARCH: app.domain.payment.processor
Payment processors for transaction handling

MUST:
  ✓ Test file: *.test.ts
  ✓ Call before: checkPermission

NEVER:
  ✗ Import: axios, http
      → Use: src/utils/api-client.ts

HINTS:
  1. Redact CVV/PAN before logging
```

### Checking Import Boundaries

Before adding imports, check what's allowed:

```bash
# Human-readable output
archcodex neighborhood src/payment/processor.ts

# AI-optimized output
archcodex neighborhood src/payment/processor.ts --format ai
```

Output:
```
IMPORT BOUNDARIES: src/payment/processor.ts

FORBIDDEN:
  ✗ axios, http (forbid_import from app.domain.payment)
  ✗ express, fastify (forbid_import from app.domain)

ALLOWED:
  ✓ Anything not in the forbidden list
  ✓ @core/* (internal modules)

CURRENT IMPORTS:
  ✓ ../utils/logger (allowed)
  ✓ ./types (allowed)
```

### Session-Level Context for AI Agents

When starting an AI coding session, prime the agent's context with all constraints at once:

```bash
# Get deduplicated constraints across all architectures
archcodex session-context

# Include canonical implementation patterns
archcodex session-context --with-patterns
```

This reduces tool calls by ~70% compared to reading files individually.

### Planning Multi-File Changes

Before making changes across multiple files in a specific area, get scoped context:

```bash
# Get constraints for all files in a directory
archcodex plan-context src/payment/
```

To validate proposed changes before writing code:

```bash
echo '{"changes":[
  {"path":"src/payment/scorer.ts","action":"create","archId":"app.domain.payment"}
]}' | archcodex validate-plan --stdin
```

### Monitoring Architecture Health

Track adoption progress and find issues:

```bash
# Get the health dashboard
archcodex health

# See file counts per architecture
archcodex health --by-arch
```

The health report shows override debt, coverage gaps, registry quality, and layer health.

### Assessing Change Impact

Before refactoring a file, understand what depends on it:

```bash
archcodex impact src/payment/processor.ts
```

This shows direct importers, transitive dependents, and which architectures would be affected.

### Using Intents

Document intentional patterns that might otherwise look like violations:

```bash
# List all available intents
archcodex intents --list

# Show details for a specific intent
archcodex intents --show includes-deleted
```

In your code:
```typescript
/**
 * @arch app.domain.query
 * @intent:includes-deleted
 */
export const listDeletedDocuments = query({
  // This query intentionally includes deleted records
});
```

### Handling Violations

When you get a violation:

```
ERROR: forbid_import:axios
  Import 'axios' is forbidden
  Why: Use ApiClient for PCI-compliant logging
  Fix: Replace with 'src/core/api/client' (use: ApiClient)
```

**Option 1: Fix the code** (preferred)
```typescript
// Before
import axios from 'axios';

// After
import { ApiClient } from '../core/api/client';
```

**Option 2: Change architecture** (if wrong fit)
```bash
# Compare architectures
archcodex diff-arch app.domain.payment app.domain.util
```

**Option 3: Add override** (last resort)
```typescript
/**
 * @arch app.domain.payment
 * @override forbid_import:axios
 * @reason External API requires axios-specific features
 * @expires 2026-06-01
 */
```

### Explaining Constraints

Understand why a constraint applies:

```bash
archcodex why src/payment/processor.ts forbid_import:axios
```

Output:
```
CONSTRAINT: forbid_import:axios

Applies to: src/payment/processor.ts (@arch app.domain.payment.processor)

Inheritance chain:
  app.domain.payment.processor
    └ inherits: app.domain.payment
        └ constraint: forbid_import [axios, http]
          Why: Use ApiClient for PCI-compliant logging
```

---

## Adopting ArchCodex in an Existing Project

Adding ArchCodex to an existing codebase requires a gradual approach. But you don't have to define everything from scratch. In practice, registries have three layers:

| Layer | What it covers | Source |
|-------|---------------|--------|
| **Universal principles** | SOLID, separation of concerns, basic hygiene | Ships with ArchCodex via built-in mixins (`tested`, `srp`, `dip`, `pure`) |
| **Stack idioms** | Framework conventions, library patterns | Community-maintained or shared across your team's projects |
| **Your architecture** | Module boundaries, permission systems, domain rules | Defined by you, often with LLM assistance via `learn` |

Your architecture already exists — it's just scattered across tribal knowledge, code review comments, and onboarding docs nobody updates. ArchCodex gives you a place to codify it, and each rule you add prevents a class of drift going forward.

### Step 1: Install and Initialize

Same as a new project:

```bash
npm install --save-dev archcodex
archcodex init
```

### Step 2: Analyze Your Codebase (AI-Assisted)

Use `learn` *(experimental)* to let an AI analyze your codebase and generate a draft registry. The output is a starting point — review and adjust it before adopting:

```bash
# Analyze src/ directory (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
archcodex learn

# Or analyze a specific path
archcodex learn lib/

# Add hints about your codebase
archcodex learn --hints "This is a payment processing system with PCI compliance"
```

The command outputs a draft registry to `.arch/registry-draft.yaml`:

```
Analyzing: src/
Found: 175 files in 342ms
Clusters: 8

Output: .arch/registry-draft.yaml
Confidence: 85%

Next Steps:
  → Review the generated registry at .arch/registry-draft.yaml
  → Run 'archcodex simulate .arch/registry-draft.yaml' to preview impact
  → Refine constraints based on your specific requirements
```

**Don't have an API key?** Use `--dry-run` to extract the codebase structure, then paste it into an AI assistant for analysis.

### Step 3: Preview Impact

Before applying the generated registry, preview what would happen:

```bash
archcodex simulate .arch/registry-draft.yaml
```

Output:
```
SIMULATION REPORT

Registry Changes:
  ADDED: 5 architecture(s)

Impact Analysis:
  Files scanned:        175
  Would BREAK:           12 files
  Would pass:           163 files

Breaking Changes (12 files):
  ✗ src/utils/helper.ts
    New constraint: forbid_import:lodash
```

### Step 4: Start Small

Don't try to tag every file at once. Start with one module:

```yaml
# Start with just your payment domain
app.domain.payment:
  description: "Payment processing logic"
  constraints:
    - rule: forbid_import
      value: [express, fastify]
      severity: warning  # Start with warnings, not errors
```

### Step 5: Auto-Tag Files

Use `bootstrap` to automatically tag files based on detected patterns:

```bash
# Preview what would be tagged
archcodex bootstrap --dry-run

# Tag only high-confidence matches
archcodex bootstrap --min-confidence high
```

Or use `tag` for manual bulk tagging:

```bash
# Preview first
archcodex tag "src/payment/**/*.ts" --arch app.domain.payment --dry-run

# Tag all payment files
archcodex tag "src/payment/**/*.ts" --arch app.domain.payment
```

### Step 6: Configure Gradual Enforcement

Start with warnings only, then tighten over time.

In `.arch/config.yaml`:

```yaml
# Phase 1: Warn only
validation:
  precommit:
    max_errors: null    # Allow any number of errors
    max_warnings: null  # Allow any number of warnings
    include: ['src/payment/**']  # Start with one directory

# Phase 2: Fail on errors (after cleanup)
validation:
  precommit:
    max_errors: 0       # Fail on any error
    max_warnings: null  # Still allow warnings

# Phase 3: Full enforcement
validation:
  precommit:
    max_errors: 0
    max_warnings: 0
    include: ['src/**']
```

### Step 7: Monitor and Expand

Track your progress and expand coverage:

```bash
# Check architecture health and adoption progress
archcodex health --by-arch

# Validate everything
archcodex check
```

Gradually add more directories and architectures:

1. Fix violations in the current module
2. Add the next module to `include`
3. Run `archcodex check` and fix new violations
4. Repeat

---

## CI/CD Integration

### Pre-Commit Hook (Husky)

```bash
# Install husky
npm install --save-dev husky
npx husky init

# Create hook
echo 'npx archcodex check --staged --format compact --max-errors 0' > .husky/pre-commit
```

### GitHub Actions

```yaml
name: Architecture Check
on: [push, pull_request]

jobs:
  archcodex:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx archcodex check --format compact --max-errors 0
```

### lint-staged Integration

In `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "archcodex check --max-errors 0"
    ]
  }
}
```

### Exit Codes

| Scenario | Exit Code |
|----------|-----------|
| All files pass | 0 |
| Warnings but under threshold | 0 |
| Errors exceed `max_errors` | 1 |
| Warnings exceed `max_warnings` | 1 |

---

## Working with AI Agents

ArchCodex integrates with AI coding assistants.

### MCP Server for Claude Code

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "archcodex": {
      "command": "npx",
      "args": ["archcodex-mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Available MCP tools:
- `archcodex_read` - Read file with architectural context
- `archcodex_check` - Validate files
- `archcodex_discover` - Find architecture by description
- `archcodex_neighborhood` - Get import boundaries
- `archcodex_schema` - Discover available rules/mixins

### CLAUDE.md Integration

Add these instructions to your project's `CLAUDE.md`:

```markdown
# ArchCodex Instructions

This project uses ArchCodex to enforce architectural constraints.

## CRITICAL WORKFLOW

**BEFORE creating a new file:**
\`\`\`bash
archcodex discover "description of what you're building"
\`\`\`

**BEFORE reading/editing a file:**
\`\`\`bash
archcodex read path/to/file.ts --format ai
\`\`\`

**AFTER making changes:**
\`\`\`bash
archcodex check path/to/file.ts
\`\`\`

## MANDATORY: @arch Tags

Every new source file MUST have an @arch tag:
\`\`\`typescript
/** @arch <architecture-id> */
\`\`\`
```

### Pattern Registry

Define canonical implementations in `.arch/patterns.yaml`:

```yaml
patterns:
  logger:
    canonical: src/utils/logger.ts
    exports: [logger]
    usage: "Use structured logger, never console.log"
    keywords: [log, debug, error, warn]

  http_client:
    canonical: src/core/api/client.ts
    exports: [ApiClient]
    usage: "All HTTP calls must use ApiClient"
    keywords: [http, fetch, request, api, axios]
```

When violations occur, ArchCodex suggests the canonical implementation:
```
Fix: Replace with 'src/core/api/client' (use: ApiClient)
```

---

## Common Patterns & Examples

### Domain Layer

```yaml
app.domain:
  description: "Core business logic"
  rationale: "Use for business rules, validation, and domain models"
  constraints:
    - rule: forbid_import
      value: [express, fastify, http]
      why: "Domain should not depend on infrastructure"
    - rule: max_file_lines
      value: 300
  mixins: [tested, srp]
```

### API Controller Layer

```yaml
app.api.controller:
  description: "HTTP API controllers"
  rationale: "Use for request handling and response formatting"
  inherits: app.base
  constraints:
    - rule: require_decorator
      value: ["@Controller"]
    - rule: location_pattern
      value: "src/api/"
    - rule: forbid_import
      value: [pg, mysql, mongoose]
      why: "Controllers should not access database directly"
```

### Repository Layer

```yaml
app.infra.repository:
  description: "Data access repositories"
  rationale: "Use for database queries and data persistence"
  inherits: app.base
  constraints:
    - rule: naming_pattern
      naming:
        suffix: Repository
        case: PascalCase
    - rule: must_extend
      value: BaseRepository
  mixins: [tested]
```

### Utility Modules

```yaml
app.util:
  description: "Pure utility functions"
  rationale: "Use for stateless helper functions"
  constraints:
    - rule: forbid_import
      value: [fs, path, http]
      why: "Utilities should be pure and portable"
    - rule: max_file_lines
      value: 200
  mixins: [pure]
```

### Test Files

```yaml
app.test:
  description: "Test files"
  constraints:
    - rule: naming_pattern
      naming:
        suffix: .test
        extension: .ts
    - rule: require_import
      value: [vitest, jest]
      match: any  # Either vitest OR jest
```

---

## Troubleshooting & FAQ

### "I have too many violations"

Use gradual adoption:

1. Set `max_errors: null` in config
2. Start with `severity: warning` on constraints
3. Fix violations module by module
4. Tighten enforcement over time

### "I don't know which architecture to use"

Try these commands:

```bash
# Natural language search
archcodex discover "what I'm building"

# Interactive decision tree
archcodex decide

# See all architectures
archcodex schema --architectures
```

### "The constraint is too strict for my use case"

Options:

1. **Add an override** - For legitimate exceptions
   ```typescript
   /**
    * @override forbid_import:axios
    * @reason External API requires axios-specific features
    * @expires 2026-06-01
    */
   ```

2. **Use an intent** - For intentional patterns
   ```typescript
   /** @intent:admin-only */
   ```

3. **Update the architecture** - If the constraint is wrong for the use case

### "My file doesn't fit any architecture"

Create a new architecture:

1. Identify what makes this file different
2. Add to `.arch/registry/` (e.g., create a new `.yaml` file):
   ```yaml
   my.new.arch:
     description: "What this is for"
     inherits: base
     constraints:
       - rule: ...
   ```
3. Update discovery index:
   ```bash
   archcodex sync-index --force
   ```

### "Validation is slow"

ArchCodex caches validation results. For faster feedback:

```bash
# Use incremental mode (validates changed files + dependents)
archcodex check --project --incremental

# Or run in watch mode
archcodex watch
```

### "My AI agent isn't following constraints"

Ensure the agent is reading files with context:

```bash
# AI agents should use this format
archcodex read src/file.ts --format ai
```

Check that your CLAUDE.md includes ArchCodex instructions (see [Working with AI Agents](#working-with-ai-agents)).

---

## Next Steps

### Learn More

- [CLI Command Reference](cli/validation.md) - All commands with options
- [Constraint Reference](constraint-reference.md) - All constraint rules
- [AI Integration Guide](ai-integration.md) - Deep dive on AI workflows
- [CI Integration Guide](ci-integration.md) - Pre-commit and CI setup
- [Semantic Intents](intents.md) - Using @intent annotations

### Get Help

- [GitHub Issues](https://github.com/archcodex/archcodex/issues) - Report bugs
- [Discussions](https://github.com/archcodex/archcodex/discussions) - Ask questions

---

*This guide is kept in sync with the latest ArchCodex release.*
