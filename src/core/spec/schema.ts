/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Zod schemas for SpecCodex spec validation.
 * Defines the structure of spec YAML files.
 */
import { z } from 'zod';

// === Schema Drift Prevention ===
// Core fields allowed in SpecNodeSchema - prevents LLM from inventing new sections
export const SPEC_NODE_CORE_FIELDS = new Set([
  // Metadata
  'type', 'version', 'inherits', 'mixins', 'architectures', 'parent',
  'depends_on', 'implementation',
  // Strategic
  'goal', 'outcomes',
  // Security
  'security',
  // Operational
  'intent', 'description', 'rationale', 'inputs', 'outputs',
  // Constraints
  'invariants',
  // Examples
  'defaults', 'examples',
  // Effects
  'effects',
  // Base spec fields
  'required_fields', 'optional_fields', 'required_examples',
  // Type spec fields (spec.type inheritors define data shapes)
  'fields',
  // UI Section (legitimate extension)
  'ui',
]);

// Known extension fields that are allowed but not part of core schema
export const KNOWN_EXTENSION_FIELDS = new Set([
  '<<', // YAML anchor merge
  '_comment', // Documentation comments
  '_deprecated', // Deprecation markers
  '_todo', // Work-in-progress markers
]);

// Core fields allowed in MixinDefinitionSchema
export const MIXIN_CORE_FIELDS = new Set([
  'description', 'security', 'invariants', 'examples', 'effects', 'compose', 'ui',
]);

// === Input Schema ===
export const InputFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'id', 'enum']),
  required: z.boolean().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(), // Dynamic: spec defaults can be any YAML value
  validate: z.string().optional(), // e.g., 'url', 'email'
  max: z.number().optional(),
  min: z.number().optional(),
  pattern: z.string().optional(),
  table: z.string().optional(), // For 'id' type
  values: z.array(z.string()).optional(), // For 'enum' type
  properties: z.record(z.string(), z.unknown()).optional(), // For 'object' type — recursive field definitions
  items: z.unknown().optional(), // For 'array' type — recursive element schema
});

export type InputField = z.infer<typeof InputFieldSchema>;

// === Output Field Schema (Improvement #2) ===
// Defines expected output shape for verification and test generation
export const OutputFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'id', 'void', 'enum']),
  description: z.string().optional(),
  optional: z.boolean().optional(), // Field may not be present in output
  nullable: z.boolean().optional(), // Field can be null
  table: z.string().optional(), // For 'id' type
  values: z.array(z.string()).optional(), // For 'enum' type - allowed values
  properties: z.record(z.string(), z.unknown()).optional(), // For 'object' type — recursive nested fields
  items: z.unknown().optional(), // For 'array' type — recursive element schema
});

export type OutputField = z.infer<typeof OutputFieldSchema>;

// === Security Schema ===
export const SecuritySchema = z.object({
  authentication: z.enum(['required', 'optional', 'none']).optional(),
  rate_limit: z.object({
    requests: z.union([z.number(), z.string()]), // string for ${} variables
    window: z.string(),
  }).optional(),
  permissions: z.array(z.string()).optional(),
  sanitization: z.array(z.string()).optional(),
});

export type Security = z.infer<typeof SecuritySchema>;

// === Invariant Schema ===
// Invariants can be:
// 1. Simple objects: { "result.url": "valid_url" }
// 2. Simple strings: "result.url is always valid"
// 3. Structured forall: { forall: { variable: "x", in: "items", then: { ... } } }
// 4. Structured exists: { exists: { variable: "x", in: "items", where: { ... } } }

// Improvement #3: Structured invariants with quantifiers
export const ForallInvariantSchema = z.object({
  forall: z.object({
    variable: z.string(),
    in: z.string(), // Collection path like "result.items" or "validUrls"
    then: z.record(z.string(), z.unknown()), // Assertion to check for each item
    where: z.record(z.string(), z.unknown()).optional(), // Optional filter condition
  }),
});

