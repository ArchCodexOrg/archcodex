/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Schema documentation for SpecCodex.
 * Provides schema information for LLMs to understand spec structure.
 *
 * Based on spec.speccodex.schema:
 * - List all available spec fields with descriptions
 * - Show input field types and their options
 * - Show example structures
 * - List available @ placeholders
 * - List effect types
 */
import { listPlaceholders } from './placeholders.js';

/**
 * Filter options for schema documentation.
 */
export type SchemaFilter = 'all' | 'fields' | 'inputs' | 'examples' | 'placeholders' | 'effects' | 'base-specs' | 'ui' | 'fixtures';

/**
 * Options for getting schema documentation.
 */
export interface SchemaDocsOptions {
  filter?: SchemaFilter;
  examples?: boolean;
}

/**
 * Result of schema documentation request.
 */
export interface SchemaDocsResult {
  sections: string[];
  fields?: FieldDoc[];
  inputTypes?: InputTypeDoc[];
  exampleStructure?: ExampleStructureDoc;
  placeholders?: PlaceholderDoc[];
  effects?: EffectDoc[];
  baseSpecs?: BaseSpecDoc[];
  uiFields?: UIFieldDoc[];
  fixtures?: FixtureDoc[];
  yamlExamples?: string;
}

interface FieldDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
  section: string;
}

interface InputTypeDoc {
  type: string;
  description: string;
  options?: string[];
  example: string;
}

interface ExampleStructureDoc {
  categories: string[];
  structure: Record<string, string>;
}

interface PlaceholderDoc {
  placeholder: string;
  description: string;
  example: string;
}

interface EffectDoc {
  type: string;
  description: string;
  fields: string[];
  example: string;
}

interface BaseSpecDoc {
  specId: string;
  description: string;
  inheritsFrom?: string;
}

interface UIFieldDoc {
  section: string;
  field: string;
  type: string;
  description: string;
  example?: string;
}

interface FixtureDoc {
  name: string;
  description: string;
  mode: 'generate' | 'documentation';
  builtIn: boolean;
}

/**
 * Spec field documentation.
 */
const SPEC_FIELDS: FieldDoc[] = [
  // Metadata
  { name: 'version', type: 'string', required: false, description: 'Spec version (semver)', section: 'metadata' },
  { name: 'inherits', type: 'string', required: false, description: 'Parent spec to inherit from (e.g., spec.mutation)', section: 'metadata' },
  { name: 'mixins', type: 'array', required: false, description: 'Reusable fragments to compose (e.g., [requires_auth, logs_audit])', section: 'metadata' },
  { name: 'architectures', type: 'array', required: false, description: 'ArchCodex architectures for implementation (e.g., [convex.mutation])', section: 'metadata' },
  { name: 'implementation', type: 'string', required: false, description: 'Path to implementation file (for verification)', section: 'metadata' },

  // Strategic
  { name: 'goal', type: 'string', required: false, description: 'High-level purpose (the "why")', section: 'strategic' },
  { name: 'outcomes', type: 'array', required: false, description: 'Expected outcomes/acceptance criteria', section: 'strategic' },

  // Operational
  { name: 'intent', type: 'string', required: true, description: 'One-line description of what the function does', section: 'operational' },
  { name: 'description', type: 'string', required: false, description: 'Detailed explanation', section: 'operational' },
  { name: 'inputs', type: 'object', required: false, description: 'Input parameters with type/validation info', section: 'operational' },
  { name: 'outputs', type: 'object', required: false, description: 'Expected return type shape (for verification and test generation)', section: 'operational' },

  // Security
  { name: 'security', type: 'object', required: false, description: 'Security requirements (authentication, rate_limit, permissions)', section: 'security' },

  // Constraints
  { name: 'invariants', type: 'array', required: false, description: 'Properties that must always be true (for property tests). Use DSL syntax: { condition: "expr" } or { "path.to.field": "@assertion" }', section: 'constraints' },

  // Examples
  { name: 'examples', type: 'object', required: false, description: 'Concrete test cases (success, errors, warnings, boundaries)', section: 'examples' },
  { name: 'defaults', type: 'object', required: false, description: 'YAML anchors for reuse in examples', section: 'examples' },

  // Effects
  { name: 'effects', type: 'array', required: false, description: 'Side effects to verify (for integration tests)', section: 'effects' },

  // UI (for interaction specs)
  { name: 'ui', type: 'object', required: false, description: 'UI interaction spec (trigger, interaction, feedback, accessibility)', section: 'ui' },
];

/**
 * Input/Output type documentation.
 * These types are symmetric - all types work for both inputs and outputs.
 */
