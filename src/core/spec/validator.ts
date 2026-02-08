/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Spec validator - validates spec files and checks implementation compliance.
 * Handles structural validation, reference checking, and example validation.
 */
import type {
  SpecRegistry,
  SpecNode,
  SpecValidationError,
  InputField,
  MixinDefinition,
} from './schema.js';
import {
  SPEC_NODE_CORE_FIELDS,
  KNOWN_EXTENSION_FIELDS,
  MIXIN_CORE_FIELDS,
} from './schema.js';
import { resolveSpec } from './resolver.js';

/**
 * Result of spec validation.
 */
export interface SpecValidationResult {
  valid: boolean;
  errors: SpecValidationError[];
  warnings: SpecValidationError[];
  stats: {
    specsChecked: number;
    mixinsChecked: number;
    examplesChecked: number;
  };
}

/**
 * Options for spec validation.
 */
export interface SpecValidateOptions {
  /** Check that all referenced mixins exist */
  checkMixinRefs?: boolean;
  /** Check that all inherited specs exist */
  checkInheritance?: boolean;
  /** Validate examples against input schemas */
  checkExamples?: boolean;
  /** Check for circular dependencies */
  checkCircular?: boolean;
  /** Strict mode - warnings become errors */
  strict?: boolean;
}

const DEFAULT_OPTIONS: SpecValidateOptions = {
  checkMixinRefs: true,
  checkInheritance: true,
  checkExamples: true,
  checkCircular: true,
  strict: false,
};

/**
 * Validate a spec registry for structural correctness.
 */
export function validateSpecRegistry(
  registry: SpecRegistry,
  options: SpecValidateOptions = {}
): SpecValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: SpecValidationError[] = [];
  const warnings: SpecValidationError[] = [];
  let examplesChecked = 0;
  const reportedCycles = new Set<string>();

  // Validate each spec node
  for (const [specId, node] of Object.entries(registry.nodes)) {
    // Check required intent field (only required for leaf specs, not base specs)
    // Base specs define required_fields/optional_fields instead of intent
    const isBaseSpec = !!(node.required_fields || node.optional_fields);
    if (!node.intent && !isBaseSpec) {
      errors.push({
        code: 'MISSING_INTENT',
        message: `Spec '${specId}' is missing required field 'intent'`,
        field: 'intent',
      });
    }

    // Check mixin references
    if (opts.checkMixinRefs && node.mixins) {
      for (const mixinRef of node.mixins) {
        const mixinId = typeof mixinRef === 'string' ? mixinRef : Object.keys(mixinRef)[0];
        if (!registry.mixins[mixinId]) {
          errors.push({
            code: 'UNKNOWN_MIXIN',
            message: `Spec '${specId}' references unknown mixin '${mixinId}'`,
            field: 'mixins',
          });
        }
      }
    }

    // Check inheritance
    if (opts.checkInheritance && node.inherits) {
      if (!registry.nodes[node.inherits]) {
        errors.push({
          code: 'UNKNOWN_PARENT',
          message: `Spec '${specId}' inherits from unknown spec '${node.inherits}'`,
          field: 'inherits',
        });
      }
    }

    // Check for circular inheritance (deduplicate: same cycle reported once)
    if (opts.checkCircular && node.inherits) {
      const cycle = detectInheritanceCycle(registry, specId);
      if (cycle) {
        const cycleKey = [...cycle].sort().join(',');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          errors.push({
            code: 'CIRCULAR_INHERITANCE',
            message: `Circular inheritance detected: ${cycle.join(' \u2192 ')}`,
            field: 'inherits',
          });
        }
      }
    }

    // Validate examples against input schema
    if (opts.checkExamples && node.examples) {
      const exampleErrors = validateExamples(specId, node);
      errors.push(...exampleErrors.errors);
      warnings.push(...exampleErrors.warnings);
      examplesChecked += exampleErrors.count;
    }

    // Check for unknown fields (schema drift prevention)
    const unknownFieldWarnings = detectUnknownFields(specId, node);
    warnings.push(...unknownFieldWarnings);

    // Best practice warnings
    if (node.goal && !node.outcomes?.length) {
      warnings.push({
        code: 'GOAL_WITHOUT_OUTCOMES',
        message: `Spec '${specId}' has a goal but no outcomes defined`,
        field: 'outcomes',
      });
    }

    if (node.security?.authentication === 'required' && !hasAuthErrorExample(node)) {
      warnings.push({
        code: 'MISSING_AUTH_ERROR_EXAMPLE',
        message: `Spec '${specId}' requires authentication but has no error example for unauthenticated access`,
        field: 'examples.errors',
      });
    }

    // Improvement #5: Warn when errors section is missing
    // Skip if spec explicitly declares 'errors: none' or is a base spec
    const hasErrorsSection = node.examples?.errors && node.examples.errors.length > 0;
    const hasExplicitNoErrors = (node.examples as Record<string, unknown>)?.errors === 'none';
    const hasExamples = node.examples?.success?.length || node.examples?.boundaries?.length;

    if (!isBaseSpec && hasExamples && !hasErrorsSection && !hasExplicitNoErrors) {
      const suggestions = suggestErrorCases(specId, node);
      warnings.push({
        code: 'MISSING_ERRORS',
        message: `Spec '${specId}' has no error cases defined${suggestions ? `. Consider: ${suggestions}` : ''}`,
        field: 'examples.errors',
      });
    }
  }

  // Validate mixins
  for (const [mixinId, mixin] of Object.entries(registry.mixins)) {
    // Check for unknown fields in mixins (schema drift prevention)
    const unknownMixinWarnings = detectUnknownMixinFields(mixinId, mixin);
    warnings.push(...unknownMixinWarnings);

    // Check composed mixin references
    if (mixin.compose) {
      for (const composedRef of mixin.compose) {
        const composedId = typeof composedRef === 'string' ? composedRef : Object.keys(composedRef)[0];
        if (!registry.mixins[composedId]) {
          errors.push({
            code: 'UNKNOWN_COMPOSED_MIXIN',
            message: `Mixin '${mixinId}' composes unknown mixin '${composedId}'`,
            field: 'compose',
          });
        }
      }
    }
  }

  // In strict mode, promote warnings to errors
  if (opts.strict) {
    errors.push(...warnings);
    warnings.length = 0;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      specsChecked: Object.keys(registry.nodes).length,
      mixinsChecked: Object.keys(registry.mixins).length,
      examplesChecked,
    },
  };
}

