/**
 * @arch archcodex.cli.data
 * @intent:documentation-examples
 *
 * Template literals for the init command's generated files.
 * Extracted to keep init.ts under the max_file_lines constraint.
 */

export const CONFIG_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# config.yaml - ArchCodex Project Configuration
# ═══════════════════════════════════════════════════════════════════════════════
#
# This file controls how ArchCodex validates your codebase:
# - File policies (which files require @arch tags)
# - Validation behavior (warnings, overrides, etc.)
# - Hydration settings for LLM context injection
# - LLM providers for AI-powered features (verify, learn, garden)
#
# Commands:
#   archcodex help setup       - Detailed configuration guide
#   archcodex check --help     - Validation options
#   archcodex health           - View architectural health dashboard
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

version: "1.0"

# Registry location (auto-detects .arch/registry/ directory or .arch/registry.yaml file)
# Uncomment to override: registry: .arch/registry

# File policies
files:
  untagged:
    policy: warn  # allow | warn | deny
    require_in: []
    exempt:
      - "**/*.test.ts"
      - "**/*.spec.ts"
      - "**/test/**"

# Validation settings
validation:
  fail_on_warning: false
  max_overrides_per_file: 3
  fail_on_expired_override: true

# Hydration settings (for LLM context injection)
hydration:
  format: verbose  # terse | verbose
  include_why: true
  show_inheritance: true
  max_header_tokens: 500

# Pointer base paths
pointers:
  base_paths:
    arch: .arch/docs
    code: .
    template: .arch/templates
  default_extension: .md

# Override settings
overrides:
  required_fields:
    - reason
  optional_fields:
    - expires
    - ticket
    - approved_by
  warn_no_expiry: true
  max_expiry_days: 180

# LLM settings for AI-powered features (verify, reindex, learn, garden)
# Commands:
#   archcodex verify <file>     - Behavioral hint verification
#   archcodex reindex <arch>    - Auto-generate discovery keywords
#   archcodex learn <path>      - Bootstrap architecture from codebase
#   archcodex garden            - Analyze patterns and index health
llm:
  default_provider: prompt  # prompt | openai | anthropic
  providers:
    openai:
      # base_url: https://api.openai.com/v1  # Or custom OpenAI-compatible endpoint
      model: gpt-4o-mini
      # api_key: ...  # Prefer OPENAI_API_KEY env var
      max_tokens: 1000
      temperature: 0
    anthropic:
      # base_url: https://api.anthropic.com  # Or custom endpoint
      model: claude-3-haiku-20240307
      # api_key: ...  # Prefer ANTHROPIC_API_KEY env var
      max_tokens: 1000
      temperature: 0