const INPUT_TYPES: InputTypeDoc[] = [
  { type: 'string', description: 'Text value', options: ['required', 'max', 'min', 'pattern', 'validate'], example: '{ type: string, max: 200, validate: url }' },
  { type: 'number', description: 'Numeric value', options: ['required', 'min', 'max'], example: '{ type: number, min: 0, max: 1000 }' },
  { type: 'boolean', description: 'True/false value', options: ['required', 'default'], example: '{ type: boolean, default: false }' },
  { type: 'enum', description: 'One of predefined values (inputs and outputs)', options: ['required', 'values', 'default'], example: '{ type: enum, values: [draft, published, archived] }' },
  { type: 'id', description: 'Database ID reference', options: ['required', 'table'], example: '{ type: id, table: projects }' },
  { type: 'object', description: 'Nested object', options: ['required', 'properties'], example: '{ type: object, properties: { name: { type: string } } }' },
  { type: 'array', description: 'List of values', options: ['required', 'items'], example: '{ type: array, items: { type: string } }' },
  { type: 'void', description: 'No return value (outputs only)', options: [], example: '{ type: void }' },
];

/**
 * Example structure documentation.
 */
const EXAMPLE_STRUCTURE: ExampleStructureDoc = {
  categories: ['success', 'errors', 'warnings', 'boundaries'],
  structure: {
    success: 'Tests for valid inputs → expected outputs',
    errors: 'Tests for invalid inputs → expected error codes',
    warnings: 'Tests for edge cases → warnings but still succeeds',
    boundaries: 'Edge case tests (min/max values) → for both unit and property tests',
  },
};

/**
 * Effect type documentation.
 */
const EFFECT_TYPES: EffectDoc[] = [
  { type: 'audit_log', description: 'Creates audit log entry', fields: ['action', 'resourceType'], example: '{ audit_log: { action: "product.create", resourceType: "product" } }' },
  { type: 'database', description: 'Modifies database state', fields: ['table', 'operation'], example: '{ database: { table: "products", operation: "insert" } }' },
  { type: 'embedding', description: 'Generates vector embedding', fields: ['timing'], example: '{ embedding: "generated_async" }' },
  { type: 'cache', description: 'Modifies cache state', fields: ['invalidated', 'updated'], example: '{ cache: { invalidated: "user_products" } }' },
  { type: 'notification', description: 'Sends notification', fields: ['type', 'channel'], example: '{ notification: { type: "product_created", channel: "email" } }' },
  { type: 'scheduler', description: 'Schedules async job', fields: ['job', 'delay'], example: '{ scheduler: { job: "processProduct", delay: "5s" } }' },
];

/**
 * UI section field documentation.
 */
const UI_FIELDS: UIFieldDoc[] = [
  // Trigger
  { section: 'trigger', field: 'location', type: 'string', description: 'Where the action is triggered (context menu, toolbar, button)', example: '"context menu"' },
  { section: 'trigger', field: 'label', type: 'string', description: 'Button or menu item text', example: '"Duplicate"' },
  { section: 'trigger', field: 'icon', type: 'string', description: 'Icon name', example: '"copy"' },
  { section: 'trigger', field: 'shortcut', type: 'string', description: 'Keyboard shortcut', example: '"Cmd+D"' },
  { section: 'trigger', field: 'element', type: 'string', description: 'CSS selector for trigger element (used in generated tests)', example: '"[data-action=duplicate]"' },
  { section: 'trigger', field: 'action', type: 'enum', description: 'Trigger action type', example: 'click | hover | keypress | submit | drag' },

  // Interaction
  { section: 'interaction', field: 'flow', type: 'array', description: 'Step-by-step interaction flow', example: '["Click button", "Dialog appears"]' },
  { section: 'interaction', field: 'optimistic', type: 'boolean', description: 'Shows result before server confirms', example: 'true' },
  { section: 'interaction', field: 'loading', type: 'string', description: 'Loading indicator style', example: '"Inline spinner"' },
  { section: 'interaction', field: 'states', type: 'object', description: 'State conditions and their UI effects', example: '{ editing: { when: "isEditing", then: { showInput: true } } }' },
  { section: 'interaction', field: 'sequence', type: 'array', description: 'Sequence of trigger/wait/then steps', example: '[{ trigger: {...}, wait: "300ms", then: {...} }]' },

  // Accessibility
  { section: 'accessibility', field: 'role', type: 'string', description: 'ARIA role', example: '"menuitem" | "dialog" | "combobox" | "grid"' },
  { section: 'accessibility', field: 'label', type: 'string', description: 'Accessible label', example: '"Duplicate entry"' },
  { section: 'accessibility', field: 'keyboardNav', type: 'array', description: 'Keyboard navigation mappings', example: '[{ key: "Enter", action: "activate" }]' },
  { section: 'accessibility', field: 'focusTrap', type: 'boolean', description: 'Keep focus inside component (for modals)', example: 'true' },
  { section: 'accessibility', field: 'announcements', type: 'array', description: 'Screen reader announcements', example: '[{ when: "saved", message: "Changes saved", priority: "polite" }]' },

  // Feedback
  { section: 'feedback', field: 'success', type: 'string', description: 'Success message shown to user', example: '"Entry duplicated"' },
  { section: 'feedback', field: 'error', type: 'string', description: 'Error message shown to user', example: '"Failed to duplicate"' },
  { section: 'feedback', field: 'loading', type: 'object', description: 'Loading feedback config', example: '{ indicator: "spinner", ariaLive: "polite" }' },
];

/**
 * Fixture documentation.
 */