export const ExistsInvariantSchema = z.object({
  exists: z.object({
    variable: z.string(),
    in: z.string(), // Collection path
    where: z.record(z.string(), z.unknown()).optional(), // Condition that must match at least one item (optional for simple existence)
  }),
});

export const StructuredInvariantSchema = z.union([
  ForallInvariantSchema,
  ExistsInvariantSchema,
]);

export const InvariantSchema = z.union([
  ForallInvariantSchema,
  ExistsInvariantSchema,
  z.record(z.string(), z.unknown()), // Simple key-value invariant assertions
  z.string(),
]);

export type ForallInvariant = z.infer<typeof ForallInvariantSchema>;
export type ExistsInvariant = z.infer<typeof ExistsInvariantSchema>;
export type StructuredInvariant = z.infer<typeof StructuredInvariantSchema>;
export type Invariant = z.infer<typeof InvariantSchema>;

// === Example Schema ===
export const ExampleSchema = z.object({
  name: z.string().optional(),
  given: z.record(z.string(), z.unknown()).optional(),
  when: z.record(z.string(), z.unknown()).optional(),
  then: z.record(z.string(), z.unknown()),
}).catchall(z.unknown()); // Allow YAML anchor merges like <<: *auth

export type Example = z.infer<typeof ExampleSchema>;

// === Boundary Example Schema ===
// Edge cases that generate both unit tests AND property-based tests
export const BoundaryExampleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  // Boundary condition (uses @ placeholders)
  given: z.record(z.string(), z.unknown()).optional(),
  when: z.record(z.string(), z.unknown()).optional(),
  then: z.record(z.string(), z.unknown()),
  // Property test generation hints
  property: z.string().optional(), // e.g., "forall strings > max_length, should fail"
}).catchall(z.unknown());

export type BoundaryExample = z.infer<typeof BoundaryExampleSchema>;

// === Effect Schema ===
export const EffectSchema = z.record(z.string(), z.unknown());

export type Effect = z.infer<typeof EffectSchema>;

// === UI Specification Schemas ===
// For full-stack specs that include UI interaction patterns

export const UITriggerSchema = z.object({
  location: z.string().optional(),      // "context menu", "toolbar", "inline button"
  element: z.string().optional(),       // CSS selector or semantic identifier
  action: z.string().optional(),        // "click", "hover", "keypress", "submit"
  label: z.string().optional(),         // Button/menu item text
  icon: z.string().optional(),          // Icon name
  shortcut: z.string().optional(),      // "Cmd+D", "Ctrl+Enter"
  position: z.string().optional(),      // "after Edit, before Archive"
}).catchall(z.unknown());

export type UITrigger = z.infer<typeof UITriggerSchema>;

export const UIInteractionSchema = z.object({
  flow: z.array(z.string()).optional(),       // Step-by-step flow descriptions
  loading: z.string().optional(),             // "Inline spinner", "Full-screen loader"
  optimistic: z.boolean().optional(),         // Whether to use optimistic updates
  sequence: z.array(z.object({
    trigger: z.unknown().optional(), // Dynamic: can be string or object trigger
    wait: z.string().optional(),              // "100ms", "animation", "network"
    then: z.record(z.string(), z.unknown()).optional(),       // Assertions after this step
  })).optional(),
  states: z.record(z.string(), z.object({
    when: z.string(),
    then: z.record(z.string(), z.unknown()),
  })).optional(),
}).catchall(z.unknown());

export type UIInteraction = z.infer<typeof UIInteractionSchema>;

export const UIFeedbackSchema = z.object({
  success: z.string().optional(),             // Success message/behavior
  error: z.string().optional(),               // Error message/behavior
  rebalance: z.string().optional(),           // Rebalance feedback (specific to certain UIs)
  loading: z.object({
    indicator: z.string().optional(),         // "spinner", "skeleton", "progress"
    delay: z.string().optional(),             // Debounce delay before showing
    ariaLive: z.enum(['polite', 'assertive', 'off']).optional(),
  }).optional(),
}).catchall(z.unknown());