/**
 * Validate a single spec by ID (includes resolution).
 */
export function validateSpec(
  registry: SpecRegistry,
  specId: string,
  options: SpecValidateOptions = {}
): SpecValidationResult {
  const errors: SpecValidationError[] = [];
  const warnings: SpecValidationError[] = [];

  // Try to resolve the spec (this catches inheritance/mixin issues)
  const resolved = resolveSpec(registry, specId);
  if (!resolved.valid) {
    return {
      valid: false,
      errors: resolved.errors,
      warnings: [],
      stats: { specsChecked: 1, mixinsChecked: 0, examplesChecked: 0 },
    };
  }

  // Validate the resolved spec
  const node = resolved.spec!.node;

  // Check required fields
  if (!node.intent) {
    errors.push({
      code: 'MISSING_INTENT',
      message: `Spec '${specId}' is missing required field 'intent'`,
      field: 'intent',
    });
  }

  // Validate examples
  let examplesChecked = 0;
  if (options.checkExamples !== false && node.examples && node.inputs) {
    const exampleResult = validateExamples(specId, node);
    errors.push(...exampleResult.errors);
    warnings.push(...exampleResult.warnings);
    examplesChecked = exampleResult.count;
  }

  // Best practice checks
  if (node.goal && !node.outcomes?.length) {
    warnings.push({
      code: 'GOAL_WITHOUT_OUTCOMES',
      message: `Spec '${specId}' has a goal but no outcomes`,
      field: 'outcomes',
    });
  }

  if (options.strict) {
    errors.push(...warnings);
    warnings.length = 0;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      specsChecked: 1,
      mixinsChecked: resolved.spec!.appliedMixins.length,
      examplesChecked,
    },
  };
}

