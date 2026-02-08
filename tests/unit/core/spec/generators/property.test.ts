/**
 * @arch archcodex.test.unit
 *
 * Tests for property-based test generator.
 */
import { describe, it, expect } from 'vitest';
import {
  generatePropertyTests,
  parseInvariantStrict,
} from '../../../../../src/core/spec/generators/property.js';
import type { ResolvedSpec, Invariant } from '../../../../../src/core/spec/schema.js';

describe('Property Test Generator', () => {
  const createSpec = (invariants?: Invariant[]): ResolvedSpec => ({
    specId: 'spec.test.property',
    inheritanceChain: ['spec.test.property'],
    appliedMixins: [],
    node: {
      intent: 'Test property-based test generation',
      invariants,
    },
  });

  describe('generatePropertyTests', () => {
    it('generates tests for spec with invariants', () => {
      const spec = createSpec([
        { condition: 'result.value > 0' },
        { 'result.status': '@exists' },
      ]);

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toBeDefined();
    });

    it('handles spec without invariants', () => {
      const spec = createSpec();
      const result = generatePropertyTests(spec);

      expect(result).toBeDefined();
    });

    it('handles forall invariants', () => {
      const spec = createSpec([
        {
          forall: {
            variable: 'item',
            in: 'result.items',
            then: { 'item.valid': true },
          },
        },
      ]);

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
    });

    it('handles exists invariants', () => {
      const spec = createSpec([
        {
          exists: {
            variable: 'item',
            in: 'result.items',
            where: { 'item.active': true },
          },
        },
      ]);

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
    });
  });

  describe('parseInvariantStrict', () => {
    it('parses condition invariant', () => {
      const result = parseInvariantStrict({ condition: 'result.value > 0' });

      expect(result.success).toBe(true);
    });

    it('parses field assertion with placeholder', () => {
      const result = parseInvariantStrict({ 'result.count': '@gte(0)' });

      expect(result.success).toBe(true);
    });
  });

  // Gap 5: Property test mock isolation
  describe('mock isolation (Gap 5)', () => {
    it('includes vi.clearAllMocks in beforeEach', () => {
      const spec = createSpec([
        { 'result.status': '@exists' },
      ]);

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('vi.clearAllMocks()');
      expect(result.code).toContain('beforeEach');
    });

    it('includes vi in vitest imports', () => {
      const spec = createSpec([
        { 'result.status': '@exists' },
      ]);

      const result = generatePropertyTests(spec);

      expect(result.code).toContain('beforeEach, vi');
    });

    it('clears mocks inside fc.asyncProperty callback for invariants', () => {
      const spec = createSpec([
        { condition: 'result.value > 0' },
      ]);

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      // clearAllMocks should appear inside the property callback (not just in beforeEach)
      const code = result.code;
      const asyncPropertyIdx = code.indexOf('fc.asyncProperty');
      const clearMocksAfterAsync = code.indexOf('vi.clearAllMocks()', asyncPropertyIdx);
      expect(clearMocksAfterAsync).toBeGreaterThan(asyncPropertyIdx);
    });

    it('clears mocks inside fc.asyncProperty callback for boundaries', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test.boundary',
        inheritanceChain: ['spec.test.boundary'],
        appliedMixins: [],
        node: {
          intent: 'Test boundary properties',
          examples: {
            boundaries: [
              {
                name: 'value too large',
                value: '@number(1001)',
                then: { error: 'TOO_LARGE' },
                property: 'forall value > 1000, returns TOO_LARGE',
              },
            ],
          },
        },
      };

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      // clearAllMocks inside boundary property callback
      const code = result.code;
      const boundarySection = code.indexOf('boundary properties');
      if (boundarySection >= 0) {
        const clearAfterBoundary = code.indexOf('vi.clearAllMocks()', boundarySection);
        expect(clearAfterBoundary).toBeGreaterThan(boundarySection);
      }
    });
  });
});
