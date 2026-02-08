/**
 * @arch archcodex.core.domain.schema
 */
import { z } from 'zod';

/** Severity levels for constraints. */
export const SeveritySchema = z.enum(['error', 'warning']);

/** Constraint rule types. */
export const ConstraintRuleSchema = z.enum([
  'must_extend',
  'implements',
  'forbid_import',
  'require_import',
  'allow_import',
  'require_decorator',
  'forbid_decorator',
  'naming_pattern',
  'location_pattern',
  'max_public_methods',
  'max_file_lines',
  'require_test_file',
  // Cross-file constraints (require --project flag)
  'importable_by',
  'forbid_circular_deps',
  // Runtime/dynamic constraints (v2.0)
  'forbid_call',
  'require_try_catch',
  'forbid_mutation',
  // Additional constraints (v2.1)
  'require_call',
  'require_pattern',
  'require_export',
  'require_call_before',
  // Pattern constraints (v2.2)
  'forbid_pattern',
  'allow_pattern',
  // Business logic constraints (v2.3)
  'require_one_of',
  // Coverage constraints (v2.4) - cross-file completeness checking
  'require_coverage',
  // DRY detection (v2.5) - flag similar files
  'max_similarity',
  // Intent validation (v2.6) - validate @intent: annotations
  'verify_intent',
  // Companion call constraints (v2.7) - require calls when certain methods are invoked
  'require_companion_call',
  // Companion file constraints (v2.8) - require sibling files (barrels, tests, styles)
  'require_companion_file',
  // Synthetic/diagnostic rules (internal use for error reporting)
  'internal_error',
  'override_limit',
  // Inline mixin governance rules
  'mixin_inline_forbidden',
  'mixin_inline_only',
  // Expected intent governance
  'missing_expected_intent',
  // Registry quality rules
  'missing_why',
  // Singleton architecture violation
  'singleton_violation',
]);

/** Constraint categories for grouping and priority. */
export const ConstraintCategorySchema = z.enum([
  'security',
  'logging',
  'structure',
  'naming',
  'performance',
  'testing',
]);

/** Pointer size hints for token budgeting. */
export const PointerSizeSchema = z.enum(['small', 'medium', 'large']);

/** Architecture kind - implementation (default), organizational (barrels/types), definition (schemas). */
export const ArchitectureKindSchema = z.enum(['implementation', 'organizational', 'definition']);

/** Condition for conditional constraints. */
export const ConstraintConditionSchema = z.object({
  // Positive conditions
  has_decorator: z.string().optional(),
  has_import: z.string().optional(),
  extends: z.string().optional(),
  file_matches: z.string().optional(),
  implements: z.string().optional(),
  method_has_decorator: z.string().optional(),
  // Negated conditions (constraint applies when condition is NOT met)
  not_has_decorator: z.string().optional(),
  not_has_import: z.string().optional(),
  not_extends: z.string().optional(),
  not_file_matches: z.string().optional(),
  not_implements: z.string().optional(),
  not_method_has_decorator: z.string().optional(),
});

/**
 * Alternative suggestion for a forbidden import/pattern.
 * Used to provide "did you mean?" suggestions.
 */
export const AlternativeSchema = z.object({
  /** Module or pattern to use instead */
  module: z.string(),
  /** Specific export to use (e.g., "ApiClient") */
  export: z.string().optional(),
  /** Description of why this is preferred */
  description: z.string().optional(),
  /** Usage example */
  example: z.string().optional(),
});

/**
 * Usage example for constraints with multiple options (e.g., permission checks).
 * Maps resource/context to the specific function to use.
 */
export const UsageMapSchema = z.record(z.string(), z.string());

/**
 * Alternative valid pattern for context-dependent constraints.
 * Use sparingly - only for genuinely context-dependent cases (performance, architecture choices).
 */
export const AlsoValidSchema = z.object({
  /** Name/description of this alternative pattern */
  pattern: z.string(),
  /** When this alternative is appropriate */
  when: z.string(),
  /** Optional code example */
  codeExample: z.string().optional(),
});

