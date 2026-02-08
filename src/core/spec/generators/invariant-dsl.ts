/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Invariant DSL parsing, validation, and metadata extraction for SpecCodex.
 * Provides strict DSL syntax parsing for invariants (condition, field assertion,
 * forall, exists) and structured metadata extraction for analysis tools.
 *
 * Based on spec.speccodex.invariantDSL:
 * - Strict DSL patterns only (no natural language)
 * - LLM-friendly error messages with hints
 * - Structured metadata for invariant analysis
 */
import type {
  Invariant,
  ForallInvariant,
  ExistsInvariant,
} from '../schema.js';
import { isPlaceholder, expandPlaceholder, isPlaceholderError } from '../placeholders.js';

// =============================================================================
// INVARIANT DSL ERROR TYPES (from spec.speccodex.invariantDSL.errors)
// =============================================================================

/**
 * Error returned when invariant parsing fails.
 * Provides LLM-friendly hints for correction.
 */
export interface InvariantParseError {
  code: 'INVALID_INVARIANT_SYNTAX' | 'INVALID_FORALL_SYNTAX' | 'INVALID_EXISTS_SYNTAX' | 'UNKNOWN_PLACEHOLDER' | 'INVALID_CONDITION_EXPRESSION';
  message: string;
  hint: string;
  suggestions?: string[];
}

/**
 * Result of invariant parsing - either success or error.
 */
export type InvariantParseResult =
  | { success: true; testName: string; assertion: string }
  | { success: false; error: InvariantParseError };

/**
 * Error templates from spec.speccodex.invariantDSL.errors
 */
const INVARIANT_ERROR_TEMPLATES = {
  INVALID_INVARIANT_SYNTAX: {
    message: (input: string) => `Unrecognized invariant syntax: '${input.slice(0, 50)}${input.length > 50 ? '...' : ''}'`,
    hint: `Use one of these DSL patterns:

1. JavaScript condition:
   { condition: "result === expectedValue" }

2. Field assertion with placeholder:
   { "result.field": "@gt(0)" }

3. Loop assertion:
   { forall: { variable: "item", in: "result.items", then: { "item.valid": true } } }`,
  },
  INVALID_FORALL_SYNTAX: {
    message: (field: string) => `Invalid forall invariant: missing '${field}'`,
    hint: `forall requires: variable, in, and then

Example:
  forall:
    variable: item
    in: result.items
    then: { "item.status": "active" }`,
  },
  INVALID_EXISTS_SYNTAX: {
    message: (field: string) => `Invalid exists invariant: missing '${field}'`,
    hint: `exists requires: variable, in, and where

Example:
  exists:
    variable: item
    in: result.items
    where: { "item.status": "active" }`,
  },
  UNKNOWN_PLACEHOLDER: {
    message: (placeholder: string) => `Unknown placeholder: '${placeholder}'`,
    hint: `Available placeholders:
- @gt(n), @gte(n), @lt(n), @lte(n), @between(min, max)
- @exists, @defined, @undefined, @empty
- @contains(s), @matches(regex)
- @length(n), @hasItem(obj)
- @type(t), @all(...), @any(...)`,
  },
  INVALID_CONDITION_EXPRESSION: {
    message: (expr: string) => `Invalid JavaScript expression in condition: '${expr}'`,
    hint: `The condition must be a valid JavaScript expression.

Examples:
- { condition: "result === input.a * input.b" }
- { condition: "result.success || result.errors.length > 0" }
- { condition: "Array.isArray(result.items)" }`,
  },
};

/**
 * Create an invariant parse error with LLM-friendly hints.
 */
function createInvariantError(
  code: InvariantParseError['code'],
  param: string,
  suggestions?: string[]
): InvariantParseError {
  const template = INVARIANT_ERROR_TEMPLATES[code];
  return {
    code,
    message: template.message(param),
    hint: template.hint,
    suggestions,
  };
}

// =============================================================================
// STRUCTURED INVARIANT METADATA (from spec.speccodex.invariants.structured)
// =============================================================================

/**
 * Type classification for invariants.
 * - assertion: Field-level assertion with placeholder (e.g., { "result.x": "@gt(0)" })
 * - forall: Universal quantifier over a collection
 * - exists: Existential quantifier over a collection
 * - condition: JavaScript expression condition
 * - note: Non-testable prose note
 */
