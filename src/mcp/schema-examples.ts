/**
 * @arch archcodex.cli.mcp
 * @intent:documentation-examples
 *
 * Schema examples for helping LLMs understand how to create architectures.
 * Contains complete, working examples organized by category.
 *
 * Constraint and recipe examples are in schema-examples-data.ts for file size compliance.
 */

export { CONSTRAINT_EXAMPLES, RECIPE_EXAMPLES } from './schema-examples-data.js';
import { CONSTRAINT_EXAMPLES, RECIPE_EXAMPLES } from './schema-examples-data.js';

/**
 * Architecture examples showing complete, valid YAML structures.
 */
export const ARCHITECTURE_EXAMPLES = {
  /**
   * Minimal valid architecture - just the required fields.
   */
  basic: `# Minimal Architecture Example
# Every architecture needs at least description and rationale

myproject.utils:
  description: Utility functions
  rationale: |
    Pure utility functions with no side effects.
    Use for: String manipulation, date formatting, validation helpers.
    Don't use for: Business logic, I/O operations, stateful code.
`,

  /**
   * Architecture with inheritance chain.
   */
  with_inheritance: `# Inheritance Example
# Architectures inherit constraints, hints, and mixins from parents

# Base layer (no parent)
myproject.base:
  description: Root architecture
  rationale: |
    Foundation for all architectures in this project.
    Use for: Default when no specific pattern applies.

# Domain layer (inherits from base)
myproject.domain:
  inherits: myproject.base
  description: Domain layer - business logic
  rationale: |
    Pure business rules, isolated from infrastructure.
    Use for: Entities, value objects, domain services.
    Don't use for: HTTP, database, external APIs.
  constraints:
    - rule: forbid_import
      value: [express, fastify, pg, mongodb]
      severity: error
      why: Domain must be framework-agnostic

# Specific domain pattern (inherits domain constraints)
myproject.domain.entity:
  inherits: myproject.domain
  description: Domain entity with identity
  rationale: |
    Objects with unique IDs that persist over time.
    Use for: User, Order, Product, Account.
    Don't use for: Value objects (Address, Money).
  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+\\\\.ts$"
      severity: error
      why: Entities use PascalCase
`,

  /**
   * Architecture with comprehensive constraints.
   */
  with_constraints: `# Architecture with Constraints Example
# Shows various constraint types and their options

myproject.api.handler:
  inherits: myproject.api
  description: API request handler
  rationale: |
    HTTP request handlers that validate input and delegate to services.
    Use for: REST endpoints, GraphQL resolvers.
    Don't use for: Business logic (use domain services).

  constraints:
    # Naming convention with structured alternative
    - rule: naming_pattern
      value: "^[a-z][a-zA-Z]+Handler\\\\.ts$"
      naming:
        case: camelCase
        suffix: Handler
        extension: .ts
      severity: error
      why: Handlers must be clearly identifiable
      examples: [userHandler.ts, orderHandler.ts]
      counterexamples: [User.ts, handler.ts]

    # Import restriction with alternatives
    - rule: forbid_import
      value: [pg, mongodb, mysql]
      severity: error
      why: Handlers should not access database directly
      alternative: Use repository pattern via dependency injection
      alternatives:
        - module: src/domain/repositories
          export: UserRepository
          description: Abstract repository interface

    # Conditional constraint (only applies when decorator present)
    - rule: require_import
      value: [zod]
      when:
        has_decorator: "@Validate"
      severity: warning
      why: Validated handlers should use Zod schemas

    # Pattern with unless exception
    - rule: require_pattern
      value: "Error handling"
      pattern: "try.*catch"
      severity: warning
      why: Handlers should catch and handle errors
      unless: ["@intent:middleware"]

    # File size limit
    - rule: max_file_lines
      value: 200
      exclude_comments: true
      severity: warning
      why: Handlers should be focused and delegate to services

  hints:
    - Validate input at the boundary
    - Delegate business logic to domain services
    - Return consistent error responses
`,

  /**
   * Architecture using mixins.
   */
  with_mixins: `# Architecture with Mixins Example
# Mixins are reusable traits that can be composed

myproject.domain.service:
  inherits: myproject.domain
  description: Domain service
  rationale: |
    Business logic that operates on multiple entities.
    Use for: Cross-entity operations, complex business rules.
    Don't use for: Single-entity logic (put in entity).

  # Apply reusable traits
  mixins:
    - srp          # Single Responsibility Principle
    - tested       # Requires test file
    - logged       # Logging requirements

  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Service\\\\.ts$"
      severity: error
      why: Services must end with 'Service'

  # Expected intents (warns if missing)
  expected_intents:
    - stateless    # Services should be stateless

  # Suggested intents (shown as options, no warning)
  suggested_intents:
    - name: cacheable
      when: "Service performs expensive computations"
    - name: transactional
      when: "Service modifies multiple entities atomically"
`,

  /**
   * Architecture with versioning, pointers, and advanced fields.
   */
  with_advanced_fields: `# Architecture with Advanced Fields Example
# Shows versioning, documentation, and lifecycle management

myproject.legacy.adapter:
  inherits: myproject.infra
  description: Legacy system adapter
  rationale: |
    Adapters for legacy system integration.
    Use for: Wrapping old APIs, data transformation.
    Don't use for: New integrations (use modern patterns).

  # File type classification
  kind: implementation  # implementation | organizational | definition

  # Mark as intentionally single-use
  singleton: true

  # Versioning and deprecation
  version: "2.0"
  deprecated_from: "1.5"
  migration_guide: "arch://migration/legacy-to-modern"

  # Documentation pointers
  pointers:
    - arch://docs/legacy-patterns
    - code://src/infra/adapters/README.md

  # Remove inherited constraints that don't apply
  exclude_constraints:
    - "forbid_import:axios"      # Legacy needs axios
    - "max_file_lines"           # Adapters can be longer

  constraints:
    - rule: naming_pattern
      value: "^[A-Z][a-zA-Z]+Adapter\\\\.ts$"
      severity: error
      why: Adapters must be clearly identifiable

  hints:
    - text: Wrap all legacy calls in try/catch
      example: code://src/infra/adapters/PaymentAdapter.ts#L45
    - Document data transformations clearly
`,

  /**
   * Architecture with reference implementations and code pattern.
   */
  with_code_pattern: `# Architecture with Code Pattern Example
# Shows expected file structure for LLMs

myproject.core.engine:
  inherits: myproject.core
  description: Use case orchestrator
  rationale: |
    Engines coordinate domain logic for specific use cases.
    Use for: Complex operations spanning multiple services.
    Don't use for: Simple CRUD (use service directly).

  # Code pattern shown in 'read --format ai'
  code_pattern: |
    export interface AnalyzerOptions {
      verbose?: boolean;
    }

    export interface AnalyzerResult {
      success: boolean;
      data: unknown;
    }

    export class XxxAnalyzer {
      constructor(
        private readonly projectRoot: string,
        private readonly config: Config,
      ) {}

      async analyze(options: AnalyzerOptions = {}): Promise<AnalyzerResult> {
        // Implementation
      }

      dispose(): void {
        // Clean up resources
      }
    }

  # Golden sample files
  reference_implementations:
    - src/core/health/analyzer.ts
    - src/core/validation/engine.ts

  constraints:
    - rule: require_one_of
      value: ["dispose()", "@intent:stateless"]
      severity: warning
      why: Engines must clean up resources or be stateless
      examples: ["dispose(): void { this.cache.clear(); }"]
      counterexamples: ["// no dispose method and no @intent:stateless"]

  hints:
    - text: One engine per use case
      example: code://src/core/health/analyzer.ts
    - Engines should be the entry point for CLI commands
`,
};