`;

export const BASE_REGISTRY_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# base.yaml - Architecture Definitions
# ═══════════════════════════════════════════════════════════════════════════════
#
# Define architectural patterns that enforce constraints on your codebase.
# Each architecture specifies:
# - description: What this pattern is for
# - rationale: When to use it (and when not to)
# - constraints: Rules to enforce (imports, naming, etc.)
# - hints: Behavioral guidance for code review
# - mixins: Reusable traits (srp, tested, etc.)
#
# Commands:
#   archcodex schema --examples    - Complete working examples (start here!)
#   archcodex schema --rules       - Available constraint rules
#   archcodex schema --mixins      - Available mixins
#   archcodex resolve <arch-id>    - View flattened architecture
#   archcodex discover "<query>"   - Find architecture for new files
#
# Add more architectures in separate files (e.g., domain.yaml, infra.yaml)
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

# Root architecture - all others inherit from this
base:
  description: Root architecture for the project
  rationale: |
    The foundation for all architectural patterns in this project.
    Use for: Files that don't fit a more specific pattern.
    Don't use for: Files that have clear domain/infra/app classification.
  hints:
    - Keep code clean and maintainable
    - Follow project coding standards

# Domain layer - pure business logic
domain:
  inherits: base
  description: Domain layer - pure business logic
  rationale: |
    Contains business rules and domain models, isolated from infrastructure.
    Use for: Business logic, entities, value objects, domain services.
    Don't use for: HTTP handlers, database access, external API calls.
  constraints:
    - rule: forbid_import
      value:
        - express
        - fastify
        - "@nestjs/*"
      severity: error
      why: Domain must be framework-agnostic
  hints:
    - Domain should contain only business logic
    - No framework dependencies allowed

domain.entity:
  inherits: domain
  description: Domain entity with identity
  rationale: |
    Entities have identity and lifecycle, representing core business concepts.
    Use for: Objects with unique IDs that persist over time (User, Order, Product).
    Don't use for: Value objects (Address, Money) or DTOs.
  file_pattern: "\${name}.ts"
  default_path: src/domain/entities
  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+\\\\.ts$"
      severity: error
      why: Entity files should be PascalCase

domain.service:
  inherits: domain
  description: Domain service for business operations
  rationale: |
    Services orchestrate domain logic that doesn't belong to a single entity.
    Use for: Cross-entity operations, complex business rules, use cases.
    Don't use for: Infrastructure concerns, HTTP handling.
  file_pattern: "\${name}Service.ts"
  default_path: src/domain/services
  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Service\\\\.ts$"
      severity: error
      why: Services must end with 'Service'
    - rule: max_public_methods
      value: 10
      severity: warning
      why: Services should be focused

# Infrastructure layer
infra:
  inherits: base
  description: Infrastructure layer
  rationale: |
    Technical implementations of domain interfaces and external integrations.
    Use for: Database repositories, API clients, file system access.
    Don't use for: Business logic, HTTP route handlers.

infra.repository:
  inherits: infra
  description: Repository pattern implementation
  rationale: |
    Repositories abstract data persistence, implementing domain interfaces.
    Use for: Database access, caching, external storage.
    Don't use for: Business logic, domain rules.
  file_pattern: "\${name}Repository.ts"
  default_path: src/infrastructure/repositories
  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Repository\\\\.ts$"
      severity: error
      why: Repositories must end with 'Repository'

# Application layer
app:
  inherits: base
  description: Application layer
  rationale: |
    Coordinates between domain and infrastructure, handles external requests.
    Use for: Controllers, API handlers, CLI commands.
    Don't use for: Business logic (use domain), data access (use infra).

app.controller:
  inherits: app
  description: HTTP Controller
  rationale: |
    HTTP request handlers that delegate to domain services.
    Use for: REST endpoints, GraphQL resolvers, webhook handlers.
    Don't use for: Business logic, direct database access.
  file_pattern: "\${name}Controller.ts"
  default_path: src/application/controllers
  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Controller\\\\.ts$"
      severity: error
      why: Controllers must end with 'Controller'
`;

export const MIXINS_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# _mixins.yaml - Reusable Constraint Traits
# ═══════════════════════════════════════════════════════════════════════════════
#
# Mixins are reusable bundles of constraints and hints that can be applied to
# any architecture. Use them to enforce:
# - SOLID principles (srp, dip, lsp, isp, ocp)
# - Quality traits (tested, pure, documented)
# - Project conventions
#
# Apply mixins in two ways:
# - In registry: mixins: [srp, tested]
# - Inline in files: @arch your.arch +srp +tested
#
# Commands:
#   archcodex schema --mixins      - List all available mixins
#   archcodex resolve <arch-id>    - See flattened constraints with mixins
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

# SOLID principles
srp:
  description: Single Responsibility Principle
  rationale: |
    Each class/module should have only one reason to change.
    Use for: Ensuring focused, maintainable code.
  hints:
    - Each class/module should have only one reason to change
    - If you need "and" to describe what it does, split it

dip:
  description: Dependency Inversion Principle
  rationale: |
    High-level modules should not depend on low-level modules.
    Use for: Decoupling and testability.
  hints:
    - Depend on abstractions, not concretions
    - High-level modules should not depend on low-level modules

