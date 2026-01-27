/**
 * @arch archcodex.cli.mcp
 * @intent:documentation-examples
 *
 * Schema data for the schema tool - shared between CLI and MCP.
 * Contains static documentation arrays for constraint rules, fields, and conditions.
 */

/**
 * Per-file constraint rules — each has a registered validator in constraints/registry.ts.
 */
export const CONSTRAINT_RULES_VALIDATED = [
  { rule: 'must_extend', param: 'string', desc: 'Class must extend a specific parent class', example: 'BaseProcessor' },
  { rule: 'implements', param: 'string', desc: 'Class must implement a specific interface', example: 'IPaymentProcessor' },
  { rule: 'forbid_import', param: 'string[]', desc: 'Block specific imports', example: '[console, http, axios]' },
  { rule: 'require_import', param: 'string[]', desc: 'Require specific imports (use match: any for OR)', example: '[@core/logger], match: any' },
  { rule: 'require_decorator', param: 'string', desc: 'Require a class decorator', example: '@Traceable' },
  { rule: 'forbid_decorator', param: 'string', desc: 'Block a specific decorator', example: '@Deprecated' },
  { rule: 'naming_pattern', param: 'regex', desc: 'Filename must match regex pattern', example: '^[A-Z].*Processor\\.ts$' },
  { rule: 'location_pattern', param: 'string', desc: 'File must be in specific path', example: 'src/processors/' },
  { rule: 'max_public_methods', param: 'number', desc: 'Limit number of public methods', example: '10' },
  { rule: 'max_file_lines', param: 'number', desc: 'Limit file length (use exclude_comments for LOC)', example: '300' },
  { rule: 'require_test_file', param: 'string[]', desc: 'Require companion test file', example: '[*.test.ts, *.spec.ts]' },
  { rule: 'importable_by', param: 'string[]', desc: 'Restrict which architectures can import (--project)', example: '[domain.payment.*, test.**]' },
  { rule: 'forbid_circular_deps', param: 'boolean', desc: 'Prevent circular imports (--project)', example: 'true' },
  { rule: 'forbid_call', param: 'string[]', desc: 'Block specific function calls', example: '[setTimeout, console.*]' },
  { rule: 'require_try_catch', param: 'around: string[]', desc: 'Require try/catch around calls', example: 'around: [fetch, api.*]' },
  { rule: 'forbid_mutation', param: 'string[]', desc: 'Block mutation of globals', example: '[process.env, window]' },
  { rule: 'require_call', param: 'string[]', desc: 'Require specific function calls', example: '[validateInput, sanitize*]' },
  { rule: 'require_pattern', param: 'pattern: regex', desc: 'Require regex pattern in content', example: 'pattern: isDeleted.*false' },
  { rule: 'forbid_pattern', param: 'pattern: regex', desc: 'Block regex pattern in content', example: 'pattern: console\\.log' },
  { rule: 'allow_pattern', param: 'pattern: regex', desc: "Override parent's forbid_pattern", example: 'pattern: console\\.log' },
  { rule: 'require_one_of', param: 'string[]', desc: 'Require at least ONE of patterns (literal, @annotation, /regex/)', example: '[isDeleted, @no-soft-delete]' },
  { rule: 'require_export', param: 'string[]', desc: 'Require specific exports', example: '[*Provider, use*]' },
  { rule: 'require_call_before', param: 'before: string[]', desc: 'Require calls before other calls', example: 'before: [ctx.db.*]' },
  { rule: 'require_companion_call', param: 'object', desc: 'Require companion calls when certain methods are invoked', example: 'target: cacheManager, operations: [set], call: save' },
  { rule: 'require_companion_file', param: 'string | object | array', desc: 'Require companion files (barrels, tests, styles, stories)', example: './index.ts or { path: "${name}.test.ts", must_export: true }' },
];

/**
 * Meta/governance rules — handled by the validation engine or project-level analyzers,
 * not by per-file constraint validators in registry.ts.
 */