/**
 * Structured naming pattern - LLM-friendly alternative to regex.
 * Compiles to regex internally for validation.
 */
export const NamingStructuredSchema = z.object({
  /** Case convention for the name */
  case: z.enum(['PascalCase', 'camelCase', 'snake_case', 'UPPER_CASE', 'kebab-case']).optional(),
  /** Required prefix (e.g., "I" for interfaces) */
  prefix: z.string().optional(),
  /** Required suffix (e.g., "Service", "Controller") */
  suffix: z.string().optional(),
  /** File extension (e.g., ".ts", ".tsx") */
  extension: z.string().optional(),
});

/**
 * Coverage constraint value schema for require_coverage rule.
 */
export const CoverageConstraintValueSchema = z.object({
  /** How to extract sources: export_names, string_literals, file_names, union_members, object_keys */
  source_type: z.enum(['export_names', 'string_literals', 'file_names', 'union_members', 'object_keys']),
  /** Pattern to extract sources (regex for string_literals, name for AST modes) */
  source_pattern: z.string(),
  /** Regex to extract values from matched text (for string_literals) */
  extract_values: z.string().optional(),
  /** Glob pattern for source files */
  in_files: z.string(),
  /** Pattern to find handlers (${value} replaced with transformed value) */
  target_pattern: z.string(),
  /** Transform template (e.g., "handle${PascalCase}") */
  transform: z.string().optional(),
  /** Glob pattern for handler files */
  in_target_files: z.string(),
});

/**
 * Single companion rule for require_companion_call.
 */
export const CompanionRuleSchema = z.object({
  /** Target to match (receiver name in method_chain mode, or first arg in first_argument mode) */
  target: z.string(),
  /** Operations (method names) that trigger this rule */
  operations: z.array(z.string()),
  /** Required companion call */
  call: z.string(),
});

/**
 * Value schema for require_companion_call rule.
 * Requires companion calls when certain methods are invoked on specific targets.
 */
export const RequireCompanionCallValueSchema = z.object({
  // Single rule (shorthand)
  /** Target to match (receiver name in method_chain mode, or first arg in first_argument mode) */
  target: z.string().optional(),
  /** Operations (method names) that trigger this rule */
  operations: z.array(z.string()).optional(),
  /** Required companion call */
  call: z.string().optional(),
  // Multiple rules
  /** Array of companion rules */
  rules: z.array(CompanionRuleSchema).optional(),
  // Location setting
  /** Where the companion call must be: same_function, same_file, or after */
  location: z.enum(['same_function', 'same_file', 'after']).default('same_file'),
});

/**
 * Single companion file config for require_companion_file rule.
 */
export const CompanionFileConfigSchema = z.object({
  /** Path pattern for the companion file (supports ${name}, ${name:kebab}, ${ext}, ${dir}) */
  path: z.string(),
  /** If true, verify the companion exports from this file */
  must_export: z.boolean().optional(),
});

/**
 * Value schema for require_companion_file rule.
 * Requires sibling/companion files to exist (barrels, tests, styles, stories).
 */
export const RequireCompanionFileValueSchema = z.union([
  // Simple string path
  z.string(),
  // Object with path and options
  CompanionFileConfigSchema,
  // Array of strings or configs
  z.array(z.union([z.string(), CompanionFileConfigSchema])),
]);

/**
 * Get a helpful hint about the expected value type for a constraint rule.
 * Used to produce better error messages when value is missing or wrong type.
 */
