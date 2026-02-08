/**
 * @arch archcodex.core.domain
 *
 * Tests for placeholder expansion - dogfooding from spec.speccodex.placeholders
 */
import { describe, it, expect } from 'vitest';
import {
  expandPlaceholder,
  isPlaceholder,
  isPlaceholderError,
  parseJsonPath,
  hasWildcard,
  jsonPathToExpect,
} from '../../src/core/spec/placeholders.js';

describe('expandPlaceholder (from spec.speccodex.placeholders)', () => {
  describe('success cases', () => {
    it('authenticated user - @authenticated returns user with permissions', () => {
      const result = expandPlaceholder('@authenticated');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('user');
        expect(result.id).toBeDefined();
        expect(result.permissions).toContain('read');
        expect(result.permissions).toContain('write');
        expect(result.permissions).toContain('delete');
      }
    });

    it('user without access - @no_access returns user with empty permissions', () => {
      const result = expandPlaceholder('@no_access');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('user');
        expect(result.permissions).toEqual([]);
      }
    });

    it('string of length N - @string(100) returns string of exactly 100 chars', () => {
      const result = expandPlaceholder('@string(100)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(typeof result.value).toBe('string');
        expect((result.value as string).length).toBe(100);
      }
    });

    it('string deterministic mode returns consistent results', () => {
      const result1 = expandPlaceholder('@string(50)', { mode: 'deterministic' });
      const result2 = expandPlaceholder('@string(50)', { mode: 'deterministic' });

      expect(isPlaceholderError(result1)).toBe(false);
      expect(isPlaceholderError(result2)).toBe(false);
      if (!isPlaceholderError(result1) && !isPlaceholderError(result2)) {
        expect(result1.value).toBe(result2.value);
      }
    });

    it('url of length N - @url(100) returns valid URL', () => {
      const result = expandPlaceholder('@url(100)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(typeof result.value).toBe('string');
        expect((result.value as string).startsWith('https://')).toBe(true);
      }
    });

    it('number in range - @number(1, 100) returns number in deterministic mode', () => {
      const result = expandPlaceholder('@number(1, 100)', { mode: 'deterministic' });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(typeof result.value).toBe('number');
        // Deterministic mode returns midpoint (50.5 rounds to 51 for integers)
        expect(result.value).toBe(51);
      }
    });

    it('number with floats - @number(0.5, 1.5) returns midpoint in deterministic mode', () => {
      const result = expandPlaceholder('@number(0.5, 1.5)', { mode: 'deterministic' });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(typeof result.value).toBe('number');
        expect(result.value).toBe(1); // Midpoint of 0.5 and 1.5
      }
    });

    it('number with negatives - @number(-10, 10) handles negative ranges', () => {
      const result = expandPlaceholder('@number(-10, 10)', { mode: 'deterministic' });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(result.value).toBe(0); // Midpoint
      }
    });

    it('number random mode - @number(1, 100) returns random number in range', () => {
      const result = expandPlaceholder('@number(1, 100)', { mode: 'random' });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(typeof result.value).toBe('number');
        expect(result.value as number).toBeGreaterThanOrEqual(1);
        expect(result.value as number).toBeLessThan(100);
      }
    });

    it('array of simple values - @array(3, @string(5)) returns array of strings', () => {
      const result = expandPlaceholder('@array(3, @string(5))', { mode: 'deterministic' });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(Array.isArray(result.value)).toBe(true);
        const arr = result.value as string[];
        expect(arr.length).toBe(3);
        arr.forEach(item => {
          expect(typeof item).toBe('string');
          expect(item.length).toBe(5);
        });
      }
    });

    it('array of objects - @array(2, { id: \'@uuid\' }) returns array of objects', () => {
      const result = expandPlaceholder("@array(2, { id: '@uuid' })", { mode: 'deterministic' });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(Array.isArray(result.value)).toBe(true);
        const arr = result.value as Array<{ id: string }>;
        expect(arr.length).toBe(2);
        arr.forEach(item => {
          expect(item.id).toBeDefined();
          expect(typeof item.id).toBe('string');
        });
      }
    });

    it('array with nested placeholders - @array(2, { name: \'@string(10)\', count: \'@number(1, 10)\' })', () => {
      const result = expandPlaceholder("@array(2, { name: '@string(10)', count: '@number(1, 10)' })", { mode: 'deterministic' });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(Array.isArray(result.value)).toBe(true);
        const arr = result.value as Array<{ name: string; count: number }>;
        expect(arr.length).toBe(2);
        arr.forEach(item => {
          expect(typeof item.name).toBe('string');
          expect(item.name.length).toBe(10);
          expect(typeof item.count).toBe('number');
        });
      }
    });

    it('current timestamp - @now returns timestamp', () => {
      const before = Date.now();
      const result = expandPlaceholder('@now');
      const after = Date.now();

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(typeof result.value).toBe('number');
        expect(result.value as number).toBeGreaterThanOrEqual(before);
        expect(result.value as number).toBeLessThanOrEqual(after);
      }
    });

    it('timestamp offset - @now(-1d) returns timestamp 1 day ago', () => {
      const now = Date.now();
      const result = expandPlaceholder('@now(-1d)', { timestamp: now });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        const expected = now - 24 * 60 * 60 * 1000;
        expect(result.value).toBe(expected);
      }
    });

    it('created assertion - @created returns assertion type', () => {
      const result = expandPlaceholder('@created');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('created');
      }
    });

    it('exists assertion - @exists returns assertion type', () => {
      const result = expandPlaceholder('@exists');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('exists');
      }
    });

    it('defined assertion - @defined returns assertion type', () => {
      const result = expandPlaceholder('@defined');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('defined');
      }
    });

    it('undefined assertion - @undefined returns assertion type', () => {
      const result = expandPlaceholder('@undefined');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('undefined');
      }
    });

    it('contains assertion - @contains(\'error\') returns assertion with value', () => {
      const result = expandPlaceholder("@contains('error')");

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('contains');
        expect(result.value).toBe('error');
      }
    });

    it('less than assertion - @lt(500) returns assertion with value', () => {
      const result = expandPlaceholder('@lt(500)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('lessThan');
        expect(result.value).toBe(500);
      }
    });

    it('greater than assertion - @gt(0) returns assertion with value', () => {
      const result = expandPlaceholder('@gt(0)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('greaterThan');
        expect(result.value).toBe(0);
      }
    });

    it('matches pattern - @matches returns assertion with pattern', () => {
      const result = expandPlaceholder("@matches('^[a-z]+$')");

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('matches');
        expect(result.pattern).toBe('^[a-z]+$');
      }
    });
  });

  describe('error cases', () => {
    it('unknown placeholder returns error', () => {
      const result = expandPlaceholder('@unknown_placeholder');

      expect(isPlaceholderError(result)).toBe(true);
      if (isPlaceholderError(result)) {
        expect(result.code).toBe('UNKNOWN_PLACEHOLDER');
      }
    });

    it('unknown placeholder suggests similar placeholders', () => {
      const result = expandPlaceholder('@not_exists');

      expect(isPlaceholderError(result)).toBe(true);
      if (isPlaceholderError(result)) {
        expect(result.code).toBe('UNKNOWN_PLACEHOLDER');
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions).toContain('@exists');
        expect(result.suggestions).toContain('@undefined');
        expect(result.message).toContain('Did you mean');
      }
    });

    it('invalid parameter returns error', () => {
      const result = expandPlaceholder('@string(abc)');

      expect(isPlaceholderError(result)).toBe(true);
      if (isPlaceholderError(result)) {
        expect(result.code).toBe('UNKNOWN_PLACEHOLDER');
      }
    });

    it('negative length returns error', () => {
      const result = expandPlaceholder('@string(-1)');

      expect(isPlaceholderError(result)).toBe(true);
    });

    it('number with min > max returns error', () => {
      const result = expandPlaceholder('@number(100, 1)');

      expect(isPlaceholderError(result)).toBe(true);
      if (isPlaceholderError(result)) {
        expect(result.code).toBe('INVALID_PLACEHOLDER_PARAM');
        expect(result.message).toContain('min');
        expect(result.message).toContain('max');
      }
    });

    it('number with invalid params returns error', () => {
      const result = expandPlaceholder('@number(abc, def)');

      // Won't match the regex, so returns UNKNOWN_PLACEHOLDER
      expect(isPlaceholderError(result)).toBe(true);
    });

    it('array with negative count returns error', () => {
      const result = expandPlaceholder('@array(-1, @string(5))');

      // Won't match the regex (negative count not allowed), so returns UNKNOWN_PLACEHOLDER
      expect(isPlaceholderError(result)).toBe(true);
    });
  });

  describe('boundary cases', () => {
    it('max string length - @string(1000000) works', () => {
      const result = expandPlaceholder('@string(1000000)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect((result.value as string).length).toBe(1000000);
      }
    });

    it('zero length string - @string(0) returns empty string', () => {
      const result = expandPlaceholder('@string(0)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        expect(result.value).toBe('');
      }
    });

    it('timestamp with hours offset - @now(+2h)', () => {
      const now = Date.now();
      const result = expandPlaceholder('@now(+2h)', { timestamp: now });

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('value');
        const expected = now + 2 * 60 * 60 * 1000;
        expect(result.value).toBe(expected);
      }
    });
  });
});

