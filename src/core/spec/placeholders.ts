/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Placeholder expander for SpecCodex.
 * Expands @ placeholders in spec examples into concrete test values.
 *
 * Placeholder vocabulary:
 * - @authenticated     - Valid user context (built-in fixture)
 * - @no_access         - User without permission (built-in fixture)
 * - @admin_user        - Admin user with full permissions (built-in fixture)
 * - @fixtureName       - Project-defined fixture from _fixtures.yaml
 * - @string(N)         - String of length N
 * - @url(N)            - Valid URL of approximately length N
 * - @number(min, max)  - Random number between min and max
 * - @array(N, template)- Array of N items with template expanded
 * - @now               - Current timestamp
 * - @now(-1d)          - Timestamp offset (supports d/h/m/s)
 * - @created           - Assertion: successful creation
 * - @exists            - Assertion: non-null value
 * - @defined           - Assertion: value is defined
 * - @undefined         - Assertion: value is undefined
 * - @contains('x')     - Assertion: string contains x
 * - @lt(N)             - Assertion: less than N
 * - @gt(N)             - Assertion: greater than N
 * - @matches('regex')  - Assertion: matches regex pattern
 * - @hasItem({...})    - Assertion: array contains object matching properties
 * - @hasItem('x')      - Assertion: array contains string x
 * - @hasProperties({}) - Assertion: object has matching properties (for non-arrays)
 * - @all(a, b, ...)    - Assertion: all nested assertions pass
 * - @and(a, b)         - Alias for @all
 * - @oneOf([...])      - Assertion: value is one of the specified values
 * - @length(N)         - Assertion: array/string has length N
 */

import type { FixtureContext as FixtureResolverContext, FixtureRegistry } from './fixtures.js';
import { isFixtureReference, parseFixtureReference, resolveFixture } from './fixtures.js';
import { generateString, generateUrl, generateNumber, generateUUID, parseObjectTemplate, parseArrayTemplate } from './placeholder-generators.js';
import { findSimilarPlaceholders } from './placeholder-catalog.js';

// Re-export extracted modules for backward compatibility
export { assertionToExpect, jsonPathToExpect, parseJsonPath, hasWildcard, type JsonPathSegment } from './placeholder-assertions.js';
export { listPlaceholders } from './placeholder-catalog.js';

/**
 * Context for placeholder expansion.
 */
export interface PlaceholderContext {
  userId?: string;
  timestamp?: number;
  mode?: 'deterministic' | 'random';
  /** Fixture registry for resolving @fixtureName references */
  fixtureRegistry?: FixtureRegistry;
  /** Fixture resolver context (created internally if fixtureRegistry provided) */
  fixtureContext?: FixtureResolverContext;
}

/**
 * Result of placeholder expansion.
 */
export interface PlaceholderResult {
  type: 'value' | 'assertion' | 'user';
  value?: unknown;
  asserts?: string;
  pattern?: string;
  id?: string;
  permissions?: string[];
  /** For comparison assertions - min value for @between */
  min?: number;
  /** For comparison assertions - max value for @between */
  max?: number;
  /** For comparison assertions - whether value is a JS expression (like Date.now()) */
  valueIsExpression?: boolean;
  /** For composite assertions (@all, @any) - nested assertion results */
  nested?: PlaceholderResult[];
}

/**
 * Placeholder expansion error.
 */
export interface PlaceholderError {
  code: string;
  message: string;
  placeholder: string;
  /** Suggested similar placeholders for UNKNOWN_PLACEHOLDER errors */
  suggestions?: string[];
}

/**
 * Standard placeholder patterns.
 */