/**
 * Architecture template for scaffolding new architectures.
 */
export const ARCHITECTURE_TEMPLATE = `# Architecture Template
# Copy and customize for your project

# Replace 'myproject' with your project namespace
myproject.layer.component:
  # Parent architecture to inherit from (optional)
  inherits: myproject.layer

  # Short description (1 line)
  description: Component description

  # REQUIRED: When to use/not use this architecture
  rationale: |
    Detailed explanation of this architecture's purpose.
    Use for: List of appropriate use cases.
    Don't use for: List of inappropriate use cases.

  # Reusable traits to apply (optional)
  mixins: []

  # Rules to enforce (optional)
  constraints: []

  # Guidance for implementation (optional)
  hints: []

  # Files to use as examples (optional)
  reference_implementations: []

  # File naming pattern (optional)
  # file_pattern: "\${name}.ts"

  # Default output directory (optional)
  # default_path: src/path

  # Code structure template (optional, shown in --format ai)
  # code_pattern: |
  #   export class Example {}
`;

/**
 * List of available examples for the --examples flag.
 */
export const EXAMPLE_CATEGORIES = {
  architectures: {
    description: 'Complete architecture definition examples',
    items: Object.keys(ARCHITECTURE_EXAMPLES),
  },
  constraints: {
    description: 'Constraint rule usage examples',
    items: Object.keys(CONSTRAINT_EXAMPLES),
  },
  recipes: {
    description: 'Common architectural pattern recipes',
    items: Object.keys(RECIPE_EXAMPLES),
  },
};

/**
 * Get example by category and name.
 */
export function getExample(category: string, name: string): string | undefined {
  switch (category) {
    case 'architectures':
      return ARCHITECTURE_EXAMPLES[name as keyof typeof ARCHITECTURE_EXAMPLES];
    case 'constraints':
      return CONSTRAINT_EXAMPLES[name as keyof typeof CONSTRAINT_EXAMPLES];
    case 'recipes':
      return RECIPE_EXAMPLES[name as keyof typeof RECIPE_EXAMPLES];
    default:
      return undefined;
  }
}

/**
 * Rule semantics: regex behavior, matching examples, and tips for each pattern-based rule.
 */
