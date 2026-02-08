/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for findUnwiredSpecs - generated from spec.speccodex.drift.unwired
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { findUnwiredSpecs, formatUnwiredReport } from '../../src/core/spec/drift/unwired.js';
import { loadSpecRegistry } from '../../src/core/spec/loader.js';
import type { SpecRegistry } from '../../src/core/spec/schema.js';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

describe('findUnwiredSpecs', () => {
  describe('success cases (from spec)', () => {
    it('all specs wired returns empty unwired list', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.test.a': { intent: 'A', implementation: 'src/a.ts#a' },
          'spec.test.b': { intent: 'B', implementation: 'src/b.ts#b' },
        },
        mixins: {},
      };

      const result = findUnwiredSpecs(registry);

      expect(result.unwired).toEqual([]);
      expect(result.coverage.percentage).toBe(100);
    });

    it('some specs unwired returns them in list', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.test.a': { intent: 'A', implementation: 'src/a.ts#a' },
          'spec.test.b': { intent: 'B' }, // No implementation
          'spec.test.c': { intent: 'C' }, // No implementation
        },
        mixins: {},
      };

      const result = findUnwiredSpecs(registry);

      expect(result.unwired.length).toBe(2);
      expect(result.unwired.map(s => s.specId)).toContain('spec.test.b');
      expect(result.unwired.map(s => s.specId)).toContain('spec.test.c');
      // 1 wired out of 3 = 33.3%
      expect(result.coverage.percentage).toBeCloseTo(33.3, 0);
    });

    it('base specs excluded by default', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.function': { required_fields: ['intent'] }, // Base spec
          'spec.mutation': { inherits: 'spec.function' }, // Base spec (no intent, no examples)
          'spec.test.a': { inherits: 'spec.mutation', intent: 'A' }, // Leaf, unwired
        },
        mixins: {},
      };

      const result = findUnwiredSpecs(registry, { includeBase: false });

      // Only leaf spec should be in unwired (base specs excluded)
      expect(result.unwired.map(s => s.specId)).toContain('spec.test.a');
      expect(result.unwired.map(s => s.specId)).not.toContain('spec.function');
      expect(result.unwired.map(s => s.specId)).not.toContain('spec.mutation');
    });

    it('base specs included when option set', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.function': { required_fields: ['intent'] }, // Base spec
          'spec.test.a': { inherits: 'spec.function', intent: 'A' },
        },
        mixins: {},
      };

      const result = findUnwiredSpecs(registry, { includeBase: true });

      expect(result.unwired.map(s => s.specId)).toContain('spec.function');
      expect(result.unwired.map(s => s.specId)).toContain('spec.test.a');
    });

    it('suggests implementation path from spec ID', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.product.create': { intent: 'Create product' },
        },
        mixins: {},
      };

      const result = findUnwiredSpecs(registry);

      expect(result.unwired[0].suggestedPath).toContain('product');
      expect(result.unwired[0].suggestedPath).toContain('create');
    });

    it('pattern filter works', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.auth.login': { intent: 'Login' },
          'spec.auth.logout': { intent: 'Logout' },
          'spec.product.create': { intent: 'Create', implementation: 'src/product.ts#create' },
          'spec.product.delete': { intent: 'Delete' },
        },
        mixins: {},
      };

      const result = findUnwiredSpecs(registry, { pattern: 'spec.auth.*' });

      expect(result.unwired.length).toBe(2);
      expect(result.unwired.map(s => s.specId)).toContain('spec.auth.login');
      expect(result.unwired.map(s => s.specId)).toContain('spec.auth.logout');
      expect(result.unwired.map(s => s.specId)).not.toContain('spec.product.delete');
    });

    it('tracks hasExamples flag', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.with.examples': {
            intent: 'Has examples',
            examples: {
              success: [{ name: 'test', given: {}, then: {} }],
            },
          },
          'spec.without.examples': {
            intent: 'No examples',
          },
        },
        mixins: {},
      };

      const result = findUnwiredSpecs(registry);

      const withExamples = result.unwired.find(s => s.specId === 'spec.with.examples');
      const withoutExamples = result.unwired.find(s => s.specId === 'spec.without.examples');

      expect(withExamples?.hasExamples).toBe(true);
      expect(withoutExamples?.hasExamples).toBe(false);
    });
  });

  describe('formatUnwiredReport', () => {
    it('formats empty result', () => {
      const result = {
        unwired: [],
        coverage: { total: 5, wired: 5, unwired: 0, percentage: 100 },
      };

      const report = formatUnwiredReport(result);

      expect(report).toContain('100%');
      expect(report).toContain('All specs are wired');
    });

    it('formats unwired specs', () => {
      const result = {
        unwired: [
          { specId: 'spec.test.a', isBase: false, suggestedPath: 'src/test/a.ts', hasExamples: true },
          { specId: 'spec.test.b', isBase: false, suggestedPath: 'src/test/b.ts', hasExamples: false },
        ],
        coverage: { total: 4, wired: 2, unwired: 2, percentage: 50 },
      };

      const report = formatUnwiredReport(result);

      expect(report).toContain('50%');
      expect(report).toContain('spec.test.a');
      expect(report).toContain('[has examples]');
      expect(report).toContain('src/test/a.ts');
    });
  });

  describe('integration with real registry', () => {
    let registry: SpecRegistry;

    beforeAll(async () => {
      registry = await loadSpecRegistry(PROJECT_ROOT);
    });

    it('finds unwired specs in actual registry', () => {
      const result = findUnwiredSpecs(registry);

      // We should have some specs
      expect(result.coverage.total).toBeGreaterThan(0);

      // All specs should be wired to implementations
      expect(result.unwired.length).toBe(0);
    });

    it('verification specs are wired', () => {
      const result = findUnwiredSpecs(registry, { pattern: 'spec.speccodex.drift.*' });

      // All drift specs should be wired (we added implementation field)
      expect(result.coverage.wired).toBeGreaterThan(0);
    });

    it('generates report for real registry', () => {
      const result = findUnwiredSpecs(registry);
      const report = formatUnwiredReport(result);

      expect(report).toContain('Spec Wiring Coverage');
      expect(report).toContain('%');
    });
  });
});
