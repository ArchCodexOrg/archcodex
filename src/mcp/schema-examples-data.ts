/**
 * @arch archcodex.cli.mcp
 * @intent:documentation-examples
 *
 * Constraint and recipe example data for schema documentation.
 * Split from schema-examples.ts for file size compliance.
 */

/**
 * Constraint examples showing how to use each rule type.
 */
export const CONSTRAINT_EXAMPLES = {
  naming_pattern: `# naming_pattern - File naming conventions
# Both regex and structured formats are supported

# Using regex pattern
- rule: naming_pattern
  value: "^[A-Z][a-zA-Z]+Service\\\\.ts$"
  severity: error
  why: Services must be PascalCase and end with Service
  examples: [UserService.ts, PaymentService.ts]
  counterexamples: [user-service.ts, userService.ts]

# Using structured naming (LLM-friendly)
- rule: naming_pattern
  value: "^[A-Z][a-zA-Z]+Service\\\\.ts$"
  naming:
    case: PascalCase
    suffix: Service
    extension: .ts
  severity: error
  why: Services must be PascalCase and end with Service
`,

  forbid_import: `# forbid_import - Block specific imports
# Supports glob patterns and exceptions

# Basic usage
- rule: forbid_import
  value: [fs, http, https]
  severity: error
  why: Use abstraction layer for I/O

# With alternatives (shown in error messages)
- rule: forbid_import
  value: [axios, node-fetch]
  severity: error
  why: Use internal HTTP client for consistency
  alternative: src/utils/http-client
  alternatives:
    - module: src/utils/http-client
      export: httpClient
      description: Standardized HTTP client with retry logic

# With exception using 'unless'
- rule: forbid_import
  value: ["console.*"]
  severity: warning
  why: Use logger for structured output
  unless:
    - "@intent:cli-output"     # Exception for CLI output files
    - "import:@testing/*"      # Exception if testing library imported

# With glob patterns
- rule: forbid_import
  value: ["../../../*", "@internal/*"]
  severity: error
  why: Avoid deep relative imports and internal packages
`,

  require_import: `# require_import - Require specific imports
# Supports 'all' (default) or 'any' matching

# Require all listed imports
- rule: require_import
  value: [zod]
  severity: warning
  why: Use Zod for schema validation

# Require at least one of the listed imports
- rule: require_import
  value: ["@core/logger", "winston", "pino"]
  match: any
  severity: warning
  why: Must use a supported logging library
`,

  require_pattern: `# require_pattern - Require code patterns
# Uses regex to match file content
# NOTE: 'value' is a description, 'pattern' is the actual regex

# Simple pattern
- rule: require_pattern
  value: "Function export"
  pattern: "export (async )?function"
  severity: error
  why: File must export at least one function

# With applies_when (only check files matching pattern)
- rule: require_pattern
  value: "Soft-delete check"
  pattern: "isDeleted\\\\s*[!=]==?\\\\s*false"
  applies_when: "\\\\.(find|get|list)"
  severity: warning
  why: Queries should check soft-delete flag
  unless: ["@intent:no-soft-delete"]
`,

  forbid_pattern: `# forbid_pattern - Block code patterns
# Uses regex to detect forbidden patterns
# NOTE: 'value' IS the regex (unlike require_pattern where 'pattern' is the regex)

# Block console.log (value is the regex)
- rule: forbid_pattern
  value: "console\\\\.(log|debug|info)"
  severity: warning
  why: Use structured logger instead
  alternative: logger from src/utils/logger.ts
  unless: ["@intent:cli-output"]

# Block explicit any
- rule: forbid_pattern
  value: ":\\\\s*any\\\\b"
  severity: error
  why: Avoid untyped code
  counterexamples: ["const x: any = 5", "function foo(): any"]
  codeExample: |
    // Instead of: const data: any = fetchData()
    // Use: const data: unknown = fetchData()
`,

  require_coverage: `# require_coverage - Cross-file validation
# Ensures coverage across multiple files (requires --project flag)

# Event handler coverage
- rule: require_coverage
  value:
    source_type: string_literals
    source_pattern: "EventType\\\\."
    extract_values: "EventType\\\\.(\\\\w+)"
    in_files: "src/events/types.ts"
    target_pattern: "handle\${PascalCase}"
    transform: "\${PascalCase}"
    in_target_files: "src/handlers/**/*.ts"
  severity: error
  why: Every event type must have a handler
`,

  require_companion_call: `# require_companion_call - Require paired method calls
# Ensures certain method calls are accompanied by others

# Cache operations must be followed by save
- rule: require_companion_call
  value:
    target: cacheManager
    operations: [set, delete, clear]
    call: save
    location: same_file
  severity: warning
  why: Cache changes must be persisted

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
  why: Database operations must be committed
`,

  require_companion_file: `# require_companion_file - Require sibling files
# Ensures companion files exist (barrels, tests, styles, stories)

# Simple path - require barrel file
- rule: require_companion_file
  value: "./index.ts"
  severity: warning
  why: All modules need barrel exports

# Variable substitution - require test file
- rule: require_companion_file
  value: "\${name}.test.ts"
  severity: warning
  why: All files need tests

# Object with must_export - verify barrel exports this file
- rule: require_companion_file
  value:
    path: "./index.ts"
    must_export: true
  severity: warning
  why: Barrel must re-export this module

# Multiple companions (array format)
- rule: require_companion_file
  value:
    - "./index.ts"
    - "\${name}.test.tsx"
    - "\${name}.stories.tsx"
  severity: warning
  why: Components need barrel, tests, and stories

# Variables: \${name}, \${name:kebab}, \${ext}, \${dir}
# Skipped for: index.ts, *.test.ts, *.stories.tsx
`,

  conditional_constraints: `# Conditional Constraints
# Apply constraints only when certain conditions are met

# Using 'when' clause
- rule: require_import
  value: [express]
  when:
    has_decorator: "@Controller"
  severity: error
  why: Controllers need Express for routing

# Using 'applies_when' (regex on file content)
- rule: require_pattern
  value: "Input validation"
  pattern: "validateInput\\\\("
  applies_when: "@Post|@Put|@Patch"
  severity: warning
  why: Mutating endpoints should validate input

# Using 'unless' for exceptions
- rule: forbid_import
  value: [moment]
  severity: warning
  why: Use date-fns for smaller bundle
  unless:
    - "@intent:legacy-dates"
    - "import:legacy-utils"
`,

  // Additional constraint examples for completeness
  must_extend: `# must_extend - Require class inheritance
# Ensures classes extend a specific parent

- rule: must_extend
  value: BaseProcessor
  severity: error
  why: All processors must extend BaseProcessor for lifecycle management
`,

  allow_import: `# allow_import - Override parent's forbid_import
# Use to make exceptions to inherited import restrictions

- rule: allow_import
  value: [axios]
  severity: error
  why: This layer is allowed to use axios despite parent forbidding it
`,

  require_decorator: `# require_decorator - Require class decorators
# Ensures classes have specific decorators

- rule: require_decorator
  value: "@Injectable"
  severity: error
  why: Services must be injectable for DI container

- rule: require_decorator
  value: "@Traceable"
  severity: warning
  why: Enable distributed tracing for observability
`,

  forbid_decorator: `# forbid_decorator - Block specific decorators

- rule: forbid_decorator
  value: "@Deprecated"
  severity: warning
  why: Deprecated code should be migrated

- rule: forbid_decorator
  value: "@SkipAuth"
  severity: error
  why: All endpoints must be authenticated
`,

  location_pattern: `# location_pattern - Enforce file location
# File must be in specific directory path

- rule: location_pattern
  value: "src/domain/"
  severity: error
  why: Domain logic must be in domain directory

- rule: location_pattern
  value: "src/api/controllers/"
  severity: warning
  why: Controllers should be in controllers directory
`,

  forbid_call: `# forbid_call - Block specific function calls
# Supports wildcards with *

- rule: forbid_call
  value: [setTimeout, setInterval]
  severity: warning
  why: Use scheduler service for time-based operations

- rule: forbid_call
  value: ["console.*", "process.exit"]
  severity: error
  why: Use logger and proper error handling
`,

  require_try_catch: `# require_try_catch - Require error handling
# Ensures specific calls are wrapped in try/catch

- rule: require_try_catch
  value: "External API calls"
  around: [fetch, "api.*", "http.*"]
  severity: error
  why: External calls must have error handling

- rule: require_try_catch
  value: "Database operations"
  around: ["db.*", "repository.*"]
  severity: warning
  why: Database calls should handle connection errors
`,

  forbid_mutation: `# forbid_mutation - Block mutation of globals
# Prevents modification of global state

- rule: forbid_mutation
  value: [process.env, window, globalThis]
  severity: error
  why: Global mutation causes unpredictable behavior

- rule: forbid_mutation
  value: ["Date.prototype", "Array.prototype"]
  severity: error
  why: Never modify built-in prototypes
`,

  require_call: `# require_call - Require specific function calls
# Ensures certain functions are called in the file

- rule: require_call
  value: [validateInput]
  severity: warning
  why: Input must be validated

- rule: require_call
  value: ["sanitize*", "escape*"]
  severity: error
  why: User input must be sanitized
`,

  allow_pattern: `# allow_pattern - Override parent's forbid_pattern
# Use to make exceptions to inherited pattern restrictions

- rule: allow_pattern
  value: "console\\\\.log"
  severity: error
  why: CLI output files are allowed to use console.log
`,

  require_export: `# require_export - Require specific exports
# Ensures file exports certain symbols

- rule: require_export
  value: ["*Provider", "*Module"]
  severity: warning
  why: Module files must export a provider or module

- rule: require_export
  value: [default]
  severity: error
  why: Components must have a default export
`,

  require_call_before: `# require_call_before - Require call ordering
# Ensures certain calls happen before others

- rule: require_call_before
  value: "Auth before DB"
  before: ["ctx.db.*", "repository.*"]
  severity: error
  why: Authentication must be checked before database access
  codeExample: |
    ctx.auth.verify();  // Must come before
    ctx.db.query();     // This call
`,

  max_similarity: `# max_similarity - DRY detection
# Flags files that are too similar (requires --project flag)

- rule: max_similarity
  value: 0.8
  severity: warning
  why: Files over 80% similar should be refactored

- rule: max_similarity
  value: 0.95
  severity: error
  why: Near-duplicate files must be consolidated
`,

  importable_by: `# importable_by - Restrict importers
# Controls which architectures can import this file (requires --project)

- rule: importable_by
  value: ["domain.payment.*", "test.**"]
  severity: error
  why: Payment internals only accessible to payment domain and tests

- rule: importable_by
  value: ["*.service", "*.controller"]
  severity: warning
  why: Repositories should only be used by services and controllers
`,

  forbid_circular_deps: `# forbid_circular_deps - Prevent circular imports
# Detects circular dependency chains (requires --project flag)

- rule: forbid_circular_deps
  value: true
  severity: error
  why: Circular dependencies cause initialization issues
`,

  all_conditions: `# All 'when' Conditions
# Comprehensive list of all conditional constraint options

# has_decorator - Class has specific decorator
- rule: require_import
  value: [inversify]
  when:
    has_decorator: "@injectable"
  why: Injectable classes need DI container

# has_import - File imports specific module (wildcards supported)
- rule: forbid_call
  value: [fetch]
  when:
    has_import: "axios"
  why: Use axios instead of fetch when axios is available

# extends - Class extends specific base class
- rule: require_call
  value: [super.init]
  when:
    extends: BaseComponent
  why: Components must call parent init

# file_matches - File path matches glob pattern
- rule: max_file_lines
  value: 100
  when:
    file_matches: "*.util.ts"
  why: Utility files should be small

# implements - Class implements specific interface
- rule: require_decorator
  value: "@Traceable"
  when:
    implements: IService
  why: Services must be traceable

# method_has_decorator - Method/function has decorator
- rule: require_pattern
  value: "Validation schema"
  pattern: "schema\\\\.parse"
  when:
    method_has_decorator: "@Validate"
  why: Validated methods must use schema

# Negative conditions (NOT variants)

# not_has_decorator - Class does NOT have decorator
- rule: forbid_import
  value: ["@internal/*"]
  when:
    not_has_decorator: "@Internal"
  why: Only internal classes can use internal packages

# not_has_import - File does NOT import module
- rule: require_import
  value: [zod]
  when:
    not_has_import: "class-validator"
  why: Use Zod unless using class-validator

# not_extends - Class does NOT extend
- rule: require_decorator
  value: "@Component"
  when:
    not_extends: BaseComponent
  why: Non-extending classes need explicit decorator

# not_file_matches - File path does NOT match
- rule: require_test_file
  value: ["*.test.ts"]
  when:
    not_file_matches: "**/generated/**"
  why: Non-generated files need tests

# not_implements - Class does NOT implement
- rule: max_public_methods
  value: 5
  when:
    not_implements: IFacade
  why: Non-facade classes should be focused

# not_method_has_decorator - No method has decorator
- rule: forbid_pattern
  value: "await"
  when:
    not_method_has_decorator: "@Async"
  why: Async code needs @Async decorator
`,
};

