/**
 * @arch archcodex.core.domain
 *
 * Tests for strict invariant DSL parsing.
 * Generated from spec.speccodex.invariantDSL
 */
import { describe, it, expect } from 'vitest';
import { parseInvariantStrict, InvariantParseResult } from '../../src/core/spec/generators/property.js';

describe('parseInvariantStrict (from spec.speccodex.invariantDSL)', () => {
  describe('success cases', () => {
    // Condition expressions
    it('simple equality condition', () => {
      const result = parseInvariantStrict({ condition: 'result === input.a * input.b' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('expect(result === input.a * input.b).toBe(true)');
      }
    });

    it('boolean condition with OR', () => {
      const result = parseInvariantStrict({ condition: 'result.success || result.errors.length > 0' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('result.success || result.errors.length > 0');
        expect(result.assertion).toContain('toBe(true)');
      }
    });

    it('string method condition', () => {
      const result = parseInvariantStrict({ condition: "result.title.startsWith('Copy of ')" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('startsWith');
      }
    });

    // Field assertions with placeholders
    it('greater than zero', () => {
      const result = parseInvariantStrict({ 'result.count': '@gt(0)' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toBeGreaterThan(0)');
      }
    });

    it('between range', () => {
      const result = parseInvariantStrict({ 'result.score': '@between(0, 100)' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toBeGreaterThanOrEqual(0)');
        expect(result.assertion).toContain('toBeLessThanOrEqual(100)');
      }
    });

    it('regex match', () => {
      const result = parseInvariantStrict({ 'result.orderId': "@matches('^ORD-[0-9]+$')" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toMatch');
        expect(result.assertion).toContain('ORD-[0-9]+');
      }
    });

    it('array length', () => {
      const result = parseInvariantStrict({ 'result.items': '@length(5)' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toHaveLength(5)');
      }
    });

    it('array has item', () => {
      const result = parseInvariantStrict({ 'result.items': '@hasItem({ id: 1 })' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('arrayContaining');
      }
    });

    it('composite assertion with @all', () => {
      const result = parseInvariantStrict({ 'result.value': '@all(@gt(0), @lt(100))' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toBeGreaterThan(0)');
        expect(result.assertion).toContain('toBeLessThan(100)');
      }
    });

    // Forall invariants
    it('forall with equality', () => {
      const result = parseInvariantStrict({
        forall: {
          variable: 'item',
          in: 'result.items',
          then: { 'item.status': 'active' },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('for');
        expect(result.assertion).toContain('result.items');
        expect(result.assertion).toContain('item.status');
      }
    });

    it('forall with placeholder', () => {
      const result = parseInvariantStrict({
        forall: {
          variable: 'item',
          in: 'input.items',
          then: { 'item.quantity': '@gte(1)' },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toBeGreaterThanOrEqual(1)');
      }
    });

    // Exists invariants
    it('exists with condition', () => {
      const result = parseInvariantStrict({
        exists: {
          variable: 'item',
          in: 'result.items',
          where: { 'item.status': 'active' },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('some');
        expect(result.assertion).toContain('item.status');
      }
    });

    // Literal equality
    it('literal equality check', () => {
      const result = parseInvariantStrict({ 'result.valid': true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('toBe(true)');
      }
    });
  });

  describe('error cases (strict DSL validation)', () => {
    it('unrecognized string invariant returns INVALID_INVARIANT_SYNTAX', () => {
      const result = parseInvariantStrict('this is just random text' as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INVARIANT_SYNTAX');
        expect(result.error.message).toContain('Unrecognized invariant syntax');
        expect(result.error.hint).toContain('condition:');
        expect(result.error.hint).toContain('{ condition: "result === expectedValue" }');
      }
    });

    it('natural language invariant is rejected', () => {
      const result = parseInvariantStrict('result equals a times b' as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INVARIANT_SYNTAX');
        expect(result.error.hint).toContain('JavaScript condition');
      }
    });

    it('malformed forall missing variable', () => {
      const result = parseInvariantStrict({
        forall: {
          in: 'result.items',
          then: { 'item.valid': true },
        },
      } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FORALL_SYNTAX');
        expect(result.error.message).toContain('variable');
      }
    });

    it('malformed forall missing in', () => {
      const result = parseInvariantStrict({
        forall: {
          variable: 'item',
          then: { 'item.valid': true },
        },
      } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FORALL_SYNTAX');
        expect(result.error.message).toContain('in');
      }
    });

    it('malformed forall missing then', () => {
      const result = parseInvariantStrict({
        forall: {
          variable: 'item',
          in: 'result.items',
        },
      } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FORALL_SYNTAX');
        expect(result.error.message).toContain('then');
      }
    });

    it('malformed exists missing variable', () => {
      const result = parseInvariantStrict({
        exists: {
          in: 'result.items',
          where: { 'item.valid': true },
        },
      } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_EXISTS_SYNTAX');
        expect(result.error.message).toContain('variable');
      }
    });

    it('exists without where is valid (simple existence check)', () => {
      // After schema update, exists without where is valid - checks collection is non-empty
      const result = parseInvariantStrict({
        exists: {
          variable: 'item',
          in: 'result.items',
        },
      } as any);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assertion).toContain('length');
        expect(result.assertion).toContain('toBeGreaterThan(0)');
      }
    });

    it('unknown placeholder returns UNKNOWN_PLACEHOLDER with suggestions', () => {
      const result = parseInvariantStrict({ 'result.field': '@unknown_assertion' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNKNOWN_PLACEHOLDER');
        expect(result.error.message).toContain('Unknown placeholder');
        expect(result.error.hint).toContain('@gt(n)');
        expect(result.error.hint).toContain('@exists');
      }
    });
  });

  describe('LLM-friendly error hints', () => {
    it('INVALID_INVARIANT_SYNTAX includes all valid patterns', () => {
      const result = parseInvariantStrict('some natural language' as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should include all 3 DSL patterns
        expect(result.error.hint).toContain('JavaScript condition');
        expect(result.error.hint).toContain('Field assertion');
        expect(result.error.hint).toContain('Loop assertion');
        expect(result.error.hint).toContain('forall');
      }
    });

    it('INVALID_FORALL_SYNTAX includes example', () => {
      const result = parseInvariantStrict({
        forall: { variable: 'item', in: 'items' },
      } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.hint).toContain('Example:');
        expect(result.error.hint).toContain('forall:');
        expect(result.error.hint).toContain('variable:');
        expect(result.error.hint).toContain('then:');
      }
    });

    it('UNKNOWN_PLACEHOLDER includes available placeholders', () => {
      const result = parseInvariantStrict({ 'result.x': '@notreal' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.hint).toContain('@gt(n)');
        expect(result.error.hint).toContain('@gte(n)');
        expect(result.error.hint).toContain('@lt(n)');
        expect(result.error.hint).toContain('@between(min, max)');
        expect(result.error.hint).toContain('@exists');
        expect(result.error.hint).toContain('@matches(regex)');
        expect(result.error.hint).toContain('@length(n)');
      }
    });
  });
});
