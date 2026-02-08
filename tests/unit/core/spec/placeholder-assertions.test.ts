/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import {
  parseJsonPath,
  hasWildcard,
  jsonPathToExpect,
  assertionToExpect,
  type JsonPathSegment,
} from '../../../../src/core/spec/placeholder-assertions.js';
import type { PlaceholderResult } from '../../../../src/core/spec/placeholders.js';

describe('placeholder-assertions', () => {
  describe('parseJsonPath', () => {
    it('parses simple property path', () => {
      const segments = parseJsonPath('result.status');
      expect(segments).toEqual([
        { type: 'property', value: 'result' },
        { type: 'property', value: 'status' },
      ]);
    });

    it('parses path with index', () => {
      const segments = parseJsonPath('result.items[0]');
      expect(segments).toEqual([
        { type: 'property', value: 'result' },
        { type: 'property', value: 'items' },
        { type: 'index', value: 0 },
      ]);
    });

    it('parses path with wildcard', () => {
      const segments = parseJsonPath('result.items[*]');
      expect(segments).toEqual([
        { type: 'property', value: 'result' },
        { type: 'property', value: 'items' },
        { type: 'wildcard', value: '*' },
      ]);
    });

    it('parses deep nested path', () => {
      const segments = parseJsonPath('result.data.nested.value');
      expect(segments).toEqual([
        { type: 'property', value: 'result' },
        { type: 'property', value: 'data' },
        { type: 'property', value: 'nested' },
        { type: 'property', value: 'value' },
      ]);
    });

    it('parses complex path with multiple indices', () => {
      const segments = parseJsonPath('result.matrix[0][5]');
      expect(segments).toEqual([
        { type: 'property', value: 'result' },
        { type: 'property', value: 'matrix' },
        { type: 'index', value: 0 },
        { type: 'index', value: 5 },
      ]);
    });

    it('handles path with wildcard in middle', () => {
      const segments = parseJsonPath('result.items[*].status');
      expect(segments).toEqual([
        { type: 'property', value: 'result' },
        { type: 'property', value: 'items' },
        { type: 'wildcard', value: '*' },
        { type: 'property', value: 'status' },
      ]);
    });
  });

  describe('hasWildcard', () => {
    it('returns true for path with wildcard', () => {
      expect(hasWildcard('result.items[*]')).toBe(true);
    });

    it('returns false for path without wildcard', () => {
      expect(hasWildcard('result.items[0]')).toBe(false);
    });

    it('returns false for simple property path', () => {
      expect(hasWildcard('result.status')).toBe(false);
    });

    it('returns true for nested wildcard', () => {
      expect(hasWildcard('result.items[*].children[*]')).toBe(true);
    });
  });

  describe('jsonPathToExpect', () => {
    it('generates direct access without wildcards', () => {
      const assertion: PlaceholderResult = { type: 'assertion', asserts: 'defined' };
      const code = jsonPathToExpect('result.status', assertion);
      expect(code).toContain('expect(result.status).toBeDefined()');
    });

    it('generates forEach for wildcards', () => {
      const assertion: PlaceholderResult = { type: 'assertion', asserts: 'defined' };
      const code = jsonPathToExpect('result.items[*].status', assertion);
      expect(code).toContain('forEach(item =>');
      expect(code).toContain('expect(item.status).toBeDefined()');
    });

    it('handles wildcard at end of path', () => {
      const assertion: PlaceholderResult = { type: 'assertion', asserts: 'exists' };
      const code = jsonPathToExpect('result.items[*]', assertion);
      expect(code).toContain('forEach(item =>');
      expect(code).toContain('expect(item).not.toBeNull()');
    });

    it('strips root var when it matches', () => {
      const assertion: PlaceholderResult = { type: 'assertion', asserts: 'defined' };
      const code = jsonPathToExpect('result.status', assertion, 'result');
      expect(code).toContain('result.status');
    });
  });

  describe('assertionToExpect', () => {
    it('generates code for created assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'created' };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBeDefined()');
    });

    it('generates code for exists assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'exists' };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).not.toBeNull()');
    });

    it('generates code for defined assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'defined' };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBeDefined()');
    });

    it('generates code for undefined assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'undefined' };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBeUndefined()');
    });

    it('generates code for empty assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'empty' };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('toHaveLength(0)');
    });

    it('generates code for contains assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'contains', value: 'hello' };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toContain("hello")');
    });

    it('generates code for lessThan assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'lessThan', value: 100 };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBeLessThan(100)');
    });

    it('generates code for greaterThan assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'greaterThan', value: 0 };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBeGreaterThan(0)');
    });

    it('generates code for lessThanOrEqual assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'lessThanOrEqual', value: 100 };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBeLessThanOrEqual(100)');
    });

    it('generates code for greaterThanOrEqual assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'greaterThanOrEqual', value: 1 };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBeGreaterThanOrEqual(1)');
    });

    it('generates code for between assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'between', min: 1, max: 100 };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('toBeGreaterThanOrEqual(1)');
      expect(code).toContain('toBeLessThanOrEqual(100)');
    });

    it('generates code for type assertion - array', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'type', value: 'array' };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('Array.isArray(result)');
    });

    it('generates code for type assertion - string', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'type', value: 'string' };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain("typeof result");
      expect(code).toContain("'string'");
    });

    it('generates code for type assertion - object', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'type', value: 'object' };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('typeof result');
      expect(code).toContain("=== 'object'");
      expect(code).toContain('!Array.isArray');
    });

    it('generates code for matches assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'matches', pattern: '^[a-z]+$' };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('toMatch(/^[a-z]+$/)');
    });

    it('generates code for length assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'length', value: 5 };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toHaveLength(5)');
    });

    it('generates code for oneOf assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'oneOf', value: ['a', 'b', 'c'] };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('toContain(result)');
    });

    it('generates code for hasItem assertion with string', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'hasItem', value: 'item' };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('toContain("item")');
    });

    it('generates code for hasItem assertion with object', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'hasItem', value: { name: 'test' } };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('arrayContaining');
      expect(code).toContain('objectContaining');
    });

    it('generates code for hasProperties assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'hasProperties', value: { a: 1, b: 2 } };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('toMatchObject');
    });

    it('generates code for all assertion', () => {
      const nested: PlaceholderResult[] = [
        { type: 'assertion', asserts: 'greaterThan', value: 0 },
        { type: 'assertion', asserts: 'lessThan', value: 100 },
      ];
      const result: PlaceholderResult = { type: 'assertion', asserts: 'all', value: nested };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('toBeGreaterThan(0)');
      expect(code).toContain('toBeLessThan(100)');
    });

    it('generates code for ref assertion', () => {
      const result: PlaceholderResult = { type: 'assertion', asserts: 'ref', value: 'input.name' };
      const code = assertionToExpect(result, 'result');
      expect(code).toBe('expect(result).toBe(input.name)');
    });

    it('generates code for not assertion', () => {
      const innerAssertion: PlaceholderResult = { type: 'assertion', asserts: 'contains', value: 'error' };
      const result: PlaceholderResult = { type: 'assertion', asserts: 'not', value: innerAssertion };
      const code = assertionToExpect(result, 'result');
      expect(code).toContain('.not.to');
    });
  });
});