const FIXTURE_DOCS: FixtureDoc[] = [
  { name: 'authenticated', description: 'Valid user with read/write permissions', mode: 'generate', builtIn: true },
  { name: 'no_access', description: 'User without permissions', mode: 'generate', builtIn: true },
  { name: 'admin_user', description: 'Admin user with all permissions', mode: 'generate', builtIn: true },
];

/**
 * Base spec documentation.
 */
const BASE_SPECS: BaseSpecDoc[] = [
  { specId: 'spec.base', description: 'Root spec - all specs inherit from this' },
  { specId: 'spec.function', description: 'Generic function spec', inheritsFrom: 'spec.base' },
  { specId: 'spec.mutation', description: 'Authenticated write operation (requires auth)', inheritsFrom: 'spec.base' },
  { specId: 'spec.query', description: 'Authenticated read operation', inheritsFrom: 'spec.base' },
  { specId: 'spec.action', description: 'External API/AI call (rate limited)', inheritsFrom: 'spec.base' },
  { specId: 'spec.component', description: 'UI component spec', inheritsFrom: 'spec.base' },
  { specId: 'spec.hook', description: 'React hook spec', inheritsFrom: 'spec.base' },
];

/**
 * Schema compliance guidance to prevent LLM drift.
 * This is critical - LLMs tend to invent fields when existing constructs suffice.
 */
const SCHEMA_COMPLIANCE_GUIDANCE = `
=== SCHEMA COMPLIANCE (READ FIRST) ===

SpecCodex has a FIXED schema. Do NOT invent new top-level fields.

ALLOWED FIELDS:
  Metadata: version, inherits, mixins, architectures, implementation
  Strategic: goal, outcomes
  Operational: intent, description, inputs, outputs
  Security: security
  Constraints: invariants
  Examples: defaults, examples
  Effects: effects
  UI: ui (for UI interaction specs)

COMMON MISTAKES - DO NOT DO THESE:

  ❌ WRONG: metadata: { copied_fields: [...], reset_fields: [...] }
  ✓ RIGHT: invariants:
             - { condition: "result.title.startsWith('Copy of ')" }
             - { condition: "result.dueDate === undefined" }

  ❌ WRONG: validation: { rules: [...] }
  ✓ RIGHT: inputs:
             url: { type: string, validate: url }

  ❌ WRONG: constraints: [...]
  ✓ RIGHT: invariants: [...]

  ❌ WRONG: behavior: { on_duplicate: {...} }
  ✓ RIGHT: invariants + effects sections

HOW TO EXPRESS COMMON PATTERNS:

  Field copying rules → invariants: [{ condition: "result.x === original.x" }]
  Field reset rules → invariants: [{ condition: "result.x === undefined" }]
  Data constraints → invariants section
  Side effects → effects section (audit_log, database, etc.)
  UI interactions → ui section (trigger, interaction, feedback, accessibility)
  Input validation → inputs with validate/max/min/pattern options

If you're tempted to add a new field, STOP and check if invariants, effects, or ui covers it.

=== INVARIANT DSL (STRICT SYNTAX) ===

Invariants use a strict DSL for the RULE itself. Natural language is supported
in the 'description' field to provide context for humans and LLMs.

STRUCTURE:
  - description: "Human-readable explanation of what this invariant checks"  # OPTIONAL
    condition: "result.x === input.y"  # REQUIRED: the actual DSL rule

CONTEXT VARIABLES (available in condition expressions):
  ctx      - Execution context (ctx.userId, ctx.timestamp, etc.)
  input    - Input parameters passed to the function (input.url, input.title)
  inputs   - Alias for input (both work)
  result   - Function return value (result.id, result.createdAt)
  original - Original entity for update/duplicate operations (original.title)

PATTERN 1: JavaScript Condition
  { condition: "result === input.a * input.b" }
  { condition: "result.success || result.errors.length > 0" }
  { condition: "result.title.startsWith('Copy of ')" }
  { condition: "result.userId === ctx.userId" }  # Access context

PATTERN 2: Field Assertion with Placeholder
  { "result.count": "@gt(0)" }
  { "result.score": "@between(0, 100)" }
  { "result.id": "@matches('^[A-Z]+-[0-9]+$')" }
  { "result.items": "@length(5)" }
  { "result.value": "@all(@gt(0), @lt(100))" }

PATTERN 3: Loop Assertion (forall)
  forall:
    variable: item
    in: result.items
    then: { "item.status": "active" }
    where: { "item.enabled": true }  # Filter with placeholders supported

PATTERN 4: Existence Assertion (exists)
  exists:
    variable: item
    in: result.items
    where: { "item.status": "complete" }

AVAILABLE ASSERTION PLACEHOLDERS:
  @gt(n), @gte(n), @lt(n), @lte(n), @between(min, max)
  @exists, @defined, @undefined, @empty
  @contains(s), @matches(regex), @length(n)
  @hasItem(obj), @type(t), @all(...), @any(...)

=== @ARRAY TEMPLATE QUOTING ===

When using @array with nested templates, the inner placeholder must be quoted:

  CORRECT:   @array(10, '@string(20)')   # Generates array of 10 strings, each 20 chars
  WRONG:     @array(10, @string(20))     # Inner placeholder not expanded

The outer quotes around the entire placeholder are for YAML, the inner quotes
are for the @array parser to recognize nested templates.

Examples:
  @array(5, '@number(100)')      # Array of 5 numbers 0-100
  @array(3, '@uuid')             # Array of 3 UUIDs
  @array(10, 'fixed-value')      # Array of 10 identical strings
`;