export interface RuleSemanticsEntry {
  regexFlags: string;
  matching: string;
  matches: Array<{ input: string; pattern: string; result: boolean; note?: string }>;
  nonMatches: Array<{ input: string; pattern: string; result: boolean }>;
  tips: string[];
}

export const RULE_SEMANTICS: Record<string, RuleSemanticsEntry> = {
  forbid_pattern: {
    regexFlags: 'gms (global, multiline, dotAll)',
    matching: 'Searches entire file content. Matches anywhere in the file.',
    matches: [
      { input: 'console.log("hello")', pattern: 'console\\.log', result: true },
      { input: '// console.log disabled', pattern: 'console\\.log', result: true, note: 'Matches in comments too' },
      { input: 'x = dangerousEvaluate("code")', pattern: 'dangerousEvaluate\\(', result: true },
    ],
    nonMatches: [
      { input: 'logger.info("hello")', pattern: 'console\\.log', result: false },
      { input: 'consolelog()', pattern: 'console\\.log', result: false },
    ],
    tips: [
      'Use applies_when to limit which files are checked',
      'Use unless with @intent for exemptions',
      'Escape dots (\\.) to match literal dots',
      'Use (?:...) for non-capturing groups',
      'The dotAll flag means . matches newlines too',
    ],
  },
  require_pattern: {
    regexFlags: 'gms (global, multiline, dotAll)',
    matching: 'Searches entire file content. File must contain at least one match.',
    matches: [
      { input: 'if (isDeleted === false)', pattern: 'isDeleted.*false', result: true },
      { input: 'where: { deleted: false }', pattern: 'deleted.*false', result: true },
    ],
    nonMatches: [
      { input: 'const items = await getAll()', pattern: 'isDeleted.*false', result: false },
    ],
    tips: [
      'Pattern must exist somewhere in the file',
      'Use require_one_of for OR logic (any of multiple patterns)',
      'Use @intent annotations for alternative compliance',
    ],
  },
  naming_pattern: {
    regexFlags: 'None (full string match on basename)',
    matching: 'Tests against the filename only (not the full path). Must match the entire filename.',
    matches: [
      { input: 'PaymentProcessor.ts', pattern: '^[A-Z].*Processor\\.ts$', result: true },
      { input: 'userHandler.ts', pattern: '^[a-z].*Handler\\.ts$', result: true },
    ],
    nonMatches: [
      { input: 'paymentProcessor.ts', pattern: '^[A-Z].*Processor\\.ts$', result: false },
      { input: 'src/PaymentProcessor.ts', pattern: '^[A-Z].*Processor\\.ts$', result: false },
    ],
    tips: [
      'Pattern is tested against basename only (e.g., file.ts, not src/file.ts)',
      'Use ^ and $ anchors for full match',
      'Prefer structured naming: field for LLM-friendly validation',
      'Escape dots (\\.) to match literal file extensions',
    ],
  },
  require_one_of: {
    regexFlags: 'Varies by item type',
    matching: 'File must contain at least ONE of the specified items. Items can be: literals, @annotations, or /regex/ patterns.',
    matches: [
      { input: 'if (isDeleted)', pattern: '[isDeleted, @no-soft-delete]', result: true },
      { input: '/** @intent:no-soft-delete */', pattern: '[isDeleted, @no-soft-delete]', result: true },
    ],
    nonMatches: [
      { input: 'const items = getAll()', pattern: '[isDeleted, @no-soft-delete]', result: false },
    ],
    tips: [
      'Literals: exact substring match in content',
      '@annotations: matches @intent:name in file header',
      '/regex/: treated as regex pattern on file content',
      'Useful for "at least one of these approaches"',
    ],
  },
  forbid_call: {
    regexFlags: 'Pattern matching on call expressions',
    matching: 'Scans for function/method calls matching the patterns. Supports wildcards (*) for partial matching.',
    matches: [
      { input: 'setTimeout(fn, 100)', pattern: '[setTimeout]', result: true },
      { input: 'console.log("x")', pattern: '[console.*]', result: true },
    ],
    nonMatches: [
      { input: 'const t = "setTimeout"', pattern: '[setTimeout]', result: false },
    ],
    tips: [
      'Use * wildcard for method patterns: console.* matches console.log, console.error',
      'Only matches actual call expressions, not string literals',
      'Use unless with @intent for known legitimate callers',
    ],
  },
};

/**
 * Get rule semantics for a specific rule, if available.
 */
export function getRuleSemantics(rule: string): RuleSemanticsEntry | undefined {
  return RULE_SEMANTICS[rule];
}

/**
 * Get all examples in a category.
 */
export function getCategoryExamples(category: string): Record<string, string> {
  switch (category) {
    case 'architectures':
      return ARCHITECTURE_EXAMPLES;
    case 'constraints':
      return CONSTRAINT_EXAMPLES;
    case 'recipes':
      return RECIPE_EXAMPLES;
    default:
      return {};
  }
}
