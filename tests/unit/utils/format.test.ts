/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for format utility functions.
 */
import { describe, it, expect } from 'vitest';
import { formatConstraintValue, makeConstraintKey } from '../../../src/utils/format.js';

describe('formatConstraintValue', () => {
  describe('primitives', () => {
    it('should format string values', () => {
      expect(formatConstraintValue('test')).toBe('test');
    });

    it('should format number values', () => {
      expect(formatConstraintValue(42)).toBe('42');
    });

    it('should format boolean values', () => {
      expect(formatConstraintValue(true)).toBe('true');
      expect(formatConstraintValue(false)).toBe('false');
    });

    it('should format null values', () => {
      expect(formatConstraintValue(null)).toBe('null');
    });
  });

  describe('undefined handling', () => {
    it('should return "undefined" by default', () => {
      expect(formatConstraintValue(undefined)).toBe('undefined');
    });

    it('should return empty string when handleUndefined is true', () => {
      expect(formatConstraintValue(undefined, { handleUndefined: true })).toBe('');
    });
  });

  describe('arrays', () => {
    it('should join array values with comma by default', () => {
      expect(formatConstraintValue(['a', 'b', 'c'])).toBe('a,b,c');
    });

    it('should use custom separator when provided', () => {
      expect(formatConstraintValue(['a', 'b', 'c'], { arraySeparator: ' | ' })).toBe('a | b | c');
    });

    it('should wrap arrays in brackets when wrapArrays is true', () => {
      expect(formatConstraintValue(['a', 'b'], { wrapArrays: true })).toBe('[a,b]');
    });

    it('should handle empty arrays', () => {
      expect(formatConstraintValue([])).toBe('');
    });

    it('should handle single-item arrays', () => {
      expect(formatConstraintValue(['only'])).toBe('only');
    });
  });

  describe('objects', () => {
    it('should return "object" for generic objects by default', () => {
      expect(formatConstraintValue({ key: 'value' })).toBe('object');
    });

    it('should format objects with source_type as coverage string', () => {
      expect(formatConstraintValue({ source_type: 'test' })).toBe('coverage:test');
    });

    it('should return JSON when objectFallback is "json"', () => {
      const obj = { key: 'value' };
      expect(formatConstraintValue(obj, { objectFallback: 'json' })).toBe(JSON.stringify(obj));
    });

    it('should handle complex objects with source_type', () => {
      const obj = { source_type: 'unit', coverage: 80 };
      expect(formatConstraintValue(obj)).toBe('coverage:unit');
    });
  });

  describe('combined options', () => {
    it('should apply multiple options together', () => {
      const result = formatConstraintValue(['x', 'y'], {
        arraySeparator: '-',
        wrapArrays: true,
      });
      expect(result).toBe('[x-y]');
    });
  });
});

describe('makeConstraintKey', () => {
  describe('with array values', () => {
    it('should create key with sorted array values', () => {
      const constraint = { rule: 'forbid_import', value: ['z', 'a', 'm'] };
      expect(makeConstraintKey(constraint)).toBe('forbid_import:a,m,z');
    });

    it('should create consistent keys regardless of array order', () => {
      const c1 = { rule: 'forbid_import', value: ['a', 'b', 'c'] };
      const c2 = { rule: 'forbid_import', value: ['c', 'a', 'b'] };
      expect(makeConstraintKey(c1)).toBe(makeConstraintKey(c2));
    });

    it('should handle empty arrays', () => {
      const constraint = { rule: 'forbid_import', value: [] };
      expect(makeConstraintKey(constraint)).toBe('forbid_import:');
    });

    it('should handle single-item arrays', () => {
      const constraint = { rule: 'forbid_import', value: ['axios'] };
      expect(makeConstraintKey(constraint)).toBe('forbid_import:axios');
    });
  });

  describe('with primitive values', () => {
    it('should create key with string value', () => {
      const constraint = { rule: 'max_file_lines', value: '500' };
      expect(makeConstraintKey(constraint)).toBe('max_file_lines:500');
    });

    it('should create key with number value', () => {
      const constraint = { rule: 'max_file_lines', value: 500 };
      expect(makeConstraintKey(constraint)).toBe('max_file_lines:500');
    });

    it('should create key with boolean value', () => {
      const constraint = { rule: 'strict', value: true };
      expect(makeConstraintKey(constraint)).toBe('strict:true');
    });
  });

  describe('different rules', () => {
    it('should create different keys for different rules with same value', () => {
      const c1 = { rule: 'forbid_import', value: ['axios'] };
      const c2 = { rule: 'require_import', value: ['axios'] };
      expect(makeConstraintKey(c1)).not.toBe(makeConstraintKey(c2));
    });
  });
});
