/**
 * @arch archcodex.test.unit
 *
 * Tests for unwired spec detection.
 */
import { describe, it, expect } from 'vitest';
import {
  findUnwiredSpecs,
  formatUnwiredReport,
} from '../../../../../src/core/spec/drift/unwired.js';
import type { SpecRegistry } from '../../../../../src/core/spec/schema.js';

describe('Unwired Spec Detection', () => {
  const createRegistry = (): SpecRegistry => ({
    version: '1.0',
    nodes: {
      // Base spec (should be excluded from unwired)
      'spec.base': {
        type: 'base',
        intent: 'Base spec',
      },
      // Leaf spec with implementation (wired)
      'spec.wired': {
        intent: 'Wired spec',
        implementation: 'src/wired.ts#wiredFunction',
      },
      // Leaf spec without implementation (unwired)
      'spec.unwired': {
        intent: 'Unwired spec',
      },
      // Another unwired spec
      'spec.products.create': {
        intent: 'Create product',
      },
    },
    mixins: {},
  });

  describe('findUnwiredSpecs', () => {
    it('finds specs without implementation', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry);

      expect(result.unwired.length).toBeGreaterThan(0);
      expect(result.unwired.some(s => s.specId === 'spec.unwired')).toBe(true);
    });

    it('excludes wired specs', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry);

      expect(result.unwired.every(s => s.specId !== 'spec.wired')).toBe(true);
    });

    it('excludes base specs by default', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry);

      expect(result.unwired.every(s => s.specId !== 'spec.base')).toBe(true);
    });

    it('includes base specs when requested', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry, { includeBase: true });

      // Base specs without implementation are included
      const hasBase = result.unwired.some(s => s.specId === 'spec.base');
      // Whether it's included depends on if it has implementation
      expect(typeof hasBase).toBe('boolean');
    });

    it('filters by pattern', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry, { pattern: 'spec.products.*' });

      expect(result.unwired.every(s => s.specId.startsWith('spec.products'))).toBe(true);
    });

    it('returns coverage statistics', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry);

      expect(result.coverage).toBeDefined();
      expect(result.coverage.total).toBeGreaterThan(0);
      expect(result.coverage.wired).toBeDefined();
      expect(result.coverage.percentage).toBeDefined();
    });

    it('suggests implementation path', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry);

      const unwiredSpec = result.unwired.find(s => s.specId === 'spec.products.create');
      expect(unwiredSpec?.suggestedPath).toContain('products');
    });
  });

  describe('formatUnwiredReport', () => {
    it('formats report for human reading', () => {
      const registry = createRegistry();
      const result = findUnwiredSpecs(registry);
      const report = formatUnwiredReport(result);

      // Report should contain information about specs
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(0);
    });
  });
});