function getExpectedValueHint(rule: string): string {
  const hints: Record<string, string> = {
    // String value rules
    naming_pattern: "Expected: regex string (e.g., '^[A-Z].*\\.ts$')",
    location_pattern: "Expected: glob string (e.g., 'src/services/**')",
    must_extend: "Expected: class name string (e.g., 'BaseService')",
    implements: "Expected: interface name string (e.g., 'IRepository')",
    require_decorator: "Expected: decorator string (e.g., '@Injectable')",
    forbid_decorator: "Expected: decorator string (e.g., '@Deprecated')",
    require_pattern: "Expected: regex string (e.g., 'isDeleted.*false')",
    forbid_pattern: "Expected: regex string (e.g., 'console\\.log')",
    allow_pattern: "Expected: regex string to allow",
    // Array value rules
    forbid_import: "Expected: string[] (e.g., ['fs', 'http', '@internal/*'])",
    require_import: "Expected: string[] (e.g., ['zod', '@core/logger'])",
    allow_import: "Expected: string[] (e.g., ['axios'])",
    require_test_file: "Expected: string[] (e.g., ['*.test.ts', '*.spec.ts'])",
    importable_by: "Expected: string[] of architecture patterns",
    forbid_call: "Expected: string[] (e.g., ['setTimeout', 'console.*'])",
    require_call: "Expected: string[] (e.g., ['validateInput', 'sanitize*'])",
    require_export: "Expected: string[] (e.g., ['*Provider', 'use*'])",
    require_one_of: "Expected: string[] of patterns (e.g., ['isDeleted', '@no-soft-delete'])",
    // Number value rules
    max_file_lines: "Expected: number (e.g., 300)",
    max_public_methods: "Expected: number (e.g., 10)",
    max_similarity: "Expected: number 0-1 (e.g., 0.8)",
    // Boolean value rules
    forbid_circular_deps: "Expected: boolean (true)",
    // Complex object rules
    require_coverage: "Expected: object with source_type, source_pattern, in_files, target_pattern, in_target_files",
    require_companion_call: "Expected: object with target, operations, call (or rules array)",
  };
  return hints[rule] || "Expected: string, string[], or number";
}

/**
 * A single constraint definition.
 */
export const ConstraintSchema = z.preprocess(
  // Preprocess to provide helpful error messages for missing 'value' field
  (input) => {
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if (obj.value === undefined) {
        const rule = typeof obj.rule === 'string' ? obj.rule : 'unknown';
        const hint = getExpectedValueHint(rule);
        if (obj.naming) {
          throw new Error(
            `Constraint '${rule}' has 'naming' field but missing 'value'. ` +
            `The 'naming' field is documentation-only; you still need 'value' with the regex pattern. ${hint}`
          );
        }
        throw new Error(`Constraint '${rule}' requires a 'value' field. ${hint}`);
      }
    }
    return input;
  },
  z.object({
    rule: ConstraintRuleSchema,
    value: z.union([z.string(), z.array(z.string()), z.number(), CoverageConstraintValueSchema, RequireCompanionFileValueSchema, RequireCompanionCallValueSchema]),
  severity: SeveritySchema.default('error'),
  category: ConstraintCategorySchema.optional(),
  why: z.string().optional(),
  /** For require_try_catch: patterns of calls that must be wrapped */
  around: z.union([z.string(), z.array(z.string())]).optional(),
  /** For require_call_before: calls that must happen before these patterns */
  before: z.union([z.string(), z.array(z.string())]).optional(),
  /** For require_pattern: regex pattern to match in file content */
  pattern: z.string().optional(),
  /** Condition that must be true for this constraint to apply */
  when: ConstraintConditionSchema.optional(),
  /**
   * Regex pattern - constraint only applies if file content matches this pattern.
   * Use for performance (skip expensive checks) or scoping (only check files with certain patterns).
   */
  applies_when: z.string().optional(),
  /**
   * List of exceptions - constraint is skipped if any condition is met.
   * Supported prefixes:
   * - "import:moduleName" - file imports this module
   * - "@intent:name" - file has this @intent annotation
   * - "decorator:@Name" - file uses this decorator
   * - Plain string - treated as import (backwards compatibility)
   */
  unless: z.array(z.string()).optional(),
  /** Simple alternative - single module/function to use instead */
  alternative: z.string().optional(),
  /** Detailed alternatives with examples */
  alternatives: z.array(AlternativeSchema).optional(),
  /** For max_file_lines: use LOC (lines of code) instead of total lines */
  exclude_comments: z.boolean().optional(),
  /** If true, replaces ALL parent constraints with the same rule (not just same rule+value) */
  override: z.boolean().optional(),
  /** Usage map: when constraint has multiple options, shows which to use per context */
  usage: UsageMapSchema.optional(),
  /** For array values: 'all' requires all items (default), 'any' requires at least one */
  match: z.enum(['all', 'any']).optional(),
  // LLM-friendly structured alternatives
  /** Structured naming pattern - alternative to regex naming_pattern */
  naming: NamingStructuredSchema.optional(),
  // Documentation fields for LLM context
  /** Valid examples for documentation (not used for validation) */
  examples: z.array(z.string()).optional(),
  /** Invalid examples for documentation (not used for validation) */
  counterexamples: z.array(z.string()).optional(),
  /** Human-readable description of what the pattern checks */
  intent: z.string().optional(),
  /** Code example showing correct usage */
  codeExample: z.string().optional(),
  /** Alternative valid patterns for context-dependent cases (use sparingly) */
  also_valid: z.array(AlsoValidSchema).optional(),
  })
);

