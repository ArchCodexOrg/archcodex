/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Assertion code generation for SpecCodex placeholders.
 * Converts placeholder assertion results to Jest/Vitest expect calls,
 * and handles JSONPath expressions for nested assertions.
 */

import type { PlaceholderResult } from './placeholders.js';

/**
 * JSONPath segment for path-based assertions.
 */
export interface JsonPathSegment {
  type: 'property' | 'index' | 'wildcard';
  value: string | number;
}

/**
 * Parse a JSONPath-like expression.
 * Supports:
 * - result.items[*].status - wildcard (all items)
 * - result.items[0].name - specific index
 * - result.data.nested.value - deep path
 *
 * Returns parsed path segments for code generation.
 */
export function parseJsonPath(pathStr: string): JsonPathSegment[] {
  const segments: JsonPathSegment[] = [];
  const regex = /\.?([a-zA-Z_][a-zA-Z0-9_]*)|(\[\*\])|\[(\d+)\]/g;
  let match;

  while ((match = regex.exec(pathStr)) !== null) {
    if (match[1]) {
      segments.push({ type: 'property', value: match[1] });
    } else if (match[2]) {
      segments.push({ type: 'wildcard', value: '*' });
    } else if (match[3]) {
      segments.push({ type: 'index', value: parseInt(match[3], 10) });
    }
  }

  return segments;
}

/**
 * Check if a path contains a wildcard [*].
 */
export function hasWildcard(pathStr: string): boolean {
  return pathStr.includes('[*]');
}

/**
 * Generate expect code for a JSONPath assertion.
 * Handles wildcards by generating forEach loops.
 */
export function jsonPathToExpect(
  pathStr: string,
  assertion: PlaceholderResult,
  rootVar: string = 'result'
): string {
  let segments = parseJsonPath(pathStr);

  if (segments.length > 0 && segments[0].type === 'property' && segments[0].value === rootVar) {
    segments = segments.slice(1);
  }

  const wildcardIndex = segments.findIndex(s => s.type === 'wildcard');

  if (wildcardIndex === -1) {
    const fullPath = buildPathExpression(segments, rootVar);
    return assertionToExpect(assertion, fullPath);
  }

  const beforeWildcard = segments.slice(0, wildcardIndex);
  const afterWildcard = segments.slice(wildcardIndex + 1);

  const arrayPath = buildPathExpression(beforeWildcard, rootVar);
  const itemVar = 'item';
  const itemPath = afterWildcard.length > 0
    ? buildPathExpression(afterWildcard, itemVar)
    : itemVar;

  const assertionCode = assertionToExpect(assertion, itemPath);

  return `${arrayPath}.forEach(${itemVar} => {\n  ${assertionCode};\n})`;
}

/**
 * Build a JavaScript path expression from segments.
 */
function buildPathExpression(segments: JsonPathSegment[], rootVar: string): string {
  let pathExpr = rootVar;

  for (const segment of segments) {
    if (segment.type === 'property') {
      pathExpr += `.${segment.value}`;
    } else if (segment.type === 'index') {
      pathExpr += `[${segment.value}]`;
    }
  }

  return pathExpr;
}

/**
 * Convert a placeholder assertion to a Jest/Vitest expect call.
 */
export function assertionToExpect(
  result: PlaceholderResult,
  varName: string
): string {
  switch (result.asserts) {
    case 'created':
      return `expect(${varName}).toBeDefined()`;
    case 'exists':
      return `expect(${varName}).not.toBeNull()`;
    case 'defined':
      return `expect(${varName}).toBeDefined()`;
    case 'undefined':
      return `expect(${varName}).toBeUndefined()`;
    case 'empty': {
      const lines = [
        `if (typeof ${varName} === 'object' && ${varName} !== null && !Array.isArray(${varName})) {`,
        `  expect(Object.keys(${varName})).toHaveLength(0);`,
        `} else {`,
        `  expect(${varName}).toHaveLength(0);`,
        `}`,
      ];
      return lines.join('\n');
    }
    case 'contains':
      return `expect(${varName}).toContain(${JSON.stringify(result.value)})`;
    case 'lessThan':
      return `expect(${varName}).toBeLessThan(${result.value})`;
    case 'greaterThan':
      return `expect(${varName}).toBeGreaterThan(${result.value})`;
    case 'lessThanOrEqual':
      return `expect(${varName}).toBeLessThanOrEqual(${result.value})`;
    case 'greaterThanOrEqual':
      return `expect(${varName}).toBeGreaterThanOrEqual(${result.value})`;
    case 'between':
      return `expect(${varName}).toBeGreaterThanOrEqual(${result.min});\n      expect(${varName}).toBeLessThanOrEqual(${result.max})`;
    case 'type': {
      const typeName = result.value as string;
      switch (typeName) {
        case 'array':
          return `expect(Array.isArray(${varName})).toBe(true)`;
        case 'object':
          return `expect(typeof ${varName} === 'object' && ${varName} !== null && !Array.isArray(${varName})).toBe(true)`;
        case 'string':
          return `expect(typeof ${varName}).toBe('string')`;
        case 'number':
          return `expect(typeof ${varName}).toBe('number')`;
        case 'boolean':
          return `expect(typeof ${varName}).toBe('boolean')`;
        case 'function':
          return `expect(typeof ${varName}).toBe('function')`;
        case 'null':
          return `expect(${varName}).toBeNull()`;
        case 'undefined':
          return `expect(${varName}).toBeUndefined()`;
        default:
          return `expect(typeof ${varName}).toBe('${typeName}')`;
      }
    }
    case 'matches':
      return `expect(${varName}).toMatch(/${result.pattern}/)`;
    case 'length':
      return `expect(${varName}).toHaveLength(${result.value})`;
    case 'lengthNested': {
      const innerAssertion = result.value as PlaceholderResult;
      return assertionToExpect(innerAssertion, `${varName}.length`);
    }
    case 'oneOf':
      return `expect(${JSON.stringify(result.value)}).toContain(${varName})`;
    case 'hasItem':
      if (typeof result.value === 'string') {
        return `expect(${varName}).toContain(${JSON.stringify(result.value)})`;
      } else {
        return `expect(${varName}).toEqual(expect.arrayContaining([expect.objectContaining(${JSON.stringify(result.value)})]))`;
      }
    case 'hasItemNumber':
      return `expect(${varName}).toContain(${result.value})`;
    case 'hasProperties':
      return `expect(${varName}).toMatchObject(${JSON.stringify(result.value)})`;
    case 'all': {
      const assertions = result.value as PlaceholderResult[];
      return assertions.map(a => assertionToExpect(a, varName)).join(';\n      ');
    }
    case 'any': {
      const assertions = result.value as PlaceholderResult[];
      const assertionChecks = assertions.map(a => {
        const expectCode = assertionToExpect(a, varName);
        return `(() => { ${expectCode}; return true; })()`;
      }).join(' || ');
      return `expect(${assertionChecks}).toBe(true)`;
    }
    case 'not': {
      const innerAssertion = result.value as PlaceholderResult;
      const innerExpect = assertionToExpect(innerAssertion, varName);
      if (innerExpect.includes(';\n')) {
        return innerExpect.split(';\n').map(line =>
          line.trim() ? line.replace(/\.to/, '.not.to') : line
        ).join(';\n');
      }
      return innerExpect.replace(/\.to/, '.not.to');
    }
    case 'ref': {
      const refPath = result.value as string;
      return `expect(${varName}).toBe(${refPath})`;
    }
    default:
      return `expect(${varName}).toBeDefined()`;
  }
}
