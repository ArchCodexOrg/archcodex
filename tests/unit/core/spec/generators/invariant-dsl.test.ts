/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import {
  parseInvariant,
  parseInvariantStrict,
  parseInvariantMetadata,
  calculateInvariantStats,
  placeholderToAssertion,
  type InvariantParseResult,
  type StructuredInvariant,
} from '../../../../../src/core/spec/generators/invariant-dsl.js';

describe('invariant-dsl', () => {
  describe('parseInvariant', () => {
    it('returns testName from description and assertion from condition', () => {
      const invariant = {
        description: 'result is positive',
        condition: 'result > 0',
      };
      const result = parseInvariant(invariant);
      expect(result.testName).toContain('result is positive');
      expect(result.assertion).toContain('result > 0');
    });

    it('handles condition without description', () => {
      const invariant = {
        condition: 'result === 42',
      };
      const result = parseInvariant(invariant);
      expect(result.testName).toContain('condition');
      expect(result.assertion).toContain('result === 42');
    });

    it('handles field assertion with literal value', () => {
      const invariant = {
        'result.status': 'active',
      };
      const result = parseInvariant(invariant);
      expect(result.assertion).toContain('result.status');
      expect(result.assertion).toContain('toBe');
      expect(result.assertion).toContain('"active"');
    });

    it('handles forall invariant', () => {
      const invariant = {
        forall: {
          variable: 'item',
          in: 'result.items',
          then: { 'item.valid': true },
        },
      };
      const result = parseInvariant(invariant);
      expect(result.testName).toContain('forall');
      expect(result.assertion).toContain('for (const item');
    });
  });

  describe('parseInvariantStrict', () => {
    it('returns success for valid DSL condition', () => {
      const invariant = {
        condition: 'result.success === true',
      };
      const result = parseInvariantStrict(invariant);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('result.success === true');
      }
    });

    it('returns error for natural language string', () => {
      const invariant = 'result should be positive';
      const result = parseInvariantStrict(invariant);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INVARIANT_SYNTAX');
      }
    });

    it('returns error for invalid forall missing variable', () => {
      const invariant = {
        forall: {
          in: 'result.items',
          then: { 'item.valid': true },
        },
      };
      const result = parseInvariantStrict(invariant);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FORALL_SYNTAX');
      }
    });

    it('returns success for field assertion with placeholder', () => {
      const invariant = {
        'result.count': '@gt(0)',
      };
      const result = parseInvariantStrict(invariant);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toBeGreaterThan');
      }
    });

    it('handles multiple field assertions', () => {
      const invariant = {
        'result.status': 'active',
        'result.count': 5,
      };
      const result = parseInvariantStrict(invariant);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('result.status');
        expect(result.assertion).toContain('result.count');
      }
    });
  });

  describe('parseInvariantMetadata', () => {
    it('returns structured type for condition invariant', () => {
      const invariant = {
        description: 'result is valid',
        condition: 'result > 0',
      };
      const metadata = parseInvariantMetadata(invariant);
      expect(metadata.type).toBe('condition');
      expect(metadata.testable).toBe(true);
      expect(metadata.condition).toBe('result > 0');
      expect(metadata.description).toBe('result is valid');
    });

    it('returns structured type for assertion invariant', () => {
      const invariant = {
        'result.status': 'active',
      };
      const metadata = parseInvariantMetadata(invariant);
      expect(metadata.type).toBe('assertion');
      expect(metadata.testable).toBe(true);
      expect(metadata.path).toBe('result.status');
    });

    it('returns structured type for forall invariant', () => {
      const invariant = {
        forall: {
          variable: 'item',
          in: 'result.items',
          then: { 'item.valid': true },
        },
      };
      const metadata = parseInvariantMetadata(invariant);
      expect(metadata.type).toBe('forall');
      expect(metadata.testable).toBe(true);
      expect(metadata.variable).toBe('item');
      expect(metadata.collection).toBe('result.items');
    });

    it('returns structured type for exists invariant', () => {
      const invariant = {
        exists: {
          variable: 'item',
          in: 'result.items',
          where: { 'item.status': 'active' },
        },
      };
      const metadata = parseInvariantMetadata(invariant);
      expect(metadata.type).toBe('exists');
      expect(metadata.testable).toBe(true);
      expect(metadata.variable).toBe('item');
      expect(metadata.collection).toBe('result.items');
      expect(metadata.hasFilter).toBe(true);
    });

    it('handles forall without filter', () => {
      const invariant = {
        forall: {
          variable: 'item',
          in: 'result.items',
          then: { 'item.valid': true },
        },
      };
      const metadata = parseInvariantMetadata(invariant);
      expect(metadata.hasFilter).toBe(false);
    });

    it('treats string invariants as notes', () => {
      const invariant = 'This is a prose note';
      const metadata = parseInvariantMetadata(invariant);
      expect(metadata.type).toBe('note');
      expect(metadata.testable).toBe(false);
    });
  });

  describe('calculateInvariantStats', () => {
    it('counts invariants by type', () => {
      const invariants: StructuredInvariant[] = [
        { type: 'condition', testable: true },
        { type: 'condition', testable: true },
        { type: 'assertion', testable: true },
        { type: 'forall', testable: true },
        { type: 'note', testable: false },
      ];
      const stats = calculateInvariantStats(invariants);

      expect(stats.total).toBe(5);
      expect(stats.testable).toBe(4);
      expect(stats.byType.condition).toBe(2);
      expect(stats.byType.assertion).toBe(1);
      expect(stats.byType.forall).toBe(1);
      expect(stats.byType.note).toBe(1);
      expect(stats.byType.exists).toBe(0);
    });

    it('handles empty array', () => {
      const stats = calculateInvariantStats([]);
      expect(stats.total).toBe(0);
      expect(stats.testable).toBe(0);
      expect(stats.byType.condition).toBe(0);
    });

    it('counts only testable invariants', () => {
      const invariants: StructuredInvariant[] = [
        { type: 'note', testable: false },
        { type: 'note', testable: false },
        { type: 'assertion', testable: true },
      ];
      const stats = calculateInvariantStats(invariants);
      expect(stats.testable).toBe(1);
    });
  });

  describe('placeholderToAssertion', () => {
    it('converts @defined to toBeDefined', () => {
      const result = { type: 'assertion', asserts: 'defined' };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toBe('expect(result).toBeDefined();');
    });

    it('converts @contains to toContain', () => {
      const result = { type: 'assertion', asserts: 'contains', value: 'test' };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('toContain');
      expect(code).toContain('"test"');
    });

    it('converts @gt to toBeGreaterThan', () => {
      const result = { type: 'assertion', asserts: 'greaterThan', value: 5 };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toBe('expect(result).toBeGreaterThan(5);');
    });

    it('converts @lt to toBeLessThan', () => {
      const result = { type: 'assertion', asserts: 'lessThan', value: 100 };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toBe('expect(result).toBeLessThan(100);');
    });

    it('converts @between to range check', () => {
      const result = { type: 'assertion', asserts: 'between', min: 1, max: 100 };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('toBeGreaterThanOrEqual(1)');
      expect(code).toContain('toBeLessThanOrEqual(100)');
    });

    it('converts @hasItem with string to toContain', () => {
      const result = { type: 'assertion', asserts: 'hasItem', value: 'item' };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('toContain');
    });

    it('converts @hasItem with object to arrayContaining', () => {
      const result = { type: 'assertion', asserts: 'hasItem', value: { name: 'test' } };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('arrayContaining');
      expect(code).toContain('objectContaining');
    });

    it('converts @hasProperties to toMatchObject', () => {
      const result = { type: 'assertion', asserts: 'hasProperties', value: { a: 1 } };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('toMatchObject');
    });

    it('converts @type(array) to Array.isArray', () => {
      const result = { type: 'assertion', asserts: 'type', value: 'array' };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('Array.isArray');
    });

    it('converts @matches to toMatch', () => {
      const result = { type: 'assertion', asserts: 'matches', pattern: '^test' };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('toMatch');
      expect(code).toContain('/^test/');
    });

    it('converts @all to multiple assertions', () => {
      const nested = [
        { type: 'assertion', asserts: 'greaterThan', value: 0 },
        { type: 'assertion', asserts: 'lessThan', value: 100 },
      ];
      const result = { type: 'assertion', asserts: 'all', value: nested };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('toBeGreaterThan(0)');
      expect(code).toContain('toBeLessThan(100)');
    });

    it('handles empty as toHaveLength(0)', () => {
      const result = { type: 'assertion', asserts: 'empty' };
      const code = placeholderToAssertion(result, 'result');
      expect(code).toContain('toHaveLength(0)');
    });
  });
});