# Quality traits
tested:
  description: Requires companion test file
  rationale: |
    Ensures code has test coverage.
    Use for: Critical business logic, public APIs.
  constraints:
    - rule: require_test_file
      value: ["*.test.ts", "*.spec.ts"]
      severity: warning
      why: This code must have tests

logging:
  description: Adds logging requirements
  rationale: |
    Ensures proper observability.
    Use for: Services, handlers, background jobs.
  hints:
    - Use structured logging with context
    - Never log sensitive data (passwords, tokens, PII)

validated:
  description: Adds input validation requirements
  rationale: |
    Ensures input validation for external data.
    Use for: API handlers, form processors.
  constraints:
    - rule: require_import
      value: [zod]
      severity: warning
      why: Use Zod for schema validation
  hints:
    - Validate all external inputs
    - Return typed errors, not exceptions
`;

export const INTENTS_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# _intents.yaml - Semantic Intent Annotations
# ═══════════════════════════════════════════════════════════════════════════════
#
# Intents declare behavioral contracts for code. Unlike overrides (temporary
# exceptions), intents document that code intentionally follows a different
# valid approach.
#
# Usage at FILE level (applies to entire file):
#   /** @intent:cli-output */      - This file produces CLI output
#
# Usage at FUNCTION level (applies to specific function):
#   /** @intent:cli-output */
#   function printReport() { ... } - Only this function has the intent
#
# Function-level intents take precedence over file-level intents.
#
# Common use cases:
#   @intent:cli-output     - This code produces CLI output
#   @intent:no-soft-delete - Legitimate hard delete
#   @intent:cached         - Results are cached
#
# Intents can:
# - Satisfy require_one_of constraints
# - Exempt code from forbid_call constraints
# - Document architectural decisions
#
# Commands:
#   archcodex intents --list       - List all defined intents
#   archcodex intents --show <n>   - Show intent details
#   archcodex intents --usage      - Show intent usage across codebase
#   archcodex intents --validate   - Validate all intent usage
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

intents:
  # Output intents
  cli-output:
    description: Produces CLI output (console.log allowed)
    category: output

  # Testing intents
  test-helper:
    description: Test utilities and fixtures
    category: testing

  # Safety intents
  no-soft-delete:
    description: Legitimate hard delete (bypasses soft-delete checks)
    category: data-access

  # Performance intents
  cached:
    description: Results are cached
    category: performance

  stateless:
    description: No side effects or state mutations
    category: performance
`;

export const ACTIONS_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# _actions.yaml - Task-Based Discovery
# ═══════════════════════════════════════════════════════════════════════════════
#
# Actions map "I want to do X" to the right architecture, intents, and checklist.
# This enables natural language discovery: "archcodex action 'add API endpoint'"
#
# Each action defines:
# - description: What this action accomplishes
# - architecture: Which architecture to use
# - intents: Suggested semantic annotations
# - checklist: Step-by-step implementation guide
# - suggested_path: Where to create the file
# - file_pattern: Naming convention
#
# Commands:
#   archcodex action list              - List all available actions
#   archcodex action show <name>       - Show action details
#   archcodex action "<query>"         - Find matching action
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

actions:
  # Example: Add a new API endpoint
  add-endpoint:
    description: Create a new REST API endpoint
    architecture: app.controller
    checklist:
      - Define route handler function
      - Add input validation
      - Implement business logic call
      - Add error handling
      - Write tests
    suggested_path: src/application/controllers
    file_pattern: "\${name}Controller.ts"

  # Example: Add a domain service
  add-service:
    description: Create a new domain service
    architecture: domain.service
    intents: [stateless]
    checklist:
      - Define service interface
      - Implement business logic
      - Add unit tests
    suggested_path: src/domain/services
    file_pattern: "\${name}Service.ts"