/**
 * Detect circular inheritance in spec hierarchy.
 */
function detectInheritanceCycle(
  registry: SpecRegistry,
  startId: string
): string[] | null {
  const visited = new Set<string>();
  const path: string[] = [];

  function visit(specId: string): string[] | null {
    if (visited.has(specId)) {
      const cycleStart = path.indexOf(specId);
      if (cycleStart !== -1) {
        return [...path.slice(cycleStart), specId];
      }
      return null;
    }

    visited.add(specId);
    path.push(specId);

    const node = registry.nodes[specId];
    if (node?.inherits) {
      const cycle = visit(node.inherits);
      if (cycle) return cycle;
    }

    path.pop();
    return null;
  }

  return visit(startId);
}

/**
 * Validate examples against input schema.
 */
function validateExamples(
  specId: string,
  node: SpecNode
): { errors: SpecValidationError[]; warnings: SpecValidationError[]; count: number } {
  const errors: SpecValidationError[] = [];
  const warnings: SpecValidationError[] = [];
  let count = 0;

  const allExamples = [
    ...(node.examples?.success || []).map((e, i) => ({ example: e, type: 'success', index: i })),
    ...(node.examples?.errors || []).map((e, i) => ({ example: e, type: 'errors', index: i })),
    ...(node.examples?.warnings || []).map((e, i) => ({ example: e, type: 'warnings', index: i })),
  ];

  for (const { example, type, index } of allExamples) {
    count++;

    // Check example has a 'then' assertion
    if (!example.then) {
      errors.push({
        code: 'EXAMPLE_INCOMPLETE',
        message: `Spec '${specId}' ${type}[${index}] has no 'then' assertion`,
        field: `examples.${type}[${index}]`,
      });
    }

    // Validate 'given' fields against input schema
    if (example.given && node.inputs) {
      for (const [field, value] of Object.entries(example.given)) {
        // Skip special fields like 'user', '<<' (anchor merge)
        if (field === 'user' || field === '<<' || field.startsWith('@')) continue;

        const inputDef = node.inputs[field];
        if (!inputDef) {
          // Unknown field - could be intentional for testing invalid inputs
          if (type === 'success') {
            errors.push({
              code: 'UNKNOWN_INPUT_FIELD',
              message: `Spec '${specId}' ${type}[${index}] uses unknown input field '${field}'`,
              field: `examples.${type}[${index}].given.${field}`,
            });
          }
        } else {
          // Type check the value
          const typeError = checkInputType(field, value, inputDef);
          if (typeError && type === 'success') {
            errors.push({
              code: 'EXAMPLE_TYPE_MISMATCH',
              message: `Spec '${specId}' ${type}[${index}]: ${typeError}`,
              field: `examples.${type}[${index}].given.${field}`,
            });
          }
        }
      }

      // Check required fields are present in success examples
      // Skip if example uses YAML anchor merge (<<:) since we can't validate merged values
      const usesAnchorMerge = example.given && '<<' in example.given;
      if (type === 'success' && !usesAnchorMerge) {
        for (const [field, inputDef] of Object.entries(node.inputs)) {
          if (inputDef.required && !example.given?.[field]) {
            errors.push({
              code: 'MISSING_REQUIRED_INPUT',
              message: `Spec '${specId}' ${type}[${index}] is missing required input '${field}'`,
              field: `examples.${type}[${index}].given.${field}`,
            });
          }
        }
      }
    }
  }

  return { errors, warnings, count };
}

/**
 * Check if a value matches the expected input type.
 */