/**
 * Recipe examples showing common architectural patterns.
 */
export const RECIPE_EXAMPLES = {
  'domain-service': `# Recipe: Domain Service
# Business logic service following DDD principles

myproject.domain.service:
  inherits: myproject.domain
  description: Domain service for business operations
  rationale: |
    Services orchestrate business logic that doesn't belong to a single entity.
    Use for: Cross-entity operations, complex business rules, use cases.
    Don't use for: Infrastructure concerns, HTTP handling, data access.

  mixins: [srp, tested]

  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Service\\\\.ts$"
      naming:
        case: PascalCase
        suffix: Service
        extension: .ts
      severity: error
      why: Services must be clearly identifiable

    - rule: forbid_import
      value: [express, fastify, pg, mongodb, "@nestjs/*"]
      severity: error
      why: Domain services must be framework-agnostic
      alternative: Inject dependencies via constructor

    - rule: max_public_methods
      value: 7
      severity: warning
      why: Services should be focused (SRP)

  expected_intents: [stateless]

  hints:
    - Keep services pure - no side effects where possible
    - Inject repositories and external services via constructor
    - One service per bounded context or aggregate

  file_pattern: "\${name}Service.ts"
  default_path: src/domain/services

  code_pattern: |
    export interface I\${Name}Service {
      execute(input: Input): Promise<Output>;
    }

    export class \${Name}Service implements I\${Name}Service {
      constructor(
        private readonly repository: IRepository,
        private readonly logger: ILogger,
      ) {}

      async execute(input: Input): Promise<Output> {
        // Business logic here
      }
    }
`,

  'repository': `# Recipe: Repository Pattern
# Data access layer following repository pattern

myproject.infra.repository:
  inherits: myproject.infra
  description: Repository for data persistence
  rationale: |
    Repositories abstract data access, implementing domain interfaces.
    Use for: Database operations, caching, external storage.
    Don't use for: Business logic, domain rules, HTTP handling.

  mixins: [tested]

  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Repository\\\\.ts$"
      naming:
        case: PascalCase
        suffix: Repository
        extension: .ts
      severity: error
      why: Repositories must be clearly identifiable

    - rule: implements
      value: "I[A-Z][a-zA-Z]+Repository"
      severity: warning
      why: Repositories should implement domain interface

    - rule: forbid_import
      value: [express, fastify, "@nestjs/common"]
      severity: error
      why: Repositories should not depend on web frameworks

  hints:
    - Implement domain interface defined in domain layer
    - Handle connection errors gracefully
    - Use transactions for multi-operation changes

  file_pattern: "\${name}Repository.ts"
  default_path: src/infrastructure/repositories

  code_pattern: |
    import type { I\${Name}Repository } from '../../domain/repositories/I\${Name}Repository';

    export class \${Name}Repository implements I\${Name}Repository {
      constructor(private readonly db: Database) {}

      async findById(id: string): Promise<Entity | null> {
        // Implementation
      }

      async save(entity: Entity): Promise<void> {
        // Implementation
      }
    }
`,

  'controller': `# Recipe: HTTP Controller
# API endpoint handler following thin controller pattern

myproject.api.controller:
  inherits: myproject.api
  description: HTTP controller for API endpoints
  rationale: |
    Controllers handle HTTP requests and delegate to domain services.
    Use for: REST endpoints, input validation, response formatting.
    Don't use for: Business logic, data access, complex processing.

  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Controller\\\\.ts$"
      naming:
        case: PascalCase
        suffix: Controller
        extension: .ts
      severity: error
      why: Controllers must be clearly identifiable

    - rule: forbid_import
      value: [pg, mongodb, mysql, redis]
      severity: error
      why: Controllers should not access databases directly
      alternative: Use repository via service injection

    - rule: max_file_lines
      value: 150
      exclude_comments: true
      severity: warning
      why: Controllers should be thin - delegate to services

    - rule: require_import
      value: [zod]
      when:
        has_decorator: "@Post"
      severity: warning
      why: POST endpoints should validate input

  expected_intents: [cli-output]

  hints:
    - Keep controllers thin - validate, delegate, respond
    - Use DTOs for request/response shaping
    - Handle errors at controller boundary

  file_pattern: "\${name}Controller.ts"
  default_path: src/api/controllers

  code_pattern: |
    import { Controller, Get, Post } from '@framework';
    import type { \${Name}Service } from '../../domain/services/\${Name}Service';

    @Controller('/\${kebab-name}')
    export class \${Name}Controller {
      constructor(private readonly service: \${Name}Service) {}

      @Get('/:id')
      async getById(id: string) {
        return this.service.findById(id);
      }

      @Post('/')
      async create(body: CreateDto) {
        return this.service.create(body);
      }
    }
`,

  'mixin-creation': `# Recipe: Creating Mixins
# Reusable traits that can be composed into architectures

# Define mixins in _mixins.yaml (or with _mixins: prefix in registry)

# Simple hint-only mixin
srp:
  description: Single Responsibility Principle
  rationale: |
    Ensures classes and modules have one reason to change.
    Use for: Any code where focus is important.
  hints:
    - Each class should have only one reason to change
    - If you need "and" to describe what it does, split it

# Mixin with constraints
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
  # inline: allowed (default) - can use +tested or mixins: [tested]

# Mixin that must be used inline only
quick-fix:
  description: Temporary workaround marker
  rationale: |
    Marks code as temporary that needs refactoring.
    Use inline (+quick-fix) to mark specific files.
  inline: only  # MUST use +quick-fix, not mixins: [quick-fix]
  hints:
    - Add TODO with ticket number
    - Set reminder to revisit

# Mixin forbidden from inline use
core-tested:
  description: Core module testing requirements
  rationale: |
    Strict testing for core modules.
    Applied via architecture inheritance, not inline.
  inline: forbidden  # MUST NOT use +core-tested
  constraints:
    - rule: require_test_file
      value: ["*.test.ts"]
      severity: error
      why: Core modules require test coverage
`,

  'cli-command': `# Recipe: CLI Command Handler
# Command-line interface command following ArchCodex patterns

myproject.cli.command:
  inherits: myproject.cli
  description: CLI command handler
  rationale: |
    Commands parse options, call engines, and format output.
    Use for: Individual CLI commands (check, read, build, etc.).
    Don't use for: Business logic (use engines), formatting (use formatters).

  constraints:
    - rule: require_import
      value: [commander]
      severity: warning
      why: Commands use Commander.js for CLI structure

    - rule: forbid_import
      value: [ts-morph, fast-glob]
      severity: error
      why: Commands should use core engines, not infrastructure directly
      alternative: src/core

    - rule: max_file_lines
      value: 300
      exclude_comments: true
      severity: warning
      why: Commands should be thin orchestrators

    - rule: naming_pattern
      value: "^[a-z][a-z-]+\\\\.ts$"
      severity: warning
      why: Command files use kebab-case

  expected_intents: [cli-output]

  hints:
    - Parse options, call engine, format output - nothing more
    - Use logger.error/warn for errors
    - Load config and registry at start

  file_pattern: "\${name}.ts"
  default_path: src/cli/commands

  code_pattern: |
    import { Command } from 'commander';
    import { loadConfig } from '../../core/config/loader.js';
    import { loadRegistry } from '../../core/registry/loader.js';

    interface CommandOptions {
      config?: string;
      format?: 'human' | 'json';
    }

    export function create\${PascalName}Command(): Command {
      return new Command('\${name}')
        .description('Description of command')
        .argument('[file]', 'File to process')
        .option('-c, --config <path>', 'Path to config')
        .option('-f, --format <format>', 'Output format', 'human')
        .action(async (file: string, options: CommandOptions) => {
          const projectRoot = process.cwd();
          const config = await loadConfig(projectRoot, options.config);
          const registry = await loadRegistry(projectRoot);
          // Call engine, format output
        });
    }
`,

  'conditional-constraints': `# Recipe: Conditional Constraints
# Apply constraints based on file content or structure

myproject.api.validated:
  inherits: myproject.api
  description: Validated API endpoint
  rationale: |
    API endpoints with strict validation requirements.
    Use for: Public APIs, user input handling.

  constraints:
    # Only applies when @Validate decorator is present
    - rule: require_import
      value: [zod, "@core/validation"]
      match: any
      when:
        has_decorator: "@Validate"
      severity: error
      why: Validated endpoints need validation library

    # Only applies to files containing POST/PUT/PATCH
    # NOTE: require_pattern needs both 'value' (description) and 'pattern' (regex)
    - rule: require_pattern
      value: "Schema validation call"
      pattern: "schema\\\\.parse\\\\("
      applies_when: "@(Post|Put|Patch)"
      severity: warning
      why: Mutating endpoints should validate input

    # Skip this constraint for certain conditions
    # NOTE: forbid_pattern uses 'value' directly as the regex
    - rule: forbid_pattern
      value: "any\\\\b"
      severity: error
      why: Avoid untyped code
      unless:
        - "@intent:legacy-migration"
        - "import:@generated/*"
        - "decorator:@Generated"

    # Applies to GET endpoints only
    - rule: require_pattern
      value: "Cache consideration"
      pattern: "cache"
      when:
        method_has_decorator: "@Get"
      severity: warning
      why: GET endpoints should consider caching
`,
};