`;

export const FEATURES_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# _features.yaml - Multi-File Feature Scaffolding
# ═══════════════════════════════════════════════════════════════════════════════
#
# Features scaffold multiple related files together. Use for patterns that
# require coordinated changes across layers (e.g., CRUD: entity + repo + service).
#
# Each feature defines:
# - description: What this feature creates
# - components: List of files to scaffold
#   - role: Purpose (entity, repository, service, controller)
#   - architecture: Which architecture to use
#   - path: Where to create (supports \${name} placeholder)
#   - optional: Whether component is required
# - checklist: Implementation guide
#
# Commands:
#   archcodex feature list                        - List all feature templates
#   archcodex feature show <name>                 - Show feature details
#   archcodex feature <name> --name X --dry-run   - Preview what will be created
#   archcodex feature <name> --name X             - Scaffold all components
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

features:
  # Example: CRUD feature with service + repository + controller
  crud-entity:
    description: Complete CRUD feature with service, repository, and controller
    components:
      - role: entity
        architecture: domain.entity
        path: "src/domain/entities/\${name}.ts"
      - role: repository
        architecture: infra.repository
        path: "src/infrastructure/repositories/\${name}Repository.ts"
      - role: service
        architecture: domain.service
        path: "src/domain/services/\${name}Service.ts"
      - role: controller
        architecture: app.controller
        path: "src/application/controllers/\${name}Controller.ts"
        optional: true
    checklist:
      - Define entity properties and validation
      - Implement repository data access
      - Add business logic to service
      - Wire up controller routes
      - Write integration tests
`;

export const INDEX_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# index.yaml - Architecture Discovery Index
# ═══════════════════════════════════════════════════════════════════════════════
#
# This index enables keyword-based architecture discovery. When you run
# "archcodex discover 'payment service'", it searches this index for matches.
#
# ⚠️  WARNING: Do not edit this file manually!
#
# The index is generated from your registry definitions. To update:
# - archcodex sync-index           Check if index is stale
# - archcodex sync-index --force   Regenerate from registry
# - archcodex reindex <arch-id>    Update keywords for one architecture
#
# Commands:
#   archcodex discover "<query>"     - Find architecture by keywords
#   archcodex discover --auto-sync   - Discover with automatic sync
#   archcodex sync-index             - Check/regenerate this index
#   archcodex reindex <arch-id>      - Update keywords for an architecture
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

version: "1.0"

entries:
  - arch_id: domain.service
    keywords:
      - service
      - business logic
      - domain
      - use case
      - operation
    description: "Domain service for business operations"
    suggested_path: src/domain/services
    suggested_name: "{{CLASS_NAME}}.ts"
    template: service.hbs

  - arch_id: domain.entity
    keywords:
      - entity
      - model
      - domain object
      - aggregate
    description: "Domain entity with identity and lifecycle"
    suggested_path: src/domain/entities
    suggested_name: "{{CLASS_NAME}}.ts"

  - arch_id: infra.repository
    keywords:
      - repository
      - data access
      - persistence
      - database
      - storage
    description: "Repository for data persistence"
    suggested_path: src/infrastructure/repositories
    suggested_name: "{{CLASS_NAME}}.ts"

  - arch_id: app.controller
    keywords:
      - controller
      - endpoint
      - route
      - handler
      - api
    description: "HTTP controller for API endpoints"
    suggested_path: src/application/controllers
    suggested_name: "{{CLASS_NAME}}.ts"