/**
 * A pointer to external documentation or code.
 */
export const PointerSchema = z.object({
  uri: z.string().regex(/^(arch|code|template):\/\/.+/, 'URI must use arch://, code://, or template:// scheme'),
  label: z.string(),
  size: PointerSizeSchema.default('medium'),
  summary: z.string().optional(),
});

/**
 * Inline usage mode for mixins.
 * Controls whether a mixin can be used inline (@arch archId +mixin) or in registry only.
 */
export const MixinInlineModeSchema = z.enum(['allowed', 'only', 'forbidden']);

/**
 * A hint with optional example reference.
 * Can be either a simple string or an object with text and example.
 */
export const HintObjectSchema = z.object({
  text: z.string(),
  example: z.string().regex(/^(arch|code):\/\/.+/, 'Example URI must use arch:// or code:// scheme').optional(),
});

/**
 * Hint can be a string or an object with text and example.
 */
export const HintSchema = z.union([z.string(), HintObjectSchema]);

/**
 * An architecture node (domain, mixin, or leaf).
 * Note: `rationale` is required for leaf architectures to explain why they exist.
 * Base/parent architectures may omit it if children provide specific rationale.
 */
export const ArchitectureNodeSchema = z.object({
  description: z.string().optional(),
  rationale: z.string(),
  kind: ArchitectureKindSchema.optional(),
  inherits: z.string().optional(),
  mixins: z.array(z.string()).optional(),
  contract: z.string().optional(),
  constraints: z.array(ConstraintSchema).optional(),
  /** Exclude specific constraints from parent architectures (e.g., "forbid_import:console", "max_file_lines") */
  exclude_constraints: z.array(z.string()).optional(),
  hints: z.array(HintSchema).optional(),
  pointers: z.array(PointerSchema).optional(),
  /** Current version of this architecture (e.g., "2.0") */
  version: z.string().optional(),
  /** Version from which this architecture is deprecated (triggers warnings) */
  deprecated_from: z.string().optional(),
  /** Pointer URI to migration guide for deprecated architectures */
  migration_guide: z.string().regex(/^(arch|code):\/\/.+/, 'Migration guide must use arch:// or code:// scheme').optional(),
  /** Reference implementation files (for golden sample feature) */
  reference_implementations: z.array(z.string()).optional(),
  /** File naming pattern with placeholders (e.g., "${name}Service.ts") */
  file_pattern: z.string().optional(),
  /** Default path for new files (e.g., "src/services/${layer}/") */
  default_path: z.string().optional(),
  /** Code pattern showing expected structure (displayed in --format ai) */
  code_pattern: z.string().optional(),
  /** Mark as singleton - intentionally used by only one file */
  singleton: z.boolean().optional(),
  /**
   * Inline usage mode (for mixins only).
   * - 'allowed' (default): Can be used inline (+mixin) or in registry mixins:[]
   * - 'only': MUST be used inline, warning if in registry mixins:[]
   * - 'forbidden': MUST be in registry, warning if used inline (+mixin)
   */
  inline: MixinInlineModeSchema.optional(),
  /**
   * Expected intents for files using this architecture.
   * Warns if a file lacks any of these intents.
   * Helps agents know which @intent annotations to add.
   */
  expected_intents: z.array(z.string()).optional(),
  /**
   * Suggested intents for files using this architecture.
   * Shown to agents as available options but don't warn if missing.
   * Each entry has a name and when clause explaining when to use it.
   */
  suggested_intents: z.array(z.object({
    name: z.string(),
    when: z.string(),
  })).optional(),
});