export type UIFeedback = z.infer<typeof UIFeedbackSchema>;

export const UIAccessibilitySchema = z.object({
  role: z.string().optional(),                // ARIA role
  label: z.string().optional(),               // aria-label or visible label
  menu_item_aria: z.string().optional(),      // Aria label for menu items
  new_entry_aria: z.string().optional(),      // Aria label for new entries
  keyboard: z.string().optional(),            // Keyboard shortcut description
  focus_management: z.string().optional(),    // Focus behavior description
  describedBy: z.string().optional(),         // aria-describedby
  keyboardNav: z.array(z.object({
    key: z.string(),
    action: z.string(),
  })).optional(),
  focusTrap: z.boolean().optional(),
  announcements: z.array(z.object({
    when: z.string(),
    message: z.string(),
    priority: z.enum(['polite', 'assertive']).optional(),
  })).optional(),
}).catchall(z.unknown());

export type UIAccessibility = z.infer<typeof UIAccessibilitySchema>;

/**
 * UI Touchpoint - a UI location where a feature must be wired.
 * Used to track completion of UI wiring tasks across multiple components.
 * @see spec.archcodex.uiTouchpoints in .arch/specs/archcodex/ui-touchpoints.spec.yaml
 */
export const UITouchpointSchema = z.object({
  /** Component name or path where feature must appear (required) */
  component: z.string(),
  /** UI location within component (e.g., 'context menu', 'toolbar', 'inline') */
  location: z.string().optional(),
  /** Expected handler function name (e.g., 'handleDuplicate') */
  handler: z.string().optional(),
  /** Agent tracks completion status (default: false) */
  wired: z.boolean().default(false),
  /** Whether this touchpoint is required or optional (default: 'required') */
  priority: z.enum(['required', 'optional']).default('required'),
});

export type UITouchpoint = z.infer<typeof UITouchpointSchema>;

export const UISchema = z.object({
  trigger: UITriggerSchema.optional(),
  interaction: UIInteractionSchema.optional(),
  feedback: UIFeedbackSchema.optional(),
  accessibility: UIAccessibilitySchema.optional(),
  /** UI touchpoints - explicit wiring checklist for multi-component features */
  touchpoints: z.array(UITouchpointSchema).optional(),
}).catchall(z.unknown());

export type UI = z.infer<typeof UISchema>;

// === Mixin Reference Schema ===
// Mixins can be strings or objects with parameters: [requires_auth, logs_audit: { action: "x" }]
export const MixinRefSchema = z.union([
  z.string(),
  z.record(z.string(), z.record(z.string(), z.unknown())), // Mixin with parameters
]);

export type MixinRef = z.infer<typeof MixinRefSchema>;

// === Spec Type Schema (Improvement #10) ===
// 'base' specs are abstract templates for inheritance (not counted in drift)
// 'leaf' specs (default) describe actual implementations
// 'test' specs are example/demo specs used for testing SpecCodex features
export const SpecTypeSchema = z.enum(['base', 'leaf', 'test']).optional();

export type SpecType = z.infer<typeof SpecTypeSchema>;