export type InvariantType = 'assertion' | 'forall' | 'exists' | 'condition' | 'note';

/**
 * Structured metadata for a parsed invariant.
 * Enables analysis tools to understand invariant structure without re-parsing.
 */
export interface StructuredInvariant {
  /** Type classification */
  type: InvariantType;
  /** Whether this invariant can generate automated tests */
  testable: boolean;
  /** JSONPath to the asserted field (for assertion type) */
  path?: string;
  /** Loop variable name (for forall/exists) */
  variable?: string;
  /** Collection path being iterated (for forall/exists) */
  collection?: string;
  /** Whether a filter/where clause is present (for forall/exists) */
  hasFilter?: boolean;
  /** Human-readable description if provided */
  description?: string;
  /** The condition expression (for condition type) */
  condition?: string;
}

/**
 * Statistics about parsed invariants.
 */
export interface InvariantStats {
  /** Total number of invariants */
  total: number;
  /** Number of testable invariants */
  testable: number;
  /** Count by invariant type */
  byType: Record<InvariantType, number>;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if an invariant is a forall invariant.
 */
function isForallInvariant(invariant: Invariant): invariant is ForallInvariant {
  return typeof invariant === 'object' && invariant !== null && 'forall' in invariant;
}

/**
 * Check if an invariant is an exists invariant.
 */
function isExistsInvariant(invariant: Invariant): invariant is ExistsInvariant {
  return typeof invariant === 'object' && invariant !== null && 'exists' in invariant;
}

// =============================================================================
// INVARIANT PARSING (STRICT DSL)
// =============================================================================

/**
 * Parse an invariant into test name and assertion.
 * Wraps parseInvariantStrict with backwards-compatible error handling.
 */
export function parseInvariant(invariant: Invariant): { testName: string; assertion: string } {
  const result = parseInvariantStrict(invariant);
  if (result.success) {
    return { testName: result.testName, assertion: result.assertion };
  }
  // For backwards compatibility during transition, return a failing assertion
  // This makes invalid invariants visible in test output
  return {
    testName: `INVALID: ${result.error.message}`,
    assertion: `throw new Error(${JSON.stringify(result.error.message + '\\n\\nHint:\\n' + result.error.hint)});`,
  };
}

/**
 * Parse an invariant with strict DSL validation.
 * Returns structured error for invalid patterns.
 *
 * STRICT MODE: Natural language invariants are no longer supported.
 * Use one of the DSL patterns:
 *
 * 1. { condition: "result === input.a * input.b" } - JavaScript expression
 * 2. { "result.field": "@gt(0)" } - Field assertion with placeholder
 * 3. { forall: { variable: "item", in: "result.items", then: {...} } } - Loop
 * 4. { exists: { variable: "item", in: "result.items", then: {...} } } - Exists
 *
 * @see spec.speccodex.invariantDSL for full documentation
 */
export function parseInvariantStrict(invariant: Invariant): InvariantParseResult {
  // Handle forall invariant
  if (isForallInvariant(invariant)) {
    return parseForallInvariantStrict(invariant);
  }

  // Handle exists invariant
  if (isExistsInvariant(invariant)) {
    return parseExistsInvariantStrict(invariant);
  }

  // STRICT: String invariants are NOT allowed - must use { condition: "..." }
  if (typeof invariant === 'string') {
    return {
      success: false,
      error: createInvariantError('INVALID_INVARIANT_SYNTAX', invariant),
    };
  }

  // Object invariant - check for valid DSL formats
  const invariantObj = invariant as Record<string, unknown>;

  // Extract metadata fields (not assertions)
  const description = typeof invariantObj.description === 'string'
    ? invariantObj.description
    : undefined;

  // Filter out metadata keys to get assertion entries
  const metadataKeys = new Set(['description']);
  const entries = Object.entries(invariant).filter(([k]) => !metadataKeys.has(k));

  if (entries.length === 0) {
    return { success: true, testName: description || 'unnamed invariant', assertion: 'expect(true).toBe(true);' };
  }

  // Check for condition field (may be combined with description)
  // Format: { description: "Human readable", condition: "result.x === input.y" }
  if ('condition' in invariantObj && typeof invariantObj.condition === 'string') {
    const condition = invariantObj.condition;
    const testName = description
      ? `condition: ${description}`
      : `condition: ${condition.length > 50 ? condition.slice(0, 47) + '...' : condition}`;
    // The condition is a JS expression - wrap in expect().toBe(true)
    return {
      success: true,
      testName,
      assertion: `expect(${condition}).toBe(true);`,
    };
  }

  // Process ALL field assertion entries (not just the first one)
  const assertions: string[] = [];
  const testNameParts: string[] = [];

  for (const [key, value] of entries) {
    const varPath = keyToVarPath(key);

    // Check for placeholder assertions: { "result.field": "@gt(0)" }
    if (isPlaceholder(value)) {
      const placeholderResult = expandPlaceholder(value as string);
      if (isPlaceholderError(placeholderResult)) {
        return {
          success: false,
          error: createInvariantError('UNKNOWN_PLACEHOLDER', value as string, placeholderResult.suggestions),
        };
      }
      if (placeholderResult.type === 'assertion') {
        assertions.push(placeholderToAssertion(placeholderResult, varPath));
        testNameParts.push(`${key} ${placeholderResult.asserts}`);
        continue;
      }
    }

    // Known assertion types (backwards compat)
    if (value === 'valid_url') {
      assertions.push(`expect(isValidUrl(${varPath})).toBe(true);`);
      testNameParts.push(`${key} is always a valid URL`);
      continue;
    }

    if (typeof value === 'string' && value.startsWith('equals(')) {
      const match = value.match(/equals\((.+)\)/);
      if (match) {
        assertions.push(`expect(${varPath}).toBe(${match[1]});`);
        testNameParts.push(`${key} equals ${match[1]}`);
        continue;
      }
    }

    // Literal equality check: { "result.field": true } or { "result.count": 5 }
    assertions.push(`expect(${varPath}).toBe(${JSON.stringify(value)});`);
    testNameParts.push(`${key} is ${JSON.stringify(value)}`);
  }

  // Use description as test name if provided, otherwise combine field names
  const testName = description || testNameParts.join(', ');
  const assertion = assertions.join('\n      ');

  return {
    success: true,
    testName,
    assertion,
  };
}

/**
 * Parse a forall invariant with strict validation.
 */
function parseForallInvariantStrict(invariant: ForallInvariant): InvariantParseResult {
  const { variable, in: collection, then: thenClause } = invariant.forall;

  // Validate required fields
  if (!variable) {
    return { success: false, error: createInvariantError('INVALID_FORALL_SYNTAX', 'variable') };
  }
  if (!collection) {
    return { success: false, error: createInvariantError('INVALID_FORALL_SYNTAX', 'in') };
  }
  if (!thenClause) {
    return { success: false, error: createInvariantError('INVALID_FORALL_SYNTAX', 'then') };
  }

  // Use existing forall parsing logic
  const result = parseForallInvariant(invariant);
  return { success: true, testName: result.testName, assertion: result.assertion };
}

/**
 * Parse an exists invariant with strict validation.
 * Note: exists uses 'where' (not 'then') for the condition.
 * where is OPTIONAL - if not provided, checks that collection is non-empty.
 */
function parseExistsInvariantStrict(invariant: ExistsInvariant): InvariantParseResult {
  const { variable, in: collection } = invariant.exists;

  // Validate required fields (where is optional)
  if (!variable) {
    return { success: false, error: createInvariantError('INVALID_EXISTS_SYNTAX', 'variable') };
  }
  if (!collection) {
    return { success: false, error: createInvariantError('INVALID_EXISTS_SYNTAX', 'in') };
  }
  // where is now OPTIONAL - simple existence checks don't require it

  // Use existing exists parsing logic (handles optional where)
  const result = parseExistsInvariant(invariant);
  return { success: true, testName: result.testName, assertion: result.assertion };
}

// =============================================================================
// INVARIANT METADATA EXTRACTION
// =============================================================================

/**
 * Parse an invariant and extract structured metadata.
 * This is a non-destructive analysis that doesn't generate test code.
 *
 * @param invariant The invariant to analyze
 * @returns Structured metadata about the invariant
 */
export function parseInvariantMetadata(invariant: Invariant): StructuredInvariant {
  // Handle forall invariant
  if (isForallInvariant(invariant)) {
    const { variable, in: collection, where } = invariant.forall;
    const description = typeof (invariant as Record<string, unknown>).description === 'string'
      ? (invariant as Record<string, unknown>).description as string
      : undefined;
    return {
      type: 'forall',
      testable: true,
      variable,
      collection,
      hasFilter: where !== undefined && Object.keys(where).length > 0,
      description,
    };
  }

  // Handle exists invariant
  if (isExistsInvariant(invariant)) {
    const { variable, in: collection, where } = invariant.exists;
    const description = typeof (invariant as Record<string, unknown>).description === 'string'
      ? (invariant as Record<string, unknown>).description as string
      : undefined;
    return {
      type: 'exists',
      testable: true,
      variable,
      collection,
      hasFilter: where !== undefined && Object.keys(where).length > 0,
      description,
    };
  }

  // String invariants are now invalid - treat as notes
  if (typeof invariant === 'string') {
    return {
      type: 'note',
      testable: false,
      description: invariant,
    };
  }

  // Object invariant - determine type
  const invariantObj = invariant as Record<string, unknown>;
  const description = typeof invariantObj.description === 'string'
    ? invariantObj.description
    : undefined;

  // Check for condition field
  if ('condition' in invariantObj && typeof invariantObj.condition === 'string') {
    return {
      type: 'condition',
      testable: true,
      condition: invariantObj.condition,
      description,
    };
  }

  // Check for note field (explicit non-testable)
  if ('note' in invariantObj) {
    return {
      type: 'note',
      testable: false,
      description: typeof invariantObj.note === 'string' ? invariantObj.note : description,
    };
  }

  // Filter out metadata keys to find assertion entries
  const metadataKeys = new Set(['description', 'note']);
  const entries = Object.entries(invariantObj).filter(([k]) => !metadataKeys.has(k));

  if (entries.length === 0) {
    return {
      type: 'note',
      testable: false,
      description,
    };
  }

  // Field assertion: { "result.field": "@gt(0)" } or { "result.field": true }
  const [path, value] = entries[0];
  const isTestable = isPlaceholder(value) || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';

  return {
    type: 'assertion',
    testable: isTestable,
    path,
    description,
  };
}

/**
 * Calculate statistics from a list of structured invariants.
 */
export function calculateInvariantStats(invariants: StructuredInvariant[]): InvariantStats {
  const byType: Record<InvariantType, number> = {
    assertion: 0,
    forall: 0,
    exists: 0,
    condition: 0,
    note: 0,
  };

  let testable = 0;
  for (const inv of invariants) {
    byType[inv.type]++;
    if (inv.testable) testable++;
  }

  return {
    total: invariants.length,
    testable,
    byType,
  };
}

// =============================================================================
// FORALL / EXISTS PARSING
// =============================================================================

/**
 * Parse a forall invariant into test name and assertion.
 *
 * Example:
 *   forall:
 *     variable: item
 *     in: result.items
 *     then: { item.status: "active" }
 *
 * Generates:
 *   for (const item of result.items) {
 *     expect(item.status).toBe("active");
 *   }
 */
function parseForallInvariant(invariant: ForallInvariant): { testName: string; assertion: string } {
  const { variable, in: collection, then: thenClause, where } = invariant.forall;

  // Generate test name
  const conditionStr = Object.entries(thenClause)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
  const testName = `forall ${variable} in ${collection}${where ? ' (filtered)' : ''}: ${conditionStr}`;

  // Generate assertions for the then clause
  const assertions: string[] = [];
  for (const [key, value] of Object.entries(thenClause)) {
    // Replace variable reference with the loop variable
    const fieldPath = key.replace(new RegExp(`^${variable}\\.`), `${variable}.`);
    const assertion = generateThenAssertion(fieldPath, value, variable);
    assertions.push(assertion);
  }

  // Build the loop code
  const collectionPath = collection.startsWith('result.')
    ? collection
    : `result.${collection}`;

  let code: string;
  if (where) {
    // Filtered forall - expand placeholders in where clause
    const filterConditions = Object.entries(where)
      .map(([k, v]) => {
        const fieldPath = k.replace(new RegExp(`^${variable}\\.`), `${variable}.`);
        // Check if value is a placeholder and expand it
        if (isPlaceholder(v)) {
          const result = expandPlaceholder(v as string);
          if (!isPlaceholderError(result) && result.type === 'assertion') {
            return generateExistsCondition(fieldPath, result, variable);
          }
        }
        return `${fieldPath} === ${JSON.stringify(v)}`;
      })
      .join(' && ');
    code = `for (const ${variable} of ${collectionPath}.filter(${variable} => ${filterConditions})) {\n        ${assertions.join('\n        ')}\n      }`;
  } else {
    code = `for (const ${variable} of ${collectionPath}) {\n        ${assertions.join('\n        ')}\n      }`;
  }

  return { testName, assertion: code };
}

/**
 * Parse an exists invariant into test name and assertion.
 *
 * Example:
 *   exists:
 *     variable: item
 *     in: result.items
 *     where: { item.status: "active" }
 *
 * Generates:
 *   expect(result.items.some(item => item.status === "active")).toBe(true);
 */
function parseExistsInvariant(invariant: ExistsInvariant): { testName: string; assertion: string } {
  const { variable, in: collection, where } = invariant.exists;

  const collectionPath = collection.startsWith('result.')
    ? collection
    : `result.${collection}`;

  // Handle simple existence check (no where clause)
  if (!where || Object.keys(where).length === 0) {
    const testName = `exists ${variable} in ${collection}`;
    const assertion = `expect(${collectionPath}.length).toBeGreaterThan(0);`;
    return { testName, assertion };
  }

  // Generate test name with conditions
  const conditionStr = Object.entries(where)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
  const testName = `exists ${variable} in ${collection} where ${conditionStr}`;

  // Generate the condition for .some()
  const conditions = Object.entries(where)
    .map(([key, value]) => {
      const fieldPath = key.replace(new RegExp(`^${variable}\\.`), `${variable}.`);
      if (isPlaceholder(value)) {
        const result = expandPlaceholder(value as string);
        if (!isPlaceholderError(result) && result.type === 'assertion') {
          return generateExistsCondition(fieldPath, result, variable);
        }
      }
      return `${fieldPath} === ${JSON.stringify(value)}`;
    })
    .join(' && ');

  const assertion = `expect(${collectionPath}.some(${variable} => ${conditions})).toBe(true);`;

  return { testName, assertion };
}

// =============================================================================
// ASSERTION GENERATION HELPERS
// =============================================================================

/**
 * Generate an assertion for a then clause value.
 */
function generateThenAssertion(fieldPath: string, value: unknown, _variable: string): string {
  if (isPlaceholder(value)) {
    const result = expandPlaceholder(value as string);
    if (!isPlaceholderError(result) && result.type === 'assertion') {
      return placeholderToAssertion(result, fieldPath);
    }
  }

  // Simple equality
  return `expect(${fieldPath}).toBe(${JSON.stringify(value)});`;
}

/**
 * Generate a condition expression for exists check.
 * Supports all placeholder assertion types.
 */
function generateExistsCondition(
  fieldPath: string,
  result: { type: string; asserts?: string; value?: unknown; min?: number; max?: number },
  _variable: string
): string {
  switch (result.asserts) {
    // Basic checks
    case 'defined':
      return `${fieldPath} !== undefined`;
    case 'undefined':
      return `${fieldPath} === undefined`;
    case 'exists':
      return `${fieldPath} != null`;
    case 'empty':
      return `${fieldPath}.length === 0`;

    // Comparison checks
    case 'lessThan':
      return `${fieldPath} < ${result.value}`;
    case 'greaterThan':
      return `${fieldPath} > ${result.value}`;
    case 'lessThanOrEqual':
      return `${fieldPath} <= ${result.value}`;
    case 'greaterThanOrEqual':
      return `${fieldPath} >= ${result.value}`;
    case 'between':
      return `${fieldPath} >= ${result.min} && ${fieldPath} <= ${result.max}`;

    // String/array checks
    case 'contains':
      return `${fieldPath}.includes(${JSON.stringify(result.value)})`;
    case 'matches':
      return `/${(result as { pattern?: string }).pattern}/.test(${fieldPath})`;
    case 'length':
      return `${fieldPath}.length === ${result.value}`;

    // Type check
    case 'type':
      if (result.value === 'array') {
        return `Array.isArray(${fieldPath})`;
      }
      return `typeof ${fieldPath} === ${JSON.stringify(result.value)}`;

    // Cross-field reference
    case 'ref':
      // @ref(input.filterStatus) -> fieldPath === input.filterStatus
      return `${fieldPath} === ${result.value}`;

    default:
      return `${fieldPath} !== undefined`;
  }
}

/**
 * Convert a placeholder result to an assertion string.
 * Supports all placeholder assertion types from placeholders.ts
 */
export function placeholderToAssertion(
  result: { type: string; asserts?: string; value?: unknown; pattern?: string; min?: number; max?: number; nested?: unknown[] },
  varPath: string
): string {
  switch (result.asserts) {
    // Basic assertions
    case 'defined':
      return `expect(${varPath}).toBeDefined();`;
    case 'undefined':
      return `expect(${varPath}).toBeUndefined();`;
    case 'exists':
      return `expect(${varPath}).not.toBeNull();`;
    case 'created':
      return `expect(${varPath}).toBeDefined();`;
    case 'empty':
      return `expect(${varPath}).toHaveLength(0);`;

    // Comparison assertions
    case 'lessThan':
      return `expect(${varPath}).toBeLessThan(${result.value});`;
    case 'greaterThan':
      return `expect(${varPath}).toBeGreaterThan(${result.value});`;
    case 'lessThanOrEqual':
      return `expect(${varPath}).toBeLessThanOrEqual(${result.value});`;
    case 'greaterThanOrEqual':
      return `expect(${varPath}).toBeGreaterThanOrEqual(${result.value});`;
    case 'between':
      return `expect(${varPath}).toBeGreaterThanOrEqual(${result.min});\n      expect(${varPath}).toBeLessThanOrEqual(${result.max});`;

    // String/array assertions
    case 'contains':
      return `expect(${varPath}).toContain(${JSON.stringify(result.value)});`;
    case 'matches':
      return `expect(${varPath}).toMatch(/${result.pattern}/);`;
    case 'length':
      return `expect(${varPath}).toHaveLength(${result.value});`;

    // Type assertions
    case 'type':
      if (result.value === 'array') {
        return `expect(Array.isArray(${varPath})).toBe(true);`;
      }
      return `expect(typeof ${varPath}).toBe(${JSON.stringify(result.value)});`;

    // Object/array content assertions
    case 'hasItem':
      if (typeof result.value === 'object') {
        return `expect(${varPath}).toEqual(expect.arrayContaining([expect.objectContaining(${JSON.stringify(result.value)})]));`;
      }
      return `expect(${varPath}).toContain(${JSON.stringify(result.value)});`;
    case 'hasItemNumber':
      return `expect(${varPath}).toContain(${result.value});`;
    case 'hasProperties':
      return `expect(${varPath}).toMatchObject(${JSON.stringify(result.value)});`;
    case 'oneOf':
      return `expect(${JSON.stringify(result.value)}).toContain(${varPath});`;

    // Composite assertions - generate multiple lines
    case 'all':
    case 'any': {
      // Check for nested assertions in either 'nested' or 'value' (placeholders use 'value')
      const nestedAssertions = result.nested || (Array.isArray(result.value) ? result.value : null);
      if (Array.isArray(nestedAssertions)) {
        const assertionLines = nestedAssertions.map((nested: unknown) => {
          if (typeof nested === 'object' && nested !== null && 'asserts' in nested) {
            return placeholderToAssertion(nested as { type: string; asserts?: string; value?: unknown }, varPath);
          }
          return `expect(${varPath}).toBeDefined();`;
        });
        return assertionLines.join('\n      ');
      }
      return `expect(${varPath}).toBeDefined();`;
    }

    case 'not':
      // For negation, we'd need more context - default to truthy check
      return `expect(${varPath}).toBeTruthy();`;

    default:
      return `expect(${varPath}).toBeDefined();`;
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Convert a key like "result.url" to a variable path.
 */
function keyToVarPath(key: string): string {
  if (key === 'result' || key === 'result.valid') return 'result';
  if (key.startsWith('result.')) {
    return `result.${key.slice(7)}`;
  }
  return key;
}