/**
 * Mixin definitions - a record of mixin names to architecture nodes.
 */
export const MixinsSchema = z.record(z.string(), ArchitectureNodeSchema);

/**
 * Raw registry input schema.
 * Validates the structure before separating nodes from mixins.
 */
const RawRegistrySchema = z.object({
  mixins: MixinsSchema.optional(),
}).catchall(ArchitectureNodeSchema);

/**
 * Complete registry schema.
 * The registry contains architecture nodes and an optional "mixins" section.
 * This schema parses the raw input and separates nodes from mixins.
 */
export const RegistrySchema = RawRegistrySchema.transform((data) => {
  const { mixins: rawMixins, ...nodes } = data;
  const mixins: Record<string, z.infer<typeof ArchitectureNodeSchema>> = rawMixins || {};

  return {
    nodes: nodes as Record<string, z.infer<typeof ArchitectureNodeSchema>>,
    mixins
  };
});

// Re-export intent, action, and feature schemas from split modules
export {
  IntentDefinitionSchema,
  IntentRegistrySchema,
  type IntentDefinition,
  type IntentRegistry,
} from './intent-schema.js';

export {
  ActionDefinitionSchema,
  ActionRegistrySchema,
  type ActionDefinition,
  type ActionRegistry,
} from './action-schema.js';

export {
  FeatureComponentSchema,
  FeatureDefinitionSchema,
  FeatureRegistrySchema,
  type FeatureComponent,
  type FeatureDefinition,
  type FeatureRegistry,
} from './feature-schema.js';

export {
  ComponentGroupItemSchema,
  ComponentGroupTriggersSchema,
  ComponentGroupRelatedSchema,
  ComponentGroupDefinitionSchema,
  ComponentGroupsRegistrySchema,
  type ComponentGroupItem,
  type ComponentGroupTriggers,
  type ComponentGroupRelated,
  type ComponentGroupDefinition,
  type ComponentGroupsRegistry,
} from './component-group-schema.js';

// Type exports
export type Severity = z.infer<typeof SeveritySchema>;
export type ConstraintRule = z.infer<typeof ConstraintRuleSchema>;
export type MixinInlineMode = z.infer<typeof MixinInlineModeSchema>;
export type ConstraintCategory = z.infer<typeof ConstraintCategorySchema>;
export type PointerSize = z.infer<typeof PointerSizeSchema>;
export type ArchitectureKind = z.infer<typeof ArchitectureKindSchema>;
export type ConstraintCondition = z.infer<typeof ConstraintConditionSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;
export type UsageMap = z.infer<typeof UsageMapSchema>;
export type CoverageConstraintValue = z.infer<typeof CoverageConstraintValueSchema>;
export type CompanionRule = z.infer<typeof CompanionRuleSchema>;
export type RequireCompanionCallValue = z.infer<typeof RequireCompanionCallValueSchema>;
export type CompanionFileConfig = z.infer<typeof CompanionFileConfigSchema>;
export type RequireCompanionFileValue = z.infer<typeof RequireCompanionFileValueSchema>;
export type NamingStructured = z.infer<typeof NamingStructuredSchema>;
/** All possible constraint value types. */
export type ConstraintValue = string | string[] | number | CoverageConstraintValue | RequireCompanionCallValue | RequireCompanionFileValue;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type Pointer = z.infer<typeof PointerSchema>;
export type HintObject = z.infer<typeof HintObjectSchema>;
export type Hint = z.infer<typeof HintSchema>;
export type ArchitectureNode = z.infer<typeof ArchitectureNodeSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