`;

export const CONCEPTS_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# concepts.yaml - Semantic Concept Mapping for Discovery
# ═══════════════════════════════════════════════════════════════════════════════
#
# Concepts enable semantic search: "type guard" → validation architectures.
# Instead of matching keywords, concepts map natural language phrases to
# architectures, improving discovery accuracy for AI agents and developers.
#
# How it works:
# 1. Define concepts with aliases (search phrases) and target architectures
# 2. When someone searches "type guard", it matches the concept
# 3. Returns associated architectures with high confidence
#
# Example:
#   $ archcodex discover "type guard"
#   1. domain.validator (91% match)
#      ✓ Concept: validation (type guard)
#
# Populating concepts:
# - Manual: Edit this file to add domain-specific concepts
# - Auto: archcodex garden --llm --concepts (uses LLM to generate from registry)
#
# Keeping in sync:
# - archcodex sync-index validates concepts reference valid architectures
# - archcodex garden --llm --concepts regenerates from current registry
#
# Commands:
#   archcodex discover "<query>"           - Search using concepts
#   archcodex garden --llm --concepts      - Regenerate concepts from registry
#   archcodex sync-index                   - Validate concept references
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

concepts:
  # Domain logic concepts
  business_logic:
    description: "Core business rules and domain operations"
    aliases:
      - "business logic"
      - "domain logic"
      - "business rule"
      - "use case"
      - "domain service"
    architectures:
      - domain
      - domain.service

  # Entity/Model concepts
  entity:
    description: "Domain entities with identity and lifecycle"
    aliases:
      - "entity"
      - "model"
      - "domain object"
      - "aggregate"
      - "domain model"
    architectures:
      - domain.entity

  # Data access concepts
  data_access:
    description: "Data persistence and retrieval"
    aliases:
      - "repository"
      - "data access"
      - "database"
      - "persistence"
      - "storage"
      - "crud"
    architectures:
      - infra.repository

  # API concepts
  api_handler:
    description: "HTTP endpoints and API handlers"
    aliases:
      - "controller"
      - "endpoint"
      - "api"
      - "route"
      - "handler"
      - "rest"
    architectures:
      - app.controller

  # Validation concepts
  validation:
    description: "Input validation and type checking"
    aliases:
      - "validator"
      - "validation"
      - "type guard"
      - "schema"
      - "input check"
    architectures:
      - domain  # Add specific validation architecture when created
`;

export const SERVICE_TEMPLATE = `{{!-- ═══════════════════════════════════════════════════════════════════════════════
service.hbs - Scaffold Template for Domain Services
═══════════════════════════════════════════════════════════════════════════════

This Handlebars template generates new source files with proper architecture tags.
Customize this template to match your project's coding standards.

Available variables:
  {{ARCH_ID}}    - The architecture ID (e.g., domain.service)
  {{CLASS_NAME}} - The class name provided via --name flag
  {{DATE}}       - Current date

Commands:
  archcodex scaffold <arch-id> --name MyService   - Generate from this template
  archcodex scaffold <arch-id> --dry-run          - Preview output

Add more templates in .arch/templates/ and reference them in your registry
using the 'template' field.

Documentation: https://github.com/archcodex/archcodex#readme
═══════════════════════════════════════════════════════════════════════════════ --}}
/**
 * @arch {{ARCH_ID}}
 *
 * {{CLASS_NAME}}
 *
 * Created: {{DATE}}
 */

export interface I{{CLASS_NAME}} {
  // Define your service interface here
}

export class {{CLASS_NAME}} implements I{{CLASS_NAME}} {
  constructor() {
    // Inject dependencies here
  }

  // Implement your business logic methods here
}
`;

export const ARCHIGNORE_TEMPLATE = `# ═══════════════════════════════════════════════════════════════════════════════
# .archignore - Validation Exclusion Patterns
# ═══════════════════════════════════════════════════════════════════════════════
#
# Files matching these patterns are excluded from ArchCodex validation.
# Uses gitignore syntax - patterns are relative to project root.
#
# Default exclusions (always applied even without this file):
#   node_modules/, dist/, build/, coverage/, .git/, *.d.ts
#
# Common patterns:
#   **/*.test.ts       - All test files
#   src/legacy/**      - Legacy code not yet migrated
#   **/generated/**    - Auto-generated files
#   !src/critical.ts   - Negate pattern (force include)
#
# Commands:
#   archcodex check <file>             - Check a specific file
#   archcodex check                    - Check all non-ignored files
#   archcodex check --include <glob>   - Override include patterns
#
# Documentation: https://github.com/archcodex/archcodex#readme
# ═══════════════════════════════════════════════════════════════════════════════

# Dependencies
node_modules/

# Build outputs
dist/
build/
out/
.next/
.nuxt/

# Test coverage
coverage/

# TypeScript declaration files (auto-generated)
*.d.ts

# Test files (optional - remove if you want to validate tests)
**/*.test.ts
**/*.spec.ts
**/__tests__/

# Configuration files
*.config.js
*.config.ts
*.config.mjs

# Generated files
*.generated.ts
*.gen.ts

# IDE and editor files
.idea/
.vscode/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Git
.git/

# Package manager files
package-lock.json
yarn.lock
pnpm-lock.yaml

# Environment files
.env
.env.*

# Misc
*.log
tmp/
temp/
`;