export const CONSTRAINT_RULES_META = [
  { rule: 'allow_import', param: 'string[]', desc: "Override parent's forbid_import (handled inline by forbid_import validator)", example: '[axios]' },
  { rule: 'require_coverage', param: 'object', desc: 'Cross-file coverage check (--project)', example: 'source_type: string_literals, in_files: "events/*.ts"' },
  { rule: 'max_similarity', param: 'number (0-1)', desc: 'Flag files exceeding similarity threshold (DRY detection, --project)', example: '0.8' },
  { rule: 'mixin_inline_forbidden', param: 'string', desc: 'Governance warning: mixin with inline:forbidden used inline', example: 'core-tested' },
  { rule: 'mixin_inline_only', param: 'string', desc: 'Governance warning: mixin with inline:only used in registry', example: 'quick-fix' },
  { rule: 'missing_expected_intent', param: 'string', desc: 'Governance warning: file lacks an expected @intent annotation', example: 'cli-output' },
];

/**
 * All available constraint rules (validated + meta).
 */
export const CONSTRAINT_RULES = [...CONSTRAINT_RULES_VALIDATED, ...CONSTRAINT_RULES_META];

/**
 * Architecture node fields.
 */
export const ARCH_FIELDS = [
  { field: 'description', required: false, desc: 'Brief description of the architecture' },
  { field: 'rationale', required: true, desc: 'Why it exists, when to use/not use it' },
  { field: 'kind', required: false, desc: 'File intent: implementation | organizational | definition' },
  { field: 'inherits', required: false, desc: 'Parent architecture to extend' },
  { field: 'mixins', required: false, desc: 'Array of reusable trait sets to compose' },
  { field: 'constraints', required: false, desc: 'Array of enforceable rules' },
  { field: 'exclude_constraints', required: false, desc: 'Remove inherited constraints (e.g., ["forbid_import:console"])' },
  { field: 'hints', required: false, desc: 'Advisory guidance for LLMs (string or {text, example})' },
  { field: 'pointers', required: false, desc: 'References to documentation (arch://, code://)' },
  { field: 'version', required: false, desc: 'Current version (e.g., "2.0")' },
  { field: 'deprecated_from', required: false, desc: 'Version from which deprecated' },
  { field: 'migration_guide', required: false, desc: 'Pointer URI to migration guide' },
  { field: 'reference_implementations', required: false, desc: 'Example files for golden samples' },
  { field: 'file_pattern', required: false, desc: 'Naming pattern (e.g., "${name}Service.ts")' },
  { field: 'default_path', required: false, desc: 'Default path for new files' },
  { field: 'code_pattern', required: false, desc: 'Code template showing expected structure (shown in --format ai)' },
  { field: 'singleton', required: false, desc: 'Mark as singleton - intentionally used by only one file' },
  { field: 'inline', required: false, desc: 'Mixin usage mode: allowed (default) | only (must use +mixin) | forbidden (must use mixins:[])' },
  { field: 'expected_intents', required: false, desc: 'Array of @intent annotations expected for files using this architecture (warns if missing)' },
  { field: 'suggested_intents', required: false, desc: 'Array of {name, when} objects suggesting intents with usage guidance (no warning if missing)' },
];

/**
 * Constraint fields.
 */