function checkInputType(
  field: string,
  value: unknown,
  inputDef: InputField
): string | null {
  // Handle null/undefined
  if (value === null || value === undefined) {
    if (inputDef.required) {
      return `Field '${field}' is required but got ${value}`;
    }
    return null;
  }

  // Handle special test values (e.g., "@authenticated", "@no_access")
  if (typeof value === 'string' && value.startsWith('@')) {
    return null; // Test fixture reference
  }

  const actualType = Array.isArray(value) ? 'array' : typeof value;

  switch (inputDef.type) {
    case 'string':
      if (actualType !== 'string') {
        return `Field '${field}' expected string, got ${actualType}`;
      }
      if (inputDef.max && (value as string).length > inputDef.max) {
        return `Field '${field}' exceeds max length ${inputDef.max}`;
      }
      if (inputDef.min && (value as string).length < inputDef.min) {
        return `Field '${field}' below min length ${inputDef.min}`;
      }
      break;

    case 'number':
      if (actualType !== 'number') {
        return `Field '${field}' expected number, got ${actualType}`;
      }
      if (inputDef.max !== undefined && (value as number) > inputDef.max) {
        return `Field '${field}' exceeds max value ${inputDef.max}`;
      }
      if (inputDef.min !== undefined && (value as number) < inputDef.min) {
        return `Field '${field}' below min value ${inputDef.min}`;
      }
      break;

    case 'boolean':
      if (actualType !== 'boolean') {
        return `Field '${field}' expected boolean, got ${actualType}`;
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return `Field '${field}' expected array, got ${actualType}`;
      }
      break;

    case 'object':
      if (actualType !== 'object' || Array.isArray(value)) {
        return `Field '${field}' expected object, got ${actualType}`;
      }
      break;

    case 'id':
      if (actualType !== 'string') {
        return `Field '${field}' expected id (string), got ${actualType}`;
      }
      break;

    case 'enum':
      if (inputDef.values && !inputDef.values.includes(value as string)) {
        return `Field '${field}' value '${value}' not in allowed values: ${inputDef.values.join(', ')}`;
      }
      break;
  }

  return null;
}

/**
 * Suggest common error cases based on spec structure.
 * Improvement #5: Help spec authors identify missing error cases.
 */
function suggestErrorCases(_specId: string, node: SpecNode): string | null {
  const suggestions: string[] = [];

  // Check for authentication requirement
  if (node.security?.authentication === 'required') {
    suggestions.push('NOT_AUTHENTICATED (user: null)');
  }

  // Check for permission requirements
  if (node.security?.permissions?.length) {
    suggestions.push('PERMISSION_DENIED (insufficient permissions)');
  }

  // Check for rate limiting
  if (node.security?.rate_limit) {
    suggestions.push('RATE_LIMITED (exceeded rate limit)');
  }

  // Check for input validation
  if (node.inputs) {
    for (const [field, inputDef] of Object.entries(node.inputs)) {
      // Required field → missing input error
      if (inputDef.required) {
        suggestions.push(`MISSING_${field.toUpperCase()} (${field} is required)`);
      }

      // URL validation → invalid URL error
      if (inputDef.validate === 'url') {
        suggestions.push(`INVALID_URL (invalid ${field} format)`);
      }

      // Email validation → invalid email error
      if (inputDef.validate === 'email') {
        suggestions.push(`INVALID_EMAIL (invalid ${field} format)`);
      }

      // ID type with table → not found error
      if (inputDef.type === 'id' && inputDef.table) {
        suggestions.push(`${inputDef.table.toUpperCase()}_NOT_FOUND (${field} does not exist)`);
      }

      // String with max length → too long error
      if (inputDef.type === 'string' && inputDef.max) {
        suggestions.push(`${field.toUpperCase()}_TOO_LONG (exceeds ${inputDef.max} chars)`);
      }

      // Number with min/max → out of range error
      if (inputDef.type === 'number' && (inputDef.min !== undefined || inputDef.max !== undefined)) {
        suggestions.push(`${field.toUpperCase()}_OUT_OF_RANGE`);
      }

      // Enum type → invalid value error
      if (inputDef.type === 'enum') {
        suggestions.push(`INVALID_${field.toUpperCase()} (not in allowed values)`);
      }
    }
  }

  // Limit suggestions to most relevant ones
  if (suggestions.length === 0) {
    return null;
  }

  // Return top 3 most common error types
  const prioritized = suggestions.slice(0, 3);
  return prioritized.join(', ');
}

/**
 * Check if spec has an error example for unauthenticated access.
 */