describe('isPlaceholder', () => {
  it('returns true for @ prefixed strings', () => {
    expect(isPlaceholder('@authenticated')).toBe(true);
    expect(isPlaceholder('@string(100)')).toBe(true);
    expect(isPlaceholder('@now')).toBe(true);
  });

  it('returns false for non-@ strings', () => {
    expect(isPlaceholder('hello')).toBe(false);
    expect(isPlaceholder('email@example.com')).toBe(false);
    expect(isPlaceholder('')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isPlaceholder(123)).toBe(false);
    expect(isPlaceholder(null)).toBe(false);
    expect(isPlaceholder(undefined)).toBe(false);
    expect(isPlaceholder({ foo: 'bar' })).toBe(false);
  });
});

// =============================================================================
// New Placeholder Tests (Improvements #1, #8)
// =============================================================================

describe('new placeholders (Improvement #1, #8)', () => {
  describe('@hasItem - object matching in arrays', () => {
    it('parses object matcher with single property', () => {
      const result = expandPlaceholder("@hasItem({ name: 'intent' })");

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('hasItem');
        expect(result.value).toEqual({ name: 'intent' });
      }
    });

    it('parses object matcher with multiple properties', () => {
      const result = expandPlaceholder("@hasItem({ name: 'url', required: true })");

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('hasItem');
        expect(result.value).toEqual({ name: 'url', required: true });
      }
    });

    it('parses JSON-style object matcher', () => {
      const result = expandPlaceholder('@hasItem({"type": "string"})');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.value).toEqual({ type: 'string' });
      }
    });

    it('returns error for invalid object syntax', () => {
      const result = expandPlaceholder('@hasItem(invalid)');

      expect(isPlaceholderError(result)).toBe(true);
      if (isPlaceholderError(result)) {
        expect(result.code).toBe('UNKNOWN_PLACEHOLDER');
      }
    });
  });

  describe('@all / @and - combining assertions', () => {
    it('parses multiple assertions', () => {
      const result = expandPlaceholder('@all(@gt(0), @lt(100))');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('all');
        expect(Array.isArray(result.value)).toBe(true);
        const assertions = result.value as Array<{ asserts: string }>;
        expect(assertions).toHaveLength(2);
        expect(assertions[0].asserts).toBe('greaterThan');
        expect(assertions[1].asserts).toBe('lessThan');
      }
    });

    it('@and is alias for @all', () => {
      const result = expandPlaceholder('@and(@defined, @gt(0))');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('all');
        const assertions = result.value as Array<{ asserts: string }>;
        expect(assertions).toHaveLength(2);
      }
    });

    it('handles nested @hasItem assertions', () => {
      const result = expandPlaceholder("@all(@hasItem({ a: 1 }), @hasItem({ b: 2 }))");

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('all');
        const assertions = result.value as Array<{ asserts: string; value: unknown }>;
        expect(assertions).toHaveLength(2);
        expect(assertions[0].asserts).toBe('hasItem');
        expect(assertions[0].value).toEqual({ a: 1 });
        expect(assertions[1].asserts).toBe('hasItem');
        expect(assertions[1].value).toEqual({ b: 2 });
      }
    });

    it('returns error if nested assertion is invalid', () => {
      const result = expandPlaceholder('@all(@unknown, @gt(0))');

      expect(isPlaceholderError(result)).toBe(true);
      if (isPlaceholderError(result)) {
        expect(result.code).toBe('UNKNOWN_PLACEHOLDER');
      }
    });
  });

  describe('@oneOf - enum matching', () => {
    it('parses array of values', () => {
      const result = expandPlaceholder('@oneOf(["active", "pending", "done"])');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('oneOf');
        expect(result.value).toEqual(['active', 'pending', 'done']);
      }
    });

    it('parses array of numbers', () => {
      const result = expandPlaceholder('@oneOf([1, 2, 3])');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.value).toEqual([1, 2, 3]);
      }
    });

    it('returns error for invalid array', () => {
      const result = expandPlaceholder('@oneOf(invalid)');

      expect(isPlaceholderError(result)).toBe(true);
    });
  });

  describe('@length - array/string length', () => {
    it('parses length assertion', () => {
      const result = expandPlaceholder('@length(5)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('length');
        expect(result.value).toBe(5);
      }
    });

    it('parses zero length', () => {
      const result = expandPlaceholder('@length(0)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.value).toBe(0);
      }
    });
  });

  describe('@lte / @gte - inclusive comparisons', () => {
    it('@lte returns lessThanOrEqual assertion', () => {
      const result = expandPlaceholder('@lte(100)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('lessThanOrEqual');
        expect(result.value).toBe(100);
      }
    });

    it('@gte returns greaterThanOrEqual assertion', () => {
      const result = expandPlaceholder('@gte(1)');

      expect(isPlaceholderError(result)).toBe(false);
      if (!isPlaceholderError(result)) {
        expect(result.type).toBe('assertion');
        expect(result.asserts).toBe('greaterThanOrEqual');
        expect(result.value).toBe(1);
      }
    });
  });
});