export const CONSTRAINT_FIELDS = [
  { field: 'rule', required: true, desc: 'The constraint rule type' },
  { field: 'value', required: true, desc: 'Rule value (string, string[], or number)' },
  { field: 'severity', required: false, desc: 'error (default) or warning' },
  { field: 'category', required: false, desc: 'security | logging | structure | naming | performance | testing' },
  { field: 'why', required: false, desc: 'Human-readable explanation' },
  { field: 'when', required: false, desc: 'Conditional application (see conditions below)' },
  { field: 'applies_when', required: false, desc: 'Regex pattern - constraint only applies if pattern matches file content' },
  { field: 'unless', required: false, desc: 'Exception list: import:X, @intent:X, decorator:@X - skip if any condition met' },
  { field: 'override', required: false, desc: 'If true, replaces ALL parent constraints with same rule' },
  { field: 'alternative', required: false, desc: 'Simple alternative module/function' },
  { field: 'alternatives', required: false, desc: 'Detailed alternatives with examples' },
  { field: 'around', required: false, desc: 'For require_try_catch: patterns to wrap' },
  { field: 'before', required: false, desc: 'For require_call_before: calls that must happen before' },
  { field: 'pattern', required: false, desc: 'For require_pattern: regex to match' },
  { field: 'exclude_comments', required: false, desc: 'For max_file_lines: use LOC instead of total lines' },
  { field: 'usage', required: false, desc: 'Map of context → usage (reduces choice paralysis for multiple options)' },
  { field: 'match', required: false, desc: 'For array values: all (default, all required) or any (at least one)' },
  // Coverage constraint fields (require_coverage)
  { field: 'source_type', required: false, desc: 'For require_coverage: export_names | string_literals | file_names | union_members | object_keys' },
  { field: 'source_pattern', required: false, desc: 'For require_coverage: pattern/name to extract sources (regex for literals, type/var name for AST modes)' },
  { field: 'extract_values', required: false, desc: 'For require_coverage: regex to extract values from matched text (string_literals mode)' },
  { field: 'in_files', required: false, desc: 'For require_coverage: glob for source files' },
  { field: 'target_pattern', required: false, desc: 'For require_coverage: pattern to find handlers (${value} replaced with transformed value)' },
  { field: 'in_target_files', required: false, desc: 'For require_coverage: glob for handler files' },
  { field: 'transform', required: false, desc: 'For require_coverage: transform applied to value (${PascalCase}, ${camelCase}, ${snake_case}, ${UPPER_CASE}, ${kebab-case})' },
  // LLM-friendly structured alternatives
  { field: 'naming', required: false, desc: 'Structured naming pattern: { case: PascalCase|camelCase|snake_case|UPPER_CASE|kebab-case, prefix?, suffix?, extension? }' },
  // Documentation fields for LLM context
  { field: 'examples', required: false, desc: 'Valid examples for documentation (not used for validation)' },
  { field: 'counterexamples', required: false, desc: 'Invalid examples for documentation' },
  { field: 'intent', required: false, desc: 'Human-readable description of what the pattern checks' },
  { field: 'codeExample', required: false, desc: 'Code example showing correct usage' },
  { field: 'also_valid', required: false, desc: 'Alternative valid patterns for context-dependent cases: [{ pattern, when, codeExample? }]. Use sparingly.' },
  // require_companion_call fields
  { field: 'target', required: false, desc: 'For require_companion_call: target to match (receiver in method_chain mode)' },
  { field: 'operations', required: false, desc: 'For require_companion_call: method names that trigger the rule (e.g., [set, delete])' },
  { field: 'call', required: false, desc: 'For require_companion_call: required companion call' },
  { field: 'rules', required: false, desc: 'For require_companion_call: array of {target, operations, call} for multiple targets' },
  { field: 'location', required: false, desc: 'For require_companion_call: same_function | same_file | after (default: same_file)' },
  // require_companion_file fields
  { field: 'path', required: false, desc: 'For require_companion_file: path pattern with variables ${name}, ${name:kebab}, ${ext}, ${dir}' },
  { field: 'must_export', required: false, desc: 'For require_companion_file: if true, companion must export from source file' },
];

/**
 * Condition types for when clauses.
 */
export const CONDITIONS = [
  { condition: 'has_decorator', desc: 'Class has decorator', example: '@Controller' },
  { condition: 'has_import', desc: 'File imports module (wildcards supported)', example: 'express or @nestjs/*' },
  { condition: 'extends', desc: 'Class extends base class', example: 'BaseController' },
  { condition: 'file_matches', desc: 'File path matches glob', example: '*.controller.ts' },
  { condition: 'implements', desc: 'Class implements interface', example: 'IService' },
  { condition: 'method_has_decorator', desc: 'Method/function has decorator', example: '@Get' },
  { condition: 'not_has_decorator', desc: 'Class does NOT have decorator', example: '@Generated' },
  { condition: 'not_has_import', desc: 'File does NOT import module', example: 'convex/server' },
  { condition: 'not_extends', desc: 'Class does NOT extend', example: 'BaseEntity' },
  { condition: 'not_file_matches', desc: 'File path does NOT match', example: '**/generated/**' },
  { condition: 'not_implements', desc: 'Class does NOT implement', example: 'IMockable' },
  { condition: 'not_method_has_decorator', desc: 'No method has decorator', example: '@Test' },
];