export const CLAUDE_MD_TEMPLATE = `# AI Agent Instructions for This Project

This project uses **ArchCodex** for architectural enforcement. Follow these instructions when working with the codebase.

## Quick Start - Session Setup

At the start of each coding session, run:

\`\`\`bash
# Prime your context with all architectural constraints (recommended)
archcodex session-context "src/**/*.ts"

# Or for MCP users:
# archcodex_session_context with patterns: ["src/**/*.ts"]
\`\`\`

This provides a compact summary of all architectures affecting your files, reducing the need for repeated \`archcodex read\` calls.

## Architecture Quick Reference

| Architecture | Forbid | Key Hint |
|--------------|--------|----------|
| \`domain\` | express, fastify, @nestjs/* | Domain must be framework-agnostic |
| \`domain.entity\` | (inherits domain) | Entity files should be PascalCase |
| \`domain.service\` | (inherits domain) | Services must end with 'Service' |
| \`infra\` | - | Technical implementations |
| \`infra.repository\` | - | Repositories must end with 'Repository' |
| \`app.controller\` | - | Controllers must end with 'Controller' |

**Update this table** as you add more architectures to \`.arch/registry/\`.

## Workflow

### Before Creating New Files

1. **Find the right architecture**:
   \`\`\`bash
   archcodex discover "payment service"
   # Or: archcodex action "add API endpoint"
   \`\`\`

2. **Create file with @arch tag**:
   \`\`\`typescript
   /**
    * @arch domain.service
    */
   export class PaymentService { ... }
   \`\`\`

### Before Editing Files

\`\`\`bash
# Get full architectural context for a file
archcodex read src/services/payment.ts --format ai

# Check import boundaries
archcodex neighborhood src/services/payment.ts
\`\`\`

### Before Refactoring Files

\`\`\`bash
# ⚠️ IMPORTANT: Check impact before refactoring!
archcodex impact src/services/payment.ts

# Shows:
# - Direct importers (files that import this file)
# - Total dependents (transitive impact)
# - Warning if high impact (>10 files affected)
\`\`\`

### After Making Changes

\`\`\`bash
# Validate constraints
archcodex check src/services/payment.ts

# For batch validation
archcodex check "src/**/*.ts"
\`\`\`

## Key Commands

| Command | Purpose |
|---------|---------|
| \`session-context\` | Prime context at session start (reduces tool calls) |
| \`read --format ai\` | Get file constraints (before editing) |
| \`impact\` | Show what depends on a file (before refactoring) |
| \`check\` | Validate changes (after editing) |
| \`discover\` | Find architecture for new files (uses semantic concepts) |
| \`neighborhood\` | Show import boundaries |
| \`action\` | "I want to add X" → guidance |

## Semantic Discovery

ArchCodex uses **concept mapping** for smarter discovery. Search for concepts, not just keywords:

\`\`\`bash
archcodex discover "type guard"      # Finds validation architectures
archcodex discover "api client"      # Finds HTTP/infrastructure architectures
archcodex discover "business logic"  # Finds domain architectures
\`\`\`

Concepts are defined in \`.arch/concepts.yaml\`. To regenerate after registry changes:
\`\`\`bash
archcodex garden --llm --concepts    # Regenerate concepts using LLM
\`\`\`

## Getting Help

\`\`\`bash
archcodex help              # List help topics
archcodex help creating     # Detailed help on creating files
archcodex help validating   # Detailed help on validation
archcodex schema --examples # Working architecture examples
\`\`\`

---

*Generated by ArchCodex. Edit this file to add project-specific instructions.*
`;