function hasAuthErrorExample(node: SpecNode): boolean {
  if (!node.examples?.errors) return false;

  return node.examples.errors.some((example) => {
    // Check for user: null or then.error containing "AUTH"
    const hasExplicitNullUser = example.given !== undefined && 'user' in example.given && example.given.user === null;
    const hasAuthError =
      example.then?.error?.toString().includes('AUTH') ||
      example.then?.['error.code']?.toString().includes('AUTH');
    return hasExplicitNullUser || hasAuthError;
  });
}

/**
 * Detect unknown fields in a spec node that may indicate LLM schema drift.
 * Returns warnings for fields not in the schema.
 */
export function detectUnknownFields(
  specId: string,
  node: SpecNode
): SpecValidationError[] {
  const warnings: SpecValidationError[] = [];

  for (const field of Object.keys(node)) {
    if (!SPEC_NODE_CORE_FIELDS.has(field) && !KNOWN_EXTENSION_FIELDS.has(field)) {
      const suggestion = suggestAlternative(field);
      warnings.push({
        code: 'UNKNOWN_FIELD',
        message: `Spec '${specId}' has unknown field '${field}'. ${suggestion}`,
        field,
      });
    }
  }

  return warnings;
}

/**
 * Detect unknown fields in a mixin definition.
 */
export function detectUnknownMixinFields(
  mixinId: string,
  mixin: MixinDefinition
): SpecValidationError[] {
  const warnings: SpecValidationError[] = [];

  for (const field of Object.keys(mixin)) {
    if (!MIXIN_CORE_FIELDS.has(field) && !KNOWN_EXTENSION_FIELDS.has(field)) {
      const suggestion = suggestAlternative(field);
      warnings.push({
        code: 'UNKNOWN_MIXIN_FIELD',
        message: `Mixin '${mixinId}' has unknown field '${field}'. ${suggestion}`,
        field,
      });
    }
  }

  return warnings;
}

/**
 * Suggest alternatives for common drift patterns.
 * Helps LLMs understand which existing constructs to use.
 */
export function suggestAlternative(field: string): string {
  const suggestions: Record<string, string> = {
    // Common drift patterns from LLMs
    'metadata': 'Use invariants for constraints, effects for side effects',
    'copied_fields': 'Use invariants: { condition: "result.x === original.x" }',
    'reset_fields': 'Use invariants: { condition: "result.x === undefined" }',
    'field_handling': 'Use invariants to describe field behavior',
    'validation': 'Use inputs with validate option, or invariants',
    'rules': 'Use invariants section for rules',
    'constraints': 'Use invariants section for constraints',
    'preconditions': 'Use invariants with description like "before: ..."',
    'postconditions': 'Use invariants or effects section',
    'state': 'Use ui.interaction.states for UI state, or invariants for data state',
    'transitions': 'Use ui.interaction.sequence for UI transitions',
    'behavior': 'Use invariants for behavioral contracts',
    'schema': 'Use inputs and outputs to define the schema',
    'tests': 'Use examples section with success/errors/boundaries',
    'scenarios': 'Use examples section with success/errors/boundaries',
    'cases': 'Use examples section with success/errors/boundaries',
  };

  const suggestion = suggestions[field.toLowerCase()];
  if (suggestion) {
    return suggestion;
  }

  // Generic guidance
  return 'Consider using: invariants (constraints), effects (side effects), ui (interactions), or examples (test cases)';
}

/**
 * Get summary of validation results.
 */
export function formatValidationSummary(result: SpecValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(`✓ Validation passed`);
  } else {
    lines.push(`✗ Validation failed with ${result.errors.length} error(s)`);
  }

  if (result.warnings.length > 0) {
    lines.push(`  ${result.warnings.length} warning(s)`);
  }

  lines.push(`  Specs: ${result.stats.specsChecked}, Mixins: ${result.stats.mixinsChecked}, Examples: ${result.stats.examplesChecked}`);

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const err of result.errors) {
      lines.push(`  [${err.code}] ${err.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warn of result.warnings) {
      lines.push(`  [${warn.code}] ${warn.message}`);
    }
  }

  return lines.join('\n');
}