// Improvement #9: JSONPath support
describe('JSONPath support (Improvement #9)', () => {
  describe('parseJsonPath', () => {
    it('parses simple property path', () => {
      const segments = parseJsonPath('result.items');

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ type: 'property', value: 'result' });
      expect(segments[1]).toEqual({ type: 'property', value: 'items' });
    });

    it('parses path with array index', () => {
      const segments = parseJsonPath('result.items[0].name');

      expect(segments).toHaveLength(4);
      expect(segments[0]).toEqual({ type: 'property', value: 'result' });
      expect(segments[1]).toEqual({ type: 'property', value: 'items' });
      expect(segments[2]).toEqual({ type: 'index', value: 0 });
      expect(segments[3]).toEqual({ type: 'property', value: 'name' });
    });

    it('parses path with wildcard', () => {
      const segments = parseJsonPath('result.items[*].status');

      expect(segments).toHaveLength(4);
      expect(segments[0]).toEqual({ type: 'property', value: 'result' });
      expect(segments[1]).toEqual({ type: 'property', value: 'items' });
      expect(segments[2]).toEqual({ type: 'wildcard', value: '*' });
      expect(segments[3]).toEqual({ type: 'property', value: 'status' });
    });

    it('parses nested path', () => {
      const segments = parseJsonPath('data.users[0].profile.name');

      expect(segments).toHaveLength(5);
      expect(segments[0]).toEqual({ type: 'property', value: 'data' });
      expect(segments[1]).toEqual({ type: 'property', value: 'users' });
      expect(segments[2]).toEqual({ type: 'index', value: 0 });
      expect(segments[3]).toEqual({ type: 'property', value: 'profile' });
      expect(segments[4]).toEqual({ type: 'property', value: 'name' });
    });
  });

  describe('hasWildcard', () => {
    it('returns true for paths with wildcard', () => {
      expect(hasWildcard('result.items[*].status')).toBe(true);
      expect(hasWildcard('[*]')).toBe(true);
    });

    it('returns false for paths without wildcard', () => {
      expect(hasWildcard('result.items[0].status')).toBe(false);
      expect(hasWildcard('result.items')).toBe(false);
    });
  });

  describe('jsonPathToExpect', () => {
    it('generates simple assertion for path without wildcard', () => {
      const assertion = { type: 'assertion' as const, asserts: 'defined' };
      const code = jsonPathToExpect('result.items', assertion);

      expect(code).toBe('expect(result.items).toBeDefined()');
    });

    it('generates indexed assertion', () => {
      const assertion = { type: 'assertion' as const, asserts: 'exists' };
      const code = jsonPathToExpect('result.items[0].name', assertion);

      expect(code).toBe('expect(result.items[0].name).not.toBeNull()');
    });

    it('generates forEach loop for wildcard path', () => {
      const assertion = { type: 'assertion' as const, asserts: 'defined' };
      const code = jsonPathToExpect('result.items[*].status', assertion);

      expect(code).toContain('result.items.forEach(item =>');
      expect(code).toContain('expect(item.status).toBeDefined()');
    });

    it('generates correct assertion inside forEach', () => {
      const assertion = { type: 'assertion' as const, asserts: 'greaterThan', value: 0 };
      const code = jsonPathToExpect('data[*].count', assertion);

      expect(code).toContain('data.forEach(item =>');
      expect(code).toContain('expect(item.count).toBeGreaterThan(0)');
    });

    it('handles wildcard at array level', () => {
      const assertion = { type: 'assertion' as const, asserts: 'exists' };
      const code = jsonPathToExpect('items[*]', assertion);

      expect(code).toContain('items.forEach(item =>');
      expect(code).toContain('expect(item).not.toBeNull()');
    });
  });
});