/**
 * Get the schema compliance guidance text.
 */
export function getSchemaComplianceGuidance(): string {
  return SCHEMA_COMPLIANCE_GUIDANCE;
}

/**
 * Get schema documentation.
 */
export function getSpecSchema(options: SchemaDocsOptions = {}): SchemaDocsResult {
  const { filter = 'all', examples = false } = options;

  const result: SchemaDocsResult = {
    sections: [],
  };

  const includeAll = filter === 'all';

  // Fields
  if (includeAll || filter === 'fields') {
    result.sections.push('fields');
    result.fields = SPEC_FIELDS;
  }

  // Input types
  if (includeAll || filter === 'inputs') {
    result.sections.push('inputs');
    result.inputTypes = INPUT_TYPES;
  }

  // Example structure
  if (includeAll || filter === 'examples') {
    result.sections.push('examples');
    result.exampleStructure = EXAMPLE_STRUCTURE;
  }

  // Placeholders
  if (includeAll || filter === 'placeholders') {
    result.sections.push('placeholders');
    result.placeholders = listPlaceholders();
  }

  // Effects
  if (includeAll || filter === 'effects') {
    result.sections.push('effects');
    result.effects = EFFECT_TYPES;
  }

  // Base specs
  if (includeAll || filter === 'base-specs') {
    result.sections.push('base-specs');
    result.baseSpecs = BASE_SPECS;
  }

  // UI fields
  if (includeAll || filter === 'ui') {
    result.sections.push('ui');
    result.uiFields = UI_FIELDS;
  }

  // Fixtures
  if (includeAll || filter === 'fixtures') {
    result.sections.push('fixtures');
    result.fixtures = FIXTURE_DOCS;
  }

  // Include YAML examples
  if (examples) {
    result.yamlExamples = getYamlExamples(filter);
  }

  return result;
}

/**
 * Get YAML examples for a specific filter.
 */