// === Spec Node Schema ===
export const SpecNodeSchema = z.object({
  // Metadata
  type: SpecTypeSchema, // 'base' for abstract specs, 'leaf' (default) for implementations
  version: z.string().optional(),
  inherits: z.string().optional(),
  mixins: z.array(MixinRefSchema).optional(),
  architectures: z.array(z.string()).optional(),
  parent: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  implementation: z.string().optional(),

  // Strategic
  goal: z.string().optional(),
  outcomes: z.array(z.string()).optional(),

  // Security
  security: SecuritySchema.optional(),

  // Operational
  // Intent is required for leaf specs, optional for base specs (which define required_fields)
  intent: z.string().optional(),
  description: z.string().optional(),
  rationale: z.string().optional(),
  inputs: z.record(z.string(), InputFieldSchema).optional(),

  // Outputs (Improvement #2) - defines expected return type shape
  outputs: z.record(z.string(), OutputFieldSchema).optional(),

  // Invariants
  invariants: z.array(InvariantSchema).optional(),

  // Examples (for test generation)
  defaults: z.record(z.string(), z.unknown()).optional(), // YAML anchor definitions
  examples: z.object({
    success: z.array(ExampleSchema).optional(),
    errors: z.array(ExampleSchema).optional(),
    warnings: z.array(ExampleSchema).optional(),
    boundaries: z.array(BoundaryExampleSchema).optional(), // Edge cases → unit + property tests
  }).optional(),

  // Effects (for integration tests)
  effects: z.array(EffectSchema).optional(),

  // UI specification (for full-stack specs)
  ui: UISchema.optional(),

  // For base specs: define required fields and defaults
  required_fields: z.array(z.string()).optional(),
  optional_fields: z.array(z.string()).optional(),
  required_examples: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
}).catchall(z.unknown()); // Allow additional fields and YAML anchor merges

export type SpecNode = z.infer<typeof SpecNodeSchema>;

// === Mixin Definition Schema ===
export const MixinDefinitionSchema = z.object({
  description: z.string().optional(),

  // Security contributions
  security: SecuritySchema.optional(),

  // Invariants contributions
  invariants: z.array(InvariantSchema).optional(),

  // Example contributions
  examples: z.object({
    success: z.array(ExampleSchema).optional(),
    errors: z.array(ExampleSchema).optional(),
    warnings: z.array(ExampleSchema).optional(),
    boundaries: z.array(BoundaryExampleSchema).optional(),
  }).optional(),

  // Effect contributions
  effects: z.array(EffectSchema).optional(),

  // UI contributions
  ui: UISchema.optional(),

  // Composite mixin (combines other mixins)
  compose: z.array(MixinRefSchema).optional(),
}).catchall(z.unknown());

export type MixinDefinition = z.infer<typeof MixinDefinitionSchema>;

// === Base Spec Registry Schema ===
export const BaseSpecRegistrySchema = z.record(z.string(), SpecNodeSchema);

export type BaseSpecRegistry = z.infer<typeof BaseSpecRegistrySchema>;

// === Mixin Registry Schema ===
export const MixinRegistrySchema = z.object({
  mixins: z.record(z.string(), MixinDefinitionSchema),
});

export type MixinRegistry = z.infer<typeof MixinRegistrySchema>;

// === Full Spec Registry Schema ===
export const SpecRegistrySchema = z.object({
  version: z.string().optional(),
  nodes: z.record(z.string(), SpecNodeSchema).default({}),
  mixins: z.record(z.string(), MixinDefinitionSchema).default({}),
});

export type SpecRegistry = z.infer<typeof SpecRegistrySchema>;

// === Parsed Spec Result ===
export interface ParsedSpec {
  specId: string;
  node: SpecNode;
  filePath: string;
}

// === Resolution Result ===
export interface ResolvedSpec {
  specId: string;
  inheritanceChain: string[];
  appliedMixins: string[];
  node: SpecNode; // Fully resolved with all inherited fields
}

// === Validation Error ===
export interface SpecValidationError {
  code: string;
  message: string;
  field?: string;
  line?: number;
  column?: number;
}

// === Parse Result ===
export interface SpecParseResult {
  valid: boolean;
  specs: ParsedSpec[];
  errors: SpecValidationError[];
  warnings: SpecValidationError[];
}

// === Resolve Result ===
export interface SpecResolveResult {
  valid: boolean;
  spec?: ResolvedSpec;
  errors: SpecValidationError[];
}
