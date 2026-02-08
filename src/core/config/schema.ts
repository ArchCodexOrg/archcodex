/**
 * @arch archcodex.core.domain.schema
 */
import { z } from 'zod';

/**
 * Helper to create an optional field with schema defaults.
 * In Zod 4, .default({}) doesn't work for objects with inner defaults.
 * This helper makes the field optional and applies schema defaults when undefined.
 * Note: Both undefined and null are treated as "missing" and converted to {}.
 */
function withDefaults<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => val ?? {}, schema);
}

/** Policy for handling untagged files. */
export const UntaggedPolicySchema = z.enum(['allow', 'warn', 'deny']);

/** File scanning patterns configuration. */
export const FileScanPatternsSchema = z.object({
  /** Glob patterns for files to include */
  include: z.array(z.string()).default(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go']),
  /** Glob patterns for files to exclude */
  exclude: z.array(z.string()).default([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.d.ts',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.test.tsx',
    '**/*.spec.tsx',
    '**/*.test.js',
    '**/*.spec.js',
    '**/*_test.py',
    '**/test_*.py',
    '**/*_test.go',
  ]),
});

/** Untagged file handling configuration. */
const UntaggedConfigSchema = z.object({
  policy: UntaggedPolicySchema.default('warn'),
  require_in: z.array(z.string()).default([]),
  exempt: z.array(z.string()).default([]),
});

/** File policies configuration. */
export const FilePoliciesSchema = z.object({
  /** File scanning patterns for check/health commands */
  scan: withDefaults(FileScanPatternsSchema),
  untagged: withDefaults(UntaggedConfigSchema),
});

/** Exit codes configuration. */
export const ExitCodesSchema = z.object({
  success: z.number().default(0),
  error: z.number().default(1),
  warning_only: z.number().default(0),
});

/** Behavior for constraints missing 'why' field. */
export const MissingWhyBehaviorSchema = z.enum(['ignore', 'warning', 'error']);

/** Validation settings. */
export const ValidationSettingsSchema = z.object({
  fail_on_warning: z.boolean().default(false),
  max_overrides_per_file: z.number().min(0).default(3),
  fail_on_expired_override: z.boolean().default(true),
  exit_codes: withDefaults(ExitCodesSchema),
  precommit: z.lazy(() => PrecommitSettingsSchema).optional(),
  /** Concurrency for parallel file validation (default: 75% of CPUs, min 2, max 16) */
  concurrency: z.number().min(1).max(64).optional(),
  /** How to handle constraints missing 'why' field (especially forbid_* rules) */
  missing_why: MissingWhyBehaviorSchema.default('ignore'),
});

/** Hydration format options. */
export const HydrationFormatSchema = z.enum(['terse', 'verbose']);

/** Hydration settings. */
export const HydrationSettingsSchema = z.object({
  format: HydrationFormatSchema.default('terse'),
  include_why: z.boolean().default(true),
  show_inheritance: z.boolean().default(false),
  max_header_tokens: z.number().min(100).default(500),
});

/** Pointer base paths. */
export const PointerBasePathsSchema = z.object({
  arch: z.string().default('.arch/docs'),
  code: z.string().default('.'),
  template: z.string().default('.arch/templates'),
});

/** Pointer settings. */
export const PointerSettingsSchema = z.object({
  base_paths: withDefaults(PointerBasePathsSchema),
  default_extension: z.string().default('.md'),
});

/** Override settings. */
export const OverrideSettingsSchema = z.object({
  required_fields: z.array(z.string()).default(['reason']),
  optional_fields: z.array(z.string()).default(['expires', 'ticket', 'approved_by']),
  warn_no_expiry: z.boolean().default(true),
  max_expiry_days: z.number().min(1).default(180),
});

/** Output format for validation results. */
export const OutputFormatSchema = z.enum(['human', 'json', 'compact']);

/** Pre-commit hook settings for gradual adoption. */
export const PrecommitSettingsSchema = z.object({
  max_errors: z.number().min(0).nullable().default(null),
  max_warnings: z.number().min(0).nullable().default(null),
  output_format: OutputFormatSchema.default('human'),
  only_staged_files: z.boolean().default(false),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
});

/** LLM provider type. */
export const LLMProviderTypeSchema = z.enum(['openai', 'anthropic', 'prompt']);

/** Individual LLM provider configuration (supports OpenAI-compatible APIs). */
export const LLMProviderConfigSchema = z.object({
  base_url: z.string().optional(),
  model: z.string().optional(),
  api_key: z.string().optional(),
  max_tokens: z.number().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

/** LLM settings for verification and reindexing. */
export const LLMSettingsSchema = z.object({
  default_provider: LLMProviderTypeSchema.default('prompt'),
  providers: z.object({
    openai: LLMProviderConfigSchema.optional(),
    anthropic: LLMProviderConfigSchema.optional(),
  }).default({}),
});

/** Constraint rule types for language-level skip configuration. */
export const ConstraintRuleRefSchema = z.enum([
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
  'importable_by',
  'forbid_circular_deps',
]);

/** Behavior for non-applicable constraints (e.g., require_decorator on Go). */
export const NonApplicableConstraintBehaviorSchema = z.enum(['skip', 'warn']);

/** Per-language settings. */
export const LanguageSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  skip_constraints: z.array(ConstraintRuleRefSchema).default([]),
  non_applicable_constraints: NonApplicableConstraintBehaviorSchema.default('skip'),
  validator_package: z.string().optional(),
});

/**
 * Helper for language settings with configurable default enabled state.
 * Handles non-object input gracefully by ignoring it.
 */
function withLanguageDefaults(defaultEnabled: boolean) {
  return z.preprocess((val) => {
    const base = typeof val === 'object' && val !== null ? val : {};
    return defaultEnabled ? base : { enabled: false, ...base };
  }, LanguageSettingsSchema);
}

/** Languages configuration section. */
export const LanguagesConfigSchema = z.object({
  typescript: withLanguageDefaults(true),
  javascript: withLanguageDefaults(true),
  python: withLanguageDefaults(false),
  go: withLanguageDefaults(false),
  java: withLanguageDefaults(false),
});

/** Individual package definition for monorepo boundaries. */
export const PackageConfigSchema = z.object({
  /** Path to the package (relative to project root) */
  path: z.string(),
  /** List of packages this package can import from */
  can_import: z.array(z.string()).default([]),
  /** Optional package name (defaults to path) */
  name: z.string().optional(),
});

/** Packages configuration for monorepo boundaries. */
export const PackagesConfigSchema = z.array(PackageConfigSchema).default([]);

/** Individual layer definition for architectural boundaries. */
export const LayerConfigSchema = z.object({
  /** Layer name (e.g., 'core', 'cli', 'utils') */
  name: z.string(),
  /** Glob patterns for files in this layer */
  paths: z.array(z.string()),
  /** List of layers this layer can import from */
  can_import: z.array(z.string()).default([]),
  /** Glob patterns to exclude from this layer (e.g., generated files) */
  exclude: z.array(z.string()).default([]),
});

/** Layers configuration for architectural boundaries. */
export const LayersConfigSchema = z.array(LayerConfigSchema).default([]);

/** Custom inference rule configuration (string patterns, not RegExp). */
export const InferenceRuleConfigSchema = z.object({
  name: z.string(),
  archId: z.string(),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  /** File pattern as regex string */
  filePattern: z.string().optional(),
  /** Content patterns as regex strings */
  contentPatterns: z.array(z.string()).optional(),
  /** All patterns must match (AND) vs any pattern (OR) */
  matchAll: z.boolean().optional(),
  description: z.string(),
});

/** Inference settings for architecture auto-detection. */
export const InferenceSettingsSchema = z.object({
  /** Custom rules for inference */
  custom_rules: z.array(InferenceRuleConfigSchema).optional(),
  /** Include built-in standard rules (React, Convex, etc.) - default false for full control */
  use_builtin_rules: z.boolean().default(false),
  /** When using built-in rules, check custom rules first (true) or after (false) */
  prepend_custom: z.boolean().default(true),
  /** Validate that inferred archIds exist in the registry */
  validate_arch_ids: z.boolean().default(true),
});

/** Behavior for undefined intents. */
export const UndefinedIntentBehaviorSchema = z.enum(['ignore', 'warning', 'error']);

/** Intent validation settings. */
export const IntentSettingsSchema = z.object({
  /** How to handle undefined intents (not in _intents.yaml) */
  undefined_intent: UndefinedIntentBehaviorSchema.default('warning'),
});

/** Discovery settings for architecture lookup. */
export const DiscoverySettingsSchema = z.object({
  /** Automatically sync index when stale during discovery (default: false) */
  auto_sync: z.boolean().default(false),
});

/** Target detection mode for require_companion_call constraint. */
export const TableDetectionModeSchema = z.enum(['first_argument', 'method_chain']);

/** Target detection settings for require_companion_call constraint. */
export const TableDetectionSettingsSchema = z.object({
  /** How to extract target: first_argument (fn(TARGET)) or method_chain (obj.TARGET.method or obj.method where obj is target) */
  mode: TableDetectionModeSchema.default('first_argument'),
  /** For method_chain mode: the base receiver to look for (e.g., 'prisma', 'db') */
  receiver: z.string().optional(),
});

/** Health dashboard thresholds for bloat detection. */
export const HealthConfigSchema = z.object({
  /** Minimum Jaccard similarity to flag architectures as similar (0-1, default: 0.8) */
  similarity_threshold: z.number().min(0).max(1).default(0.8),
  /** Maximum inheritance depth before flagging (default: 4) */
  max_inheritance_depth: z.number().min(1).default(4),
  /** Maximum files to consider "low usage" (default: 2) */
  low_usage_threshold: z.number().min(0).default(2),
  /** Compare only direct constraints, excluding inherited (default: true) */
  exclude_inherited_similarity: z.boolean().default(true),
});

/** Configurable regex patterns for deep code analysis. Empty = rule disabled. */
export const AnalysisDeepPatternsSchema = z.object({
  auth_check: z.array(z.string()).default([]),
  ownership_check: z.array(z.string()).default([]),
  permission_call: z.string().default(''),
  soft_delete_filter: z.array(z.string()).default([]),
  db_query: z.array(z.string()).default([]),
  db_get: z.array(z.string()).default([]),
});
/** Spec analysis settings. */
export const AnalysisConfigSchema = z.object({
  deep_patterns: withDefaults(AnalysisDeepPatternsSchema),
  tool_entities: z.array(z.string()).default(['archcodex', 'speccodex', 'test']),
});
/** Complete config.yaml schema. */
export const ConfigSchema = z.object({
  version: z.string().default('1.0'),
  registry: z.string().optional(), // Auto-detects .arch/registry/ or .arch/registry.yaml
  files: withDefaults(FilePoliciesSchema),
  validation: withDefaults(ValidationSettingsSchema),
  hydration: withDefaults(HydrationSettingsSchema),
  pointers: withDefaults(PointerSettingsSchema),
  overrides: withDefaults(OverrideSettingsSchema),
  llm: withDefaults(LLMSettingsSchema),
  languages: withDefaults(LanguagesConfigSchema),
  packages: z.preprocess((val) => val ?? [], PackagesConfigSchema),
  layers: z.preprocess((val) => val ?? [], LayersConfigSchema),
  inference: withDefaults(InferenceSettingsSchema),
  intents: withDefaults(IntentSettingsSchema),
  discovery: withDefaults(DiscoverySettingsSchema),
  table_detection: withDefaults(TableDetectionSettingsSchema),
  health: withDefaults(HealthConfigSchema),
  analysis: withDefaults(AnalysisConfigSchema),
});

// Type exports (inferred from schemas)
export type UntaggedPolicy = z.infer<typeof UntaggedPolicySchema>;
export type FileScanPatterns = z.infer<typeof FileScanPatternsSchema>;
export type FilePolicies = z.infer<typeof FilePoliciesSchema>;
export type MissingWhyBehavior = z.infer<typeof MissingWhyBehaviorSchema>;
export type ValidationSettings = z.infer<typeof ValidationSettingsSchema>;
export type HydrationFormat = z.infer<typeof HydrationFormatSchema>;
export type HydrationSettings = z.infer<typeof HydrationSettingsSchema>;
export type PointerBasePaths = z.infer<typeof PointerBasePathsSchema>;
export type PointerSettings = z.infer<typeof PointerSettingsSchema>;
export type OverrideSettings = z.infer<typeof OverrideSettingsSchema>;
export type OutputFormat = z.infer<typeof OutputFormatSchema>;
export type PrecommitSettings = z.infer<typeof PrecommitSettingsSchema>;
export type LLMProviderConfig = z.infer<typeof LLMProviderConfigSchema>;
export type LLMSettings = z.infer<typeof LLMSettingsSchema>;
export type LanguageSettings = z.infer<typeof LanguageSettingsSchema>;
export type LanguagesConfig = z.infer<typeof LanguagesConfigSchema>;
export type PackageConfig = z.infer<typeof PackageConfigSchema>;
export type PackagesConfig = z.infer<typeof PackagesConfigSchema>;
export type LayerConfig = z.infer<typeof LayerConfigSchema>;
export type LayersConfig = z.infer<typeof LayersConfigSchema>;
export type InferenceRuleConfig = z.infer<typeof InferenceRuleConfigSchema>;
export type InferenceSettings = z.infer<typeof InferenceSettingsSchema>;
export type UndefinedIntentBehavior = z.infer<typeof UndefinedIntentBehaviorSchema>;
export type IntentSettings = z.infer<typeof IntentSettingsSchema>;
export type DiscoverySettings = z.infer<typeof DiscoverySettingsSchema>;
export type TableDetectionSettings = z.infer<typeof TableDetectionSettingsSchema>;
export type HealthConfig = z.infer<typeof HealthConfigSchema>;
export type AnalysisDeepPatterns = z.infer<typeof AnalysisDeepPatternsSchema>;
export type Config = z.infer<typeof ConfigSchema>;