function getYamlExamples(filter: SchemaFilter): string {
  if (filter === 'all' || filter === 'fields') {
    return `# Complete Spec Example
spec.product.create:
  inherits: spec.mutation
  mixins: [requires_auth, logs_audit: { action: product.create, resource: product }]
  architectures: [convex.mutation]

  # === STRATEGIC ===
  goal: "Enable users to create a new product listing"
  outcomes:
    - "Create product <100ms"
    - "Detect duplicates"

  # === OPERATIONAL ===
  intent: "User creates a new product"
  inputs:
    name: { type: string, required: true, max: 200 }
    description: { type: string, max: 2000 }
    projectId: { type: id, table: projects }

  # === OUTPUTS (symmetric with inputs - supports enum, void, etc.) ===
  outputs:
    _id: { type: id, table: products }
    name: { type: string }
    description: { type: string }
    userId: { type: id, table: users }
    createdAt: { type: number }
    status: { type: enum, values: [pending, active, archived] }  # enum in outputs

  # === SECURITY ===
  security:
    authentication: required
    rate_limit: { requests: 60, window: "15m" }

  # === INVARIANTS (DSL SYNTAX for rules, natural language for descriptions) ===
  invariants:
    - description: "URL must be defined"
      condition: "result.url !== undefined"
    - description: "Created by the requesting user"
      condition: "result.userId === ctx.userId"
    - description: "URL must be a valid http/https URL"
      "result.url": "@matches('^https?://')"
    - description: "All tags must have a name"
      forall:
        variable: tag
        in: result.tags
        then: { "tag.name": "@exists" }

  # === EXAMPLES ===
  defaults: &auth
    user: "@authenticated"

  examples:
    success:
      - name: "valid URL"
        given: { <<: *auth, url: "https://github.com" }
        then: { result.url: "https://github.com" }
    errors:
      - name: "invalid URL"
        given: { <<: *auth, url: "not-a-url" }
        then: { error: "INVALID_URL" }
    boundaries:
      - name: "URL at max length"
        url: "@url(2048)"
        then: { result: "@created" }
        property: "forall valid URLs, should succeed"

  # === EFFECTS ===
  effects:
    - { audit_log: { action: "product.create", resourceType: "product" } }
    - { database: { table: "products", operation: "insert" } }`;
  }

  if (filter === 'inputs') {
    return `# Input Field Examples
inputs:
  # String with validation
  url: { type: string, validate: url, required: true }
  title: { type: string, max: 200 }
  email: { type: string, validate: email }
  slug: { type: string, pattern: "^[a-z0-9-]+$" }

  # Numbers with constraints
  count: { type: number, min: 0, max: 1000 }
  rating: { type: number, min: 1, max: 5 }

  # Enums (same syntax for inputs and outputs)
  status: { type: enum, values: [draft, published, archived], default: draft }

  # IDs referencing tables
  projectId: { type: id, table: projects }
  userId: { type: id, table: users }

  # Nested objects
  metadata:
    type: object
    properties:
      tags: { type: array }
      priority: { type: number }

# Output Field Examples (symmetric with inputs)
outputs:
  _id: { type: id, table: products }
  status: { type: enum, values: [pending, active, completed] }  # enum in outputs
  result: { type: void }  # void for no return value
  callPattern: { type: enum, values: [direct, destructured, factory] }  # factory pattern detection`;
  }

  if (filter === 'examples') {
    return `# Example Structures
examples:
  # Success cases - valid inputs, expected outputs
  success:
    - name: "descriptive name"
      given: { input1: "value1", input2: "value2" }
      then: { result.field: "expected" }

  # Error cases - invalid inputs, expected errors
  errors:
    - name: "invalid input"
      given: { input: "bad value" }
      then: { error: "ERROR_CODE" }

  # Warning cases - edge cases that succeed with warnings
  warnings:
    - name: "deprecated field"
      given: { oldField: "value" }
      then: { result: "@created", warnings: "@contains('deprecated')" }

  # Boundary cases - edge cases for property tests
  boundaries:
    - name: "at max length"
      url: "@string(2048)"
      then: { result: "@created" }
      property: "forall strings <= 2048, should succeed"`;
  }

  if (filter === 'placeholders') {
    return `# Placeholder Examples
examples:
  success:
    # User fixtures
    - given: { user: "@authenticated" }  # Valid user with permissions
    - given: { user: "@no_access" }      # User without permissions

    # Value generators
    - given: { title: "@string(100)" }   # String of exactly 100 chars
    - given: { url: "@url(2048)" }       # Valid URL ~2048 chars
    - given: { timestamp: "@now" }       # Current timestamp
    - given: { yesterday: "@now(-1d)" }  # 1 day ago
    - given: { id: "@uuid" }             # UUID v4

  # Basic assertions in then clauses
    - then:
        result: "@created"         # Asserts result is defined
        result.id: "@exists"       # Asserts not null
        result.name: "@defined"    # Asserts defined
        result.errors: "@empty"    # Asserts empty array/string
        result.items: "@contains('expected')"
        result.count: "@lt(100)"   # Less than 100
        result.age: "@gt(0)"       # Greater than 0
        result.score: "@between(0, 100)"  # Between 0 and 100 inclusive
        result.code: "@matches('^[A-Z]+$')"
        result.data: "@type('array')"     # Type check

  # Length assertions
    - then:
        result.items: "@length(5)"       # Exactly 5 items
        result.errors: "@length(0)"      # Empty array

  # Array assertions with @hasItem
    - then:
        result.tags: "@hasItem('important')"           # Array contains string
        result.ids: "@hasItem(42)"                     # Array contains number
        result.users: "@hasItem({ role: 'admin' })"    # Array contains object

  # Object assertions with @hasProperties (for non-arrays)
    - then:
        result.metadata: "@hasProperties({ status: 'active' })"
        result.config: "@hasProperties({ enabled: true, version: 2 })"

  # Composite assertions with @all/@and
    - then:
        result.items: "@all(@hasItem({ valid: true }), @length(3))"
        result.count: "@all(@gt(0), @lt(100))"
        result.tags: "@and(@hasItem('required'), @length(2))"

  # Choice assertions with @oneOf (supports single quotes)
    - then:
        result.status: "@oneOf(['active', 'pending', 'complete'])"

  # Any/Or assertions (any must pass)
    - then:
        result.status: "@any(@contains('success'), @contains('complete'))"
        result.value: "@or(@gt(100), @lt(0))"  # Outside range

  # Negation with @not
    - then:
        result.message: "@not(@contains('error'))"
        result.status: "@not(@empty)"

  # HTTP headers with special characters (keys auto-quoted)
    - given:
        config:
          headers:
            "Content-Type": "application/json"    # Hyphenated keys need quotes
            "X-Request-ID": "abc123"              # X-prefixed headers
            Accept: "text/html"                   # Simple keys don't need quotes`;
  }

  if (filter === 'effects') {
    return `# Effect Examples
effects:
  # Audit logging
  - audit_log:
      action: "product.create"
      resourceType: "product"

  # Database changes
  - database:
      table: "products"
      operation: "insert"  # or: update, delete

  # Embedding generation
  - embedding: "generated_async"

  # Cache operations
  - cache:
      invalidated: "user_products"
  - cache:
      updated: "recent_items"

  # Notifications
  - notification:
      type: "product_created"
      channel: "email"

  # Scheduled jobs
  - scheduler:
      job: "processProduct"
      delay: "5s"`;
  }

  if (filter === 'base-specs') {
    return `# Base Spec Inheritance
# Use these as parents for your specs

spec.my.query:
  inherits: spec.query  # Pre-configured for authenticated reads
  intent: "Fetch user products"

spec.my.mutation:
  inherits: spec.mutation  # Pre-configured for authenticated writes
  intent: "Create product"

spec.my.action:
  inherits: spec.action  # Pre-configured for external calls (rate limited)
  intent: "Call AI API"

# Or use mixins for composition
spec.my.function:
  inherits: spec.function
  mixins:
    - requires_auth
    - rate_limited: { requests: 60, window: "15m" }
    - logs_audit: { action: my.function, resource: item }`;
  }

  if (filter === 'ui') {
    return `# UI Section - for interaction and accessibility tests
# Generate tests with: archcodex spec generate spec.x --type ui

# ============================================================
# EXAMPLE 1: Context Menu Action (Basic)
# ============================================================
spec.item.duplicate:
  intent: "User duplicates an item from the context menu"

  ui:
    # Trigger - how the action is invoked
    trigger:
      location: "context menu"      # Where: context menu, toolbar, button
      element: "[data-item]"        # CSS selector for target element
      label: "Duplicate"            # Button/menu item text
      icon: "copy"                  # Icon name
      shortcut: "Cmd+D"             # Keyboard shortcut
      action: "click"               # click | hover | keypress | submit

    # Interaction - the flow and states
    interaction:
      flow:                         # Step-by-step
        - "User right-clicks item"
        - "Context menu appears"
        - "User clicks Duplicate"
        - "New item appears below"
      optimistic: true              # Shows result immediately
      loading: "Inline spinner"     # Loading indicator

    # Accessibility - ARIA and keyboard
    accessibility:
      role: "menuitem"              # ARIA role
      label: "Duplicate item"       # Accessible label
      keyboardNav:
        - { key: "Enter", action: "activate" }
        - { key: "Escape", action: "close" }

    # Feedback - user messages
    feedback:
      success: "Item duplicated"
      error: "Failed to duplicate"

# ============================================================
# EXAMPLE 2: Multi-Step Modal Dialog
# ============================================================
spec.project.create-wizard:
  intent: "User creates a project through a multi-step wizard"

  ui:
    trigger:
      location: "toolbar"
      element: "[data-action='new-project']"
      label: "New Project"
      icon: "plus"
      shortcut: "Cmd+Shift+N"

    interaction:
      flow:
        - "User clicks New Project button"
        - "Modal opens with Step 1: Basic Info"
        - "User fills name and description"
        - "User clicks Next"
        - "Step 2: Settings appears"
        - "User configures settings"
        - "User clicks Create"
        - "Modal closes, project appears in list"
      loading: "Full modal overlay with spinner"
      states:
        step1:
          when: "currentStep === 1"
          then:
            nextEnabled: "name.length > 0"
            backEnabled: false
        step2:
          when: "currentStep === 2"
          then:
            createEnabled: true
            backEnabled: true
      sequence:
        - trigger: { action: "click", element: "[data-step='next']" }
          wait: "300ms"
          then: { currentStep: 2 }
        - trigger: { action: "click", element: "[data-step='back']" }
          wait: "300ms"
          then: { currentStep: 1 }

    accessibility:
      role: "dialog"
      label: "Create new project"
      focusTrap: true               # Keep focus inside modal
      keyboardNav:
        - { key: "Escape", action: "close modal" }
        - { key: "Tab", action: "cycle through form fields" }
        - { key: "Enter", action: "submit current step" }
      announcements:
        - { when: "step changes", message: "Step {n} of 2", priority: "polite" }
        - { when: "validation error", message: "{error}", priority: "assertive" }

    feedback:
      success: "Project created successfully"
      error: "Failed to create project"
      loading:
        indicator: "spinner"
        ariaLive: "polite"

# ============================================================
# EXAMPLE 3: Drag and Drop Reordering
# ============================================================
spec.list.reorder:
  intent: "User reorders items via drag and drop"

  ui:
    trigger:
      element: "[data-draggable='true']"
      action: "drag"                # Special: drag action

    interaction:
      flow:
        - "User hovers over drag handle"
        - "Cursor changes to grab"
        - "User clicks and drags item"
        - "Drop placeholder shows insertion point"
        - "User releases to drop"
        - "Items reorder with animation"
      optimistic: true
      loading: "None - instant visual feedback"
      states:
        dragging:
          when: "isDragging === true"
          then:
            cursor: "grabbing"
            itemOpacity: 0.5
            showPlaceholder: true
        validDrop:
          when: "isValidDropTarget === true"
          then:
            placeholderHighlighted: true
        invalidDrop:
          when: "isValidDropTarget === false"
          then:
            cursor: "not-allowed"

    accessibility:
      role: "listitem"
      label: "Drag to reorder"
      keyboardNav:
        - { key: "Space", action: "pick up item for reorder" }
        - { key: "ArrowUp", action: "move item up" }
        - { key: "ArrowDown", action: "move item down" }
        - { key: "Escape", action: "cancel reorder" }
        - { key: "Enter", action: "confirm new position" }
      announcements:
        - { when: "item picked up", message: "Grabbed {item}. Use arrows to move.", priority: "assertive" }
        - { when: "item moved", message: "Moved to position {n}", priority: "polite" }
        - { when: "item dropped", message: "{item} dropped at position {n}", priority: "polite" }

    feedback:
      success: "Order saved"
      error: "Failed to save order"

# ============================================================
# EXAMPLE 4: Search with Autocomplete
# ============================================================
spec.search.autocomplete:
  intent: "User searches with autocomplete suggestions"

  ui:
    trigger:
      element: "[data-search-input]"
      action: "keypress"
      shortcut: "Cmd+K"             # Global search shortcut

    interaction:
      flow:
        - "User focuses search input (or presses Cmd+K)"
        - "User types query"
        - "After 150ms debounce, suggestions appear"
        - "User navigates suggestions with arrows"
        - "User selects with Enter or click"
        - "Selected item opens"
      loading: "Inline spinner in input"
      states:
        empty:
          when: "query.length === 0"
          then:
            showRecent: true
            showSuggestions: false
        searching:
          when: "query.length > 0 && isLoading"
          then:
            showSpinner: true
            showSuggestions: false
        results:
          when: "results.length > 0"
          then:
            showSuggestions: true
            highlightedIndex: 0
        noResults:
          when: "query.length > 0 && results.length === 0 && !isLoading"
          then:
            showEmptyState: true
            message: "No results for '{query}'"

    accessibility:
      role: "combobox"
      label: "Search"
      keyboardNav:
        - { key: "ArrowDown", action: "highlight next suggestion" }
        - { key: "ArrowUp", action: "highlight previous suggestion" }
        - { key: "Enter", action: "select highlighted suggestion" }
        - { key: "Escape", action: "clear and close suggestions" }
        - { key: "Tab", action: "select and move to next field" }
      announcements:
        - { when: "results loaded", message: "{count} results found", priority: "polite" }
        - { when: "suggestion highlighted", message: "{suggestion}", priority: "polite" }

    feedback:
      error: "Search failed. Try again."

# ============================================================
# EXAMPLE 5: Inline Editing with Validation
# ============================================================
spec.field.inline-edit:
  intent: "User edits a field inline with live validation"

  ui:
    trigger:
      element: "[data-editable]"
      action: "click"               # Click to edit
      label: "Edit"

    interaction:
      flow:
        - "User clicks editable text"
        - "Text transforms to input field"
        - "User modifies value"
        - "Validation runs on each keystroke"
        - "User presses Enter to save or Escape to cancel"
        - "Field returns to text display"
      optimistic: true
      states:
        viewing:
          when: "isEditing === false"
          then:
            showText: true
            showInput: false
        editing:
          when: "isEditing === true"
          then:
            showText: false
            showInput: true
            selectAll: true         # Select text on edit start
        valid:
          when: "isEditing && isValid"
          then:
            borderColor: "default"
            showError: false
        invalid:
          when: "isEditing && !isValid"
          then:
            borderColor: "error"
            showError: true

    accessibility:
      role: "textbox"
      label: "Click to edit {fieldName}"
      keyboardNav:
        - { key: "Enter", action: "save changes" }
        - { key: "Escape", action: "cancel and revert" }
        - { key: "Tab", action: "save and move to next field" }
      announcements:
        - { when: "edit mode entered", message: "Editing {fieldName}", priority: "polite" }
        - { when: "validation error", message: "Error: {error}", priority: "assertive" }
        - { when: "saved", message: "{fieldName} updated", priority: "polite" }

    feedback:
      success: "Saved"
      error: "Invalid value"

# ============================================================
# EXAMPLE 6: Data Table with Selection
# ============================================================
spec.table.selection:
  intent: "User selects rows in a data table"

  ui:
    trigger:
      element: "[data-row]"
      action: "click"

    interaction:
      flow:
        - "User clicks row to select"
        - "Cmd+click to add to selection"
        - "Shift+click to select range"
        - "Bulk actions toolbar appears when items selected"
      states:
        none:
          when: "selectedCount === 0"
          then:
            showBulkActions: false
            selectAllChecked: false
        some:
          when: "selectedCount > 0 && selectedCount < totalCount"
          then:
            showBulkActions: true
            selectAllChecked: "indeterminate"
        all:
          when: "selectedCount === totalCount"
          then:
            showBulkActions: true
            selectAllChecked: true

    accessibility:
      role: "grid"
      label: "Data table with {count} items"
      keyboardNav:
        - { key: "Space", action: "toggle row selection" }
        - { key: "Ctrl+A", action: "select all rows" }
        - { key: "Escape", action: "clear selection" }
        - { key: "ArrowUp", action: "move to previous row" }
        - { key: "ArrowDown", action: "move to next row" }
        - { key: "Shift+ArrowDown", action: "extend selection down" }
        - { key: "Shift+ArrowUp", action: "extend selection up" }
      announcements:
        - { when: "row selected", message: "Row {n} selected. {total} total selected.", priority: "polite" }
        - { when: "selection cleared", message: "Selection cleared", priority: "polite" }

    feedback:
      success: "{count} items selected"`;
  }

  if (filter === 'fixtures') {
    return `# Fixtures - reusable test data
# Define in .arch/specs/_fixtures.yaml

version: "1.0"

fixtures:
  # Built-in fixtures (always available)
  # @authenticated - Valid user with read/write permissions
  # @no_access - User without permissions
  # @admin_user - Admin user with all permissions

  # Project-defined fixtures
  validTask:
    description: "Pre-existing task item"
    mode: generate                  # Returns actual value in tests
    value:
      _id: "item_test_task"
      itemType: "task"
      title: "Test Task"
      status: "pending"

  archivedItem:
    description: "Item that has been archived"
    mode: documentation             # For human readers only
    setup: "Archive an item via API before test"

# Usage in specs:
spec.item.duplicate:
  examples:
    success:
      - name: "duplicate task"
        given:
          user: "@authenticated"    # Built-in fixture
          item: "@validTask"        # Project fixture
        then:
          result.title: "@contains('Copy of')"`;
  }

  return '';
}

