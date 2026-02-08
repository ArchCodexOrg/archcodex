/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import {
  generateString,
  generateUrl,
  generateNumber,
  generateUUID,
  parseObjectTemplate,
  parseArrayTemplate,
} from '../../../../src/core/spec/placeholder-generators.js';

describe('placeholder-generators', () => {
  describe('generateString', () => {
    it('deterministic mode returns repeating pattern of correct length', () => {
      const result = generateString(50, 'deterministic');
      expect(result.length).toBe(50);
      expect(result.startsWith('abcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('deterministic mode returns exact pattern for short length', () => {
      const result = generateString(10, 'deterministic');
      expect(result).toBe('abcdefghij');
    });

    it('random mode returns string of correct length', () => {
      const result = generateString(20, 'random');
      expect(result.length).toBe(20);
    });

    it('random mode returns different strings on multiple calls', () => {
      const result1 = generateString(20, 'random');
      const result2 = generateString(20, 'random');
      // Very unlikely to be the same
      expect(result1).not.toBe(result2);
    });

    it('handles length 0', () => {
      const result1 = generateString(0, 'deterministic');
      const result2 = generateString(0, 'random');
      expect(result1).toBe('');
      expect(result2).toBe('');
    });

    it('deterministic mode repeats pattern for length > 26', () => {
      const result = generateString(30, 'deterministic');
      expect(result.length).toBe(30);
      expect(result.startsWith('abcdefghijklmnopqrstuvwxyzabcd')).toBe(true);
    });
  });

  describe('generateUrl', () => {
    it('starts with https://example.com/', () => {
      const result = generateUrl(50, 'deterministic');
      expect(result.startsWith('https://example.com/')).toBe(true);
    });

    it('matches approximate target length in deterministic mode', () => {
      const result = generateUrl(50, 'deterministic');
      expect(result.length).toBeGreaterThanOrEqual(45);
      expect(result.length).toBeLessThanOrEqual(55);
    });

    it('matches approximate target length in random mode', () => {
      const result = generateUrl(100, 'random');
      expect(result.length).toBeGreaterThanOrEqual(95);
      expect(result.length).toBeLessThanOrEqual(105);
    });

    it('handles short target length', () => {
      const result = generateUrl(10, 'deterministic');
      expect(result).toBe('https://example.com/');
    });

    it('handles zero target length', () => {
      const result = generateUrl(0, 'deterministic');
      expect(result).toBe('https://example.com/');
    });
  });

  describe('generateNumber', () => {
    it('deterministic mode returns midpoint', () => {
      const result = generateNumber(0, 100, 'deterministic');
      expect(result).toBe(50);
    });

    it('deterministic mode rounds integer midpoints', () => {
      const result = generateNumber(0, 99, 'deterministic');
      expect(Number.isInteger(result)).toBe(true);
    });

    it('deterministic mode respects integer boundaries', () => {
      const result = generateNumber(1, 10, 'deterministic');
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
    });

    it('random mode returns value within range', () => {
      const result = generateNumber(50, 100, 'random');
      expect(result).toBeGreaterThanOrEqual(50);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('random mode returns integer when min and max are integers', () => {
      const result = generateNumber(1, 100, 'random');
      expect(Number.isInteger(result)).toBe(true);
    });

    it('random mode can return float when boundaries are floats', () => {
      const result = generateNumber(0.5, 1.5, 'random');
      expect(result).toBeGreaterThanOrEqual(0.5);
      expect(result).toBeLessThanOrEqual(1.5);
    });

    it('handles negative ranges', () => {
      const result = generateNumber(-100, -50, 'deterministic');
      expect(result).toBe(-75);
    });

    it('handles single value range', () => {
      const result = generateNumber(42, 42, 'deterministic');
      expect(result).toBe(42);
    });
  });

  describe('generateUUID', () => {
    it('returns UUID v4 format', () => {
      const result = generateUUID();
      expect(result.length).toBe(36);
      expect(result[8]).toBe('-');
      expect(result[13]).toBe('-');
      expect(result[18]).toBe('-');
      expect(result[23]).toBe('-');
    });

    it('has 4 at position 14 (version 4)', () => {
      const result = generateUUID();
      expect(result[14]).toBe('4');
    });

    it('has valid variant bits at position 19', () => {
      const result = generateUUID();
      const variantChar = result[19];
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });

    it('generates different UUIDs on multiple calls', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });

    it('contains only valid hex characters and hyphens', () => {
      const result = generateUUID();
      const withoutHyphens = result.replace(/-/g, '');
      expect(/^[0-9a-f]+$/.test(withoutHyphens)).toBe(true);
    });
  });

  describe('parseObjectTemplate', () => {
    it('parses JSON5-like syntax with unquoted keys', () => {
      const result = parseObjectTemplate("{ name: 'test', age: 25 }");
      expect(result).toEqual({ name: 'test', age: 25 });
    });

    it('handles nested objects', () => {
      const result = parseObjectTemplate("{ user: { name: 'test' } }");
      expect(result).toEqual({ user: { name: 'test' } });
    });

    it('preserves @placeholders in single quotes', () => {
      const result = parseObjectTemplate("{ id: '@uuid', name: '@string(10)' }");
      expect(result).toEqual({ id: '@uuid', name: '@string(10)' });
    });

    it('handles mixed quoted and unquoted keys', () => {
      const result = parseObjectTemplate("{ normalKey: 'value', 'quotedKey': 42 }");
      expect(result.normalKey).toBe('value');
      expect(result.quotedKey).toBe(42);
    });

    it('handles boolean values', () => {
      const result = parseObjectTemplate("{ active: true, deleted: false }");
      expect(result).toEqual({ active: true, deleted: false });
    });

    it('handles number values', () => {
      const result = parseObjectTemplate("{ count: 42, price: 19.99 }");
      expect(result).toEqual({ count: 42, price: 19.99 });
    });

    it('handles arrays as values', () => {
      const result = parseObjectTemplate("{ tags: ['a', 'b', 'c'] }");
      expect(result).toEqual({ tags: ['a', 'b', 'c'] });
    });
  });

  describe('parseArrayTemplate', () => {
    it('parses array with single-quoted strings', () => {
      const result = parseArrayTemplate("['a', 'b', 'c']");
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('parses array of objects with unquoted keys', () => {
      const result = parseArrayTemplate("[{ name: 'test' }, { name: 'other' }]");
      expect(result).toEqual([{ name: 'test' }, { name: 'other' }]);
    });

    it('preserves @placeholders', () => {
      const result = parseArrayTemplate("['@uuid', '@string(10)']");
      expect(result).toEqual(['@uuid', '@string(10)']);
    });

    it('handles mixed types', () => {
      const result = parseArrayTemplate("[1, 'two', true, { four: 4 }]");
      expect(result).toEqual([1, 'two', true, { four: 4 }]);
    });

    it('handles nested arrays', () => {
      const result = parseArrayTemplate("[[1, 2], [3, 4]]");
      expect(result).toEqual([[1, 2], [3, 4]]);
    });

    it('handles empty array', () => {
      const result = parseArrayTemplate("[]");
      expect(result).toEqual([]);
    });
  });
});