const PLACEHOLDER_PATTERNS = {
  // Built-in fixtures
  authenticated: /^@authenticated$/,
  no_access: /^@no_access$/,
  admin_user: /^@admin_user$/,

  // Value generators
  string: /^@string\((\d+)\)$/,
  url: /^@url\((\d+)\)$/,
  number: /^@number\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)$/,
  array: /^@array\((\d+),\s*(.+)\)$/,
  now: /^@now(?:\(([+-]?\d+)([dhms])\))?$/,
  uuid: /^@uuid$/,

  // Assertions
  created: /^@created$/,
  exists: /^@exists$/,
  defined: /^@defined$/,
  undefined: /^@undefined$/,
  empty: /^@empty$/,
  contains: /^@contains\((['"])(.+?)\1\)$/,
  lt: /^@lt\((.+)\)$/,
  gt: /^@gt\((.+)\)$/,
  lte: /^@lte\((.+)\)$/,
  gte: /^@gte\((.+)\)$/,
  between: /^@between\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)$/,
  matches: /^@matches\(['"](.+)['"]\)$/,
  type: /^@type\(['"](\w+)['"]\)$/,

  // New: Object/array assertions (Improvement #1, #8)
  hasItemObject: /^@hasItem\((\{.*\})\)$/,
  hasItemString: /^@hasItem\(['"](.+)['"]\)$/,
  hasItemNumber: /^@hasItem\((-?\d+(?:\.\d+)?)\)$/,
  hasProperties: /^@hasProperties\((\{.*\})\)$/,
  all: /^@all\((.+)\)$/,
  and: /^@and\((.+)\)$/,
  any: /^@any\((.+)\)$/,
  or: /^@or\((.+)\)$/,
  not: /^@not\((.+)\)$/,
  oneOf: /^@oneOf\((\[.*\])\)$/,
  length: /^@length\((\d+)\)$/,

  // Modifiers
  random: /^@random\((.+)\)$/,  // Force random mode for nested placeholder

  // Cross-field references
  ref: /^@ref\(([a-zA-Z_][a-zA-Z0-9_.]*)\)$/,  // Reference to another field like @ref(input.name)
};

/**
 * Check if a value is a placeholder.
 */
export function isPlaceholder(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('@');
}

/**
 * Resolve a comparison value which can be:
 * - A numeric literal: "5", "-3.14"
 * - A nested placeholder: "@now", "@now(-1d)"
 *
 * Returns:
 * - number: for numeric literals
 * - string: for expressions that should be used as-is (like Date.now())
 */
function resolveComparisonValue(
  rawValue: string,
  context: PlaceholderContext
): number | string {
  // Try parsing as a number first
  const numValue = parseFloat(rawValue);
  if (!isNaN(numValue)) {
    return numValue;
  }

  // Check if it's a nested placeholder
  if (rawValue.startsWith('@')) {
    const expanded = expandPlaceholder(rawValue, context);
    if (!isPlaceholderError(expanded)) {
      // If it's a value type (like @now), return it as an expression
      if (expanded.type === 'value' && typeof expanded.value === 'number') {
        // For @now, we want to generate Date.now() in the test, not the actual timestamp
        if (rawValue.match(/^@now/)) {
          // Parse the offset if any
          const nowMatch = rawValue.match(/^@now(?:\(([+-]?\d+)([dhms])\))?$/);
          if (nowMatch) {
            const [, offsetStr, unit] = nowMatch;
            if (offsetStr && unit) {
              const offset = parseInt(offsetStr, 10);
              const multipliers: Record<string, number> = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
              const ms = offset * (multipliers[unit] || 1);
              return `Date.now() + ${ms}`;
            }
            return 'Date.now()';
          }
        }
        return expanded.value;
      }
    }
  }

  // Fallback: return as-is (might be a variable reference)
  return rawValue;
}

/**
 * Expand a placeholder into a concrete value or assertion.
 */
export function expandPlaceholder(
  placeholder: string,
  context: PlaceholderContext = {}
): PlaceholderResult | PlaceholderError {
  const { userId = 'user_test_123', timestamp = Date.now(), mode = 'deterministic' } = context;

  // @authenticated
  if (PLACEHOLDER_PATTERNS.authenticated.test(placeholder)) {
    return {
      type: 'user',
      id: userId,
      permissions: ['read', 'write', 'delete'],
    };
  }

  // @no_access
  if (PLACEHOLDER_PATTERNS.no_access.test(placeholder)) {
    return {
      type: 'user',
      id: userId,
      permissions: [],
    };
  }

  // @admin_user
  if (PLACEHOLDER_PATTERNS.admin_user.test(placeholder)) {
    return {
      type: 'user',
      id: 'user_test_admin',
      permissions: ['read', 'write', 'delete', 'admin'],
    };
  }

  // @string(N)
  const stringMatch = placeholder.match(PLACEHOLDER_PATTERNS.string);
  if (stringMatch) {
    const length = parseInt(stringMatch[1], 10);
    if (isNaN(length) || length < 0) {
      return {
        code: 'INVALID_PLACEHOLDER_PARAM',
        message: `Invalid length for @string: ${stringMatch[1]}`,
        placeholder,
      };
    }
    return {
      type: 'value',
      value: generateString(length, mode),
    };
  }

  // @url(N)
  const urlMatch = placeholder.match(PLACEHOLDER_PATTERNS.url);
  if (urlMatch) {
    const length = parseInt(urlMatch[1], 10);
    if (isNaN(length) || length < 0) {
      return {
        code: 'INVALID_PLACEHOLDER_PARAM',
        message: `Invalid length for @url: ${urlMatch[1]}`,
        placeholder,
      };
    }
    return {
      type: 'value',
      value: generateUrl(length, mode),
    };
  }

  // @number(min, max)
  const numberMatch = placeholder.match(PLACEHOLDER_PATTERNS.number);
  if (numberMatch) {
    const min = parseFloat(numberMatch[1]);
    const max = parseFloat(numberMatch[2]);
    if (isNaN(min) || isNaN(max)) {
      return {
        code: 'INVALID_PLACEHOLDER_PARAM',
        message: `Invalid range for @number: ${numberMatch[1]}, ${numberMatch[2]}`,
        placeholder,
      };
    }
    if (min > max) {
      return {
        code: 'INVALID_PLACEHOLDER_PARAM',
        message: `Invalid range for @number: min (${min}) > max (${max})`,
        placeholder,
      };
    }
    return {
      type: 'value',
      value: generateNumber(min, max, mode),
    };
  }

  // @array(N, template)
  const arrayMatch = placeholder.match(PLACEHOLDER_PATTERNS.array);
  if (arrayMatch) {
    const count = parseInt(arrayMatch[1], 10);
    const template = arrayMatch[2].trim();
    if (isNaN(count) || count < 0) {
      return {
        code: 'INVALID_PLACEHOLDER_PARAM',
        message: `Invalid count for @array: ${arrayMatch[1]}`,
        placeholder,
      };
    }
    return {
      type: 'value',
      value: generateArray(count, template, context),
    };
  }

  // @now or @now(-1d)
  const nowMatch = placeholder.match(PLACEHOLDER_PATTERNS.now);
  if (nowMatch) {
    let result = timestamp;
    if (nowMatch[1] && nowMatch[2]) {
      const offset = parseInt(nowMatch[1], 10);
      const unit = nowMatch[2];
      const multipliers: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
      };
      result = timestamp + offset * (multipliers[unit] || 0);
    }
    return {
      type: 'value',
      value: result,
    };
  }

  // @uuid - Generate a UUID v4
  if (PLACEHOLDER_PATTERNS.uuid.test(placeholder)) {
    if (mode === 'deterministic') {
      return {
        type: 'value',
        value: '00000000-0000-4000-8000-000000000000',
      };
    }
    return {
      type: 'value',
      value: generateUUID(),
    };
  }

  // @created
  if (PLACEHOLDER_PATTERNS.created.test(placeholder)) {
    return {
      type: 'assertion',
      asserts: 'created',
    };
  }

  // @exists
  if (PLACEHOLDER_PATTERNS.exists.test(placeholder)) {
    return {
      type: 'assertion',
      asserts: 'exists',
    };
  }

  // @defined
  if (PLACEHOLDER_PATTERNS.defined.test(placeholder)) {
    return {
      type: 'assertion',
      asserts: 'defined',
    };
  }

  // @undefined
  if (PLACEHOLDER_PATTERNS.undefined.test(placeholder)) {
    return {
      type: 'assertion',
      asserts: 'undefined',
    };
  }

  // @empty - Assert empty array/string/object
  if (PLACEHOLDER_PATTERNS.empty.test(placeholder)) {
    return {
      type: 'assertion',
      asserts: 'empty',
    };
  }

  // @contains('x')
  const containsMatch = placeholder.match(PLACEHOLDER_PATTERNS.contains);
  if (containsMatch) {
    return {
      type: 'assertion',
      asserts: 'contains',
      value: containsMatch[2],
    };
  }

  // @lt(N) or @lt(@placeholder)
  const ltMatch = placeholder.match(PLACEHOLDER_PATTERNS.lt);
  if (ltMatch) {
    const value = resolveComparisonValue(ltMatch[1].trim(), context);
    return {
      type: 'assertion',
      asserts: 'lessThan',
      value,
      valueIsExpression: typeof value === 'string',
    };
  }

  // @gt(N) or @gt(@placeholder)
  const gtMatch = placeholder.match(PLACEHOLDER_PATTERNS.gt);
  if (gtMatch) {
    const value = resolveComparisonValue(gtMatch[1].trim(), context);
    return {
      type: 'assertion',
      asserts: 'greaterThan',
      value,
      valueIsExpression: typeof value === 'string',
    };
  }

  // @matches('regex')
  const matchesMatch = placeholder.match(PLACEHOLDER_PATTERNS.matches);
  if (matchesMatch) {
    return {
      type: 'assertion',
      asserts: 'matches',
      pattern: matchesMatch[1],
    };
  }

  // @lte(N) or @lte(@placeholder)
  const lteMatch = placeholder.match(PLACEHOLDER_PATTERNS.lte);
  if (lteMatch) {
    const value = resolveComparisonValue(lteMatch[1].trim(), context);
    return {
      type: 'assertion',
      asserts: 'lessThanOrEqual',
      value,
      valueIsExpression: typeof value === 'string',
    };
  }

  // @gte(N) or @gte(@placeholder)
  const gteMatch = placeholder.match(PLACEHOLDER_PATTERNS.gte);
  if (gteMatch) {
    const value = resolveComparisonValue(gteMatch[1].trim(), context);
    return {
      type: 'assertion',
      asserts: 'greaterThanOrEqual',
      value,
      valueIsExpression: typeof value === 'string',
    };
  }

  // @between(min, max) - Assert value is between min and max (inclusive)
  const betweenMatch = placeholder.match(PLACEHOLDER_PATTERNS.between);
  if (betweenMatch) {
    return {
      type: 'assertion',
      asserts: 'between',
      min: parseFloat(betweenMatch[1]),
      max: parseFloat(betweenMatch[2]),
    };
  }

  // @type('typeName') - Assert value is of specified type
  const typeMatch = placeholder.match(PLACEHOLDER_PATTERNS.type);
  if (typeMatch) {
    return {
      type: 'assertion',
      asserts: 'type',
      value: typeMatch[1],
    };
  }

  // @hasItem({...}) - Improvement #1: Object matching in arrays
  const hasItemObjectMatch = placeholder.match(PLACEHOLDER_PATTERNS.hasItemObject);
  if (hasItemObjectMatch) {
    try {
      // Parse the object matcher (JSON5-like syntax)
      const matcherStr = hasItemObjectMatch[1];
      const matcher = parseObjectMatcher(matcherStr);
      return {
        type: 'assertion',
        asserts: 'hasItem',
        value: matcher,
      };
    } catch { /* malformed JSON in object matcher */
      return {
        code: 'INVALID_PLACEHOLDER',
        message: `Invalid object matcher in @hasItem: ${hasItemObjectMatch[1]}`,
        placeholder,
      };
    }
  }

  // @hasItem('string') - String matching in arrays
  const hasItemStringMatch = placeholder.match(PLACEHOLDER_PATTERNS.hasItemString);
  if (hasItemStringMatch) {
    return {
      type: 'assertion',
      asserts: 'hasItem',
      value: hasItemStringMatch[1],
    };
  }

  // @hasItem(number) - Number matching in arrays
  const hasItemNumberMatch = placeholder.match(PLACEHOLDER_PATTERNS.hasItemNumber);
  if (hasItemNumberMatch) {
    return {
      type: 'assertion',
      asserts: 'hasItemNumber',
      value: parseFloat(hasItemNumberMatch[1]),
    };
  }

  // @hasProperties({...}) - Object property matching (for non-array objects)
  const hasPropertiesMatch = placeholder.match(PLACEHOLDER_PATTERNS.hasProperties);
  if (hasPropertiesMatch) {
    try {
      const matcherStr = hasPropertiesMatch[1];
      const matcher = parseObjectMatcher(matcherStr);
      return {
        type: 'assertion',
        asserts: 'hasProperties',
        value: matcher,
      };
    } catch { /* malformed JSON in object matcher */
      return {
        code: 'INVALID_PLACEHOLDER',
        message: `Invalid object matcher in @hasProperties: ${hasPropertiesMatch[1]}`,
        placeholder,
      };
    }
  }

  // @all(...) - Improvement #8: Combine multiple assertions
  const allMatch = placeholder.match(PLACEHOLDER_PATTERNS.all);
  if (allMatch) {
    const innerAssertions = parseCompositeAssertions(allMatch[1], context);
    if ('code' in innerAssertions) {
      return innerAssertions;
    }
    return {
      type: 'assertion',
      asserts: 'all',
      value: innerAssertions,
    };
  }

  // @and(...) - Alias for @all
  const andMatch = placeholder.match(PLACEHOLDER_PATTERNS.and);
  if (andMatch) {
    const innerAssertions = parseCompositeAssertions(andMatch[1], context);
    if ('code' in innerAssertions) {
      return innerAssertions;
    }
    return {
      type: 'assertion',
      asserts: 'all',
      value: innerAssertions,
    };
  }

  // @any(...) - Any of the nested assertions should pass
  const anyMatch = placeholder.match(PLACEHOLDER_PATTERNS.any);
  if (anyMatch) {
    const innerAssertions = parseCompositeAssertions(anyMatch[1], context);
    if ('code' in innerAssertions) {
      return innerAssertions;
    }
    return {
      type: 'assertion',
      asserts: 'any',
      value: innerAssertions,
    };
  }

  // @or(...) - Alias for @any
  const orMatch = placeholder.match(PLACEHOLDER_PATTERNS.or);
  if (orMatch) {
    const innerAssertions = parseCompositeAssertions(orMatch[1], context);
    if ('code' in innerAssertions) {
      return innerAssertions;
    }
    return {
      type: 'assertion',
      asserts: 'any',
      value: innerAssertions,
    };
  }

  // @not(...) - Negate an assertion
  const notMatch = placeholder.match(PLACEHOLDER_PATTERNS.not);
  if (notMatch) {
    const innerAssertion = expandPlaceholder(notMatch[1].trim(), context);
    if (isPlaceholderError(innerAssertion)) {
      return innerAssertion;
    }
    return {
      type: 'assertion',
      asserts: 'not',
      value: innerAssertion,
    };
  }

  // @oneOf([...])
  const oneOfMatch = placeholder.match(PLACEHOLDER_PATTERNS.oneOf);
  if (oneOfMatch) {
    try {
      // Support both single and double quotes by converting to JSON
      const arrayStr = oneOfMatch[1]
        .replace(/'/g, '"')  // Convert single quotes to double quotes
        .replace(/,\s*]/g, ']');  // Remove trailing commas
      const values = JSON.parse(arrayStr);
      return {
        type: 'assertion',
        asserts: 'oneOf',
        value: values,
      };
    } catch { /* malformed JSON array */
      return {
        code: 'INVALID_PLACEHOLDER',
        message: `Invalid array in @oneOf: ${oneOfMatch[1]}`,
        placeholder,
      };
    }
  }

  // @length(N) or @length(@nested)
  const lengthMatch = placeholder.match(PLACEHOLDER_PATTERNS.length);
  if (lengthMatch) {
    return {
      type: 'assertion',
      asserts: 'length',
      value: parseInt(lengthMatch[1], 10),
    };
  }

  // @length(@nested) - nested assertion for length constraint
  const lengthNestedMatch = placeholder.match(/^@length\((@.+)\)$/);
  if (lengthNestedMatch) {
    const innerAssertion = expandPlaceholder(lengthNestedMatch[1], context);
    if (isPlaceholderError(innerAssertion)) {
      return innerAssertion;
    }
    return {
      type: 'assertion',
      asserts: 'lengthNested',
      value: innerAssertion,
    };
  }

  // @random(@placeholder) - Force random mode for nested placeholder
  const randomMatch = placeholder.match(PLACEHOLDER_PATTERNS.random);
  if (randomMatch) {
    const innerPlaceholder = randomMatch[1].trim();
    // Expand the inner placeholder with random mode forced
    const randomContext = { ...context, mode: 'random' as const };
    return expandPlaceholder(innerPlaceholder, randomContext);
  }

  // @ref(field.path) - Cross-field reference (generates code that references another field)
  const refMatch = placeholder.match(PLACEHOLDER_PATTERNS.ref);
  if (refMatch) {
    const fieldPath = refMatch[1];
    return {
      type: 'assertion',
      asserts: 'ref',
      value: fieldPath,
    };
  }

  // Project-defined fixtures from _fixtures.yaml
  // Check if this is a fixture reference (e.g., @validTaskEntry, @archivedEntry)
  if (isFixtureReference(placeholder) && context.fixtureRegistry) {
    const parsed = parseFixtureReference(placeholder);
    if (parsed) {
      // Create fixture context if not provided
      const fixtureCtx = context.fixtureContext || {
        projectRoot: '',
        registry: context.fixtureRegistry,
        resolved: new Map(),
      };

      const result = resolveFixture(parsed.name, parsed.params, fixtureCtx);

      if (!result.success) {
        return {
          code: 'FIXTURE_RESOLUTION_ERROR',
          message: result.error || `Failed to resolve fixture @${parsed.name}`,
          placeholder,
        };
      }

      // Documentation-only fixtures return as-is for documentation
      if (result.mode === 'documentation') {
        return {
          type: 'value',
          value: placeholder, // Keep the @reference for docs
        };
      }

      return {
        type: 'value',
        value: result.value,
      };
    }
  }

  // Unknown placeholder - suggest similar ones
  const suggestions = findSimilarPlaceholders(placeholder);
  const suggestionText = suggestions.length > 0
    ? ` Did you mean: ${suggestions.join(', ')}?`
    : '';
  return {
    code: 'UNKNOWN_PLACEHOLDER',
    message: `Unknown placeholder: ${placeholder}.${suggestionText}`,
    placeholder,
    suggestions,
  };
}

/**
 * Check if a result is an error.
 */
export function isPlaceholderError(result: PlaceholderResult | PlaceholderError): result is PlaceholderError {
  return 'code' in result;
}

/**
 * Expand all placeholders in an object recursively.
 */
export function expandPlaceholders(
  obj: unknown,
  context: PlaceholderContext = {}
): { result: unknown; errors: PlaceholderError[] } {
  const errors: PlaceholderError[] = [];

  function expand(value: unknown, depth = 0): unknown {
    if (depth > 50) return value; // Prevent infinite recursion
    if (isPlaceholder(value)) {
      const result = expandPlaceholder(value, context);
      if (isPlaceholderError(result)) {
        errors.push(result);
        return value; // Keep original on error
      }
      // For values, return the value; for assertions, return the result object
      return result.type === 'value' ? result.value : result;
    }

    if (Array.isArray(value)) {
      return value.map(v => expand(v, depth + 1));
    }

    if (value && typeof value === 'object') {
      const expanded: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        expanded[key] = expand(val, depth + 1);
      }
      return expanded;
    }

    return value;
  }

  return { result: expand(obj), errors };
}

/**
 * Parse an object matcher string into a structured object.
 * Handles JSON5-like syntax: { name: 'intent', required: true }
 */
function parseObjectMatcher(matcherStr: string): Record<string, unknown> {
  // Convert JSON5-like syntax to valid JSON
  // Handle unquoted keys and single quotes
  let jsonStr = matcherStr
    // Add quotes around unquoted keys
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_.]*)\s*:/g, '$1"$2":')
    // Convert single quotes to double quotes (but not escaped ones)
    .replace(/'/g, '"');

  try {
    return JSON.parse(jsonStr);
  } catch { /* quote conversion failed, try original */
    // Try as-is if conversion failed
    return JSON.parse(matcherStr);
  }
}

/**
 * Parse composite assertions like @all(@hasItem(...), @contains(...))
 * Returns array of PlaceholderResults or a PlaceholderError
 */
function parseCompositeAssertions(
  argsStr: string,
  context: PlaceholderContext
): PlaceholderResult[] | PlaceholderError {
  const assertions: PlaceholderResult[] = [];

  // Split by top-level commas (not inside parentheses)
  const parts = splitByTopLevelComma(argsStr);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const result = expandPlaceholder(trimmed, context);
    if (isPlaceholderError(result)) {
      return result;
    }
    assertions.push(result);
  }

  return assertions;
}

/**
 * Split a string by commas, but only at the top level (not inside parentheses).
 */
function splitByTopLevelComma(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of str) {
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}


/**
 * Generate an array of N items with the template expanded recursively.
 * Supports:
 * - Simple placeholders: @array(3, @string(10))
 * - Object templates: @array(50, { productId: '@string(10)', quantity: '@number(1, 100)' })
 */
function generateArray(
  count: number,
  template: string,
  context: PlaceholderContext
): unknown[] {
  const result: unknown[] = [];
  const { mode = 'deterministic' } = context;

  for (let i = 0; i < count; i++) {
    // Create a slightly varied context for each item to avoid all identical values in random mode
    const itemContext = { ...context, timestamp: (context.timestamp || Date.now()) + i };
    const item = expandArrayTemplate(template, itemContext, i, mode);
    result.push(item);
  }

  return result;
}

/**
 * Expand a template string for array generation.
 * Handles both simple placeholders (@string(10)) and object templates ({ key: '@placeholder' })
 */
function expandArrayTemplate(
  template: string,
  context: PlaceholderContext,
  _index: number,
  _mode: 'deterministic' | 'random'
): unknown {
  const trimmed = template.trim();

  // Check if it's a simple placeholder
  if (trimmed.startsWith('@') && !trimmed.startsWith('{')) {
    const result = expandPlaceholder(trimmed, context);
    if (isPlaceholderError(result)) {
      // Return error message as value for debugging
      return `[ERROR: ${result.message}]`;
    }
    return result.type === 'value' ? result.value : result;
  }

  // Check if it's an object template: { key: '@placeholder', ... }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      // Parse the object template (JSON5-like syntax)
      const parsed = parseObjectTemplate(trimmed);
      // Recursively expand all placeholder values
      return expandObjectPlaceholders(parsed, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `[ERROR: Failed to parse object template: ${message}]`;
    }
  }

  // Check if it's an array template: [ ... ]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = parseArrayTemplate(trimmed);
      return parsed.map(item => {
        if (typeof item === 'string' && item.startsWith('@')) {
          const result = expandPlaceholder(item, context);
          if (isPlaceholderError(result)) return item;
          return result.type === 'value' ? result.value : result;
        }
        if (typeof item === 'object' && item !== null) {
          return expandObjectPlaceholders(item as Record<string, unknown>, context);
        }
        return item;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `[ERROR: Failed to parse array template: ${message}]`;
    }
  }

  // Return as-is if not a recognized format
  return trimmed;
}


/**
 * Recursively expand all placeholder strings in an object.
 */
function expandObjectPlaceholders(
  obj: Record<string, unknown>,
  context: PlaceholderContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.startsWith('@')) {
      const expanded = expandPlaceholder(value, context);
      if (isPlaceholderError(expanded)) {
        result[key] = value; // Keep original on error
      } else {
        result[key] = expanded.type === 'value' ? expanded.value : expanded;
      }
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => {
        if (typeof item === 'string' && item.startsWith('@')) {
          const expanded = expandPlaceholder(item, context);
          if (isPlaceholderError(expanded)) return item;
          return expanded.type === 'value' ? expanded.value : expanded;
        }
        if (typeof item === 'object' && item !== null) {
          return expandObjectPlaceholders(item as Record<string, unknown>, context);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = expandObjectPlaceholders(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }

  return result;
}