/**
 * Format schema documentation for display.
 */
export function formatSchemaDoc(result: SchemaDocsResult, includeGuidance = true): string {
  const lines: string[] = [];

  // Schema compliance guidance (always first)
  if (includeGuidance) {
    lines.push(SCHEMA_COMPLIANCE_GUIDANCE.trim());
    lines.push('');
  }

  // Fields section
  if (result.fields) {
    lines.push('=== SPEC FIELDS ===');
    lines.push('');
    const sections = [...new Set(result.fields.map(f => f.section))];
    for (const section of sections) {
      lines.push(`[${section.toUpperCase()}]`);
      const sectionFields = result.fields.filter(f => f.section === section);
      for (const field of sectionFields) {
        const req = field.required ? ' (required)' : '';
        lines.push(`  ${field.name}: ${field.type}${req}`);
        lines.push(`    ${field.description}`);
      }
      lines.push('');
    }
  }

  // Input types section
  if (result.inputTypes) {
    lines.push('=== INPUT TYPES ===');
    lines.push('');
    for (const type of result.inputTypes) {
      lines.push(`  ${type.type}: ${type.description}`);
      if (type.options) {
        lines.push(`    Options: ${type.options.join(', ')}`);
      }
      lines.push(`    Example: ${type.example}`);
      lines.push('');
    }
  }

  // Example structure section
  if (result.exampleStructure) {
    lines.push('=== EXAMPLE STRUCTURE ===');
    lines.push('');
    lines.push(`  Categories: ${result.exampleStructure.categories.join(', ')}`);
    lines.push('');
    for (const [cat, desc] of Object.entries(result.exampleStructure.structure)) {
      lines.push(`  ${cat}: ${desc}`);
    }
    lines.push('');
  }

  // Placeholders section
  if (result.placeholders) {
    lines.push('=== @ PLACEHOLDERS ===');
    lines.push('');
    for (const p of result.placeholders) {
      lines.push(`  ${p.placeholder}`);
      lines.push(`    ${p.description}`);
      lines.push(`    Example: ${p.example}`);
      lines.push('');
    }
  }

  // Effects section
  if (result.effects) {
    lines.push('=== EFFECT TYPES ===');
    lines.push('');
    for (const e of result.effects) {
      lines.push(`  ${e.type}: ${e.description}`);
      lines.push(`    Fields: ${e.fields.join(', ')}`);
      lines.push(`    Example: ${e.example}`);
      lines.push('');
    }
  }

  // Base specs section
  if (result.baseSpecs) {
    lines.push('=== BASE SPECS ===');
    lines.push('');
    for (const s of result.baseSpecs) {
      const inherits = s.inheritsFrom ? ` (inherits: ${s.inheritsFrom})` : '';
      lines.push(`  ${s.specId}${inherits}`);
      lines.push(`    ${s.description}`);
    }
    lines.push('');
  }

  // UI fields section
  if (result.uiFields) {
    lines.push('=== UI SECTION ===');
    lines.push('');
    lines.push('  The ui section defines UI interaction specs for test generation.');
    lines.push('  Generate tests: archcodex spec generate spec.x --type ui');
    lines.push('');
    const sections = [...new Set(result.uiFields.map(f => f.section))];
    for (const section of sections) {
      lines.push(`  [${section}]`);
      const sectionFields = result.uiFields.filter(f => f.section === section);
      for (const field of sectionFields) {
        lines.push(`    ${field.field}: ${field.type}`);
        lines.push(`      ${field.description}`);
        if (field.example) {
          lines.push(`      Example: ${field.example}`);
        }
      }
      lines.push('');
    }
  }

  // Fixtures section
  if (result.fixtures) {
    lines.push('=== FIXTURES ===');
    lines.push('');
    lines.push('  Fixtures provide reusable test data referenced with @fixtureName syntax.');
    lines.push('  Define project fixtures in .arch/specs/_fixtures.yaml');
    lines.push('');
    lines.push('  Built-in fixtures:');
    for (const f of result.fixtures.filter(f => f.builtIn)) {
      lines.push(`    @${f.name}: ${f.description}`);
    }
    lines.push('');
    lines.push('  Modes:');
    lines.push('    generate: Returns fixture value in generated tests');
    lines.push('    documentation: Returns @fixtureName as-is (human-readable)');
    lines.push('');
  }

  // YAML examples
  if (result.yamlExamples) {
    lines.push('=== YAML EXAMPLES ===');
    lines.push('');
    lines.push(result.yamlExamples);
    lines.push('');
  }

  return lines.join('\n');
}
