/**
 * @arch archcodex.core.domain
 *
 * Tests for test generators - dogfooding from spec.speccodex.generate.*
 */
import { describe, it, expect } from 'vitest';
import {
  generateUnitTests,
  generatePropertyTests,
  generateIntegrationTests,
} from '../../src/core/spec/generators/index.js';
import type { ResolvedSpec } from '../../src/core/spec/schema.js';

// Helper to create a minimal resolved spec
function createSpec(overrides: Partial<ResolvedSpec['node']> & { specId?: string }): ResolvedSpec {
  const { specId = 'spec.test', ...node } = overrides;
  return {
    specId,
    inheritanceChain: [specId],
    appliedMixins: [],
    node: {
      intent: 'Test function',
      ...node,
    },
  };
}

describe('generateUnitTests (from spec.speccodex.generate.unit)', () => {
  describe('success cases', () => {
    it('generates from success examples', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        examples: {
          success: [
            { name: 'valid url', given: { url: 'https://github.com' }, then: { 'result.url': 'https://github.com' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.testCount).toBe(1);
      expect(result.code).toContain("it('valid url'");
    });

    it('generates from error examples', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        examples: {
          errors: [
            { name: 'invalid url', given: { url: 'not-a-url' }, then: { error: 'INVALID_URL' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.testCount).toBe(1);
      expect(result.code).toContain('rejects');
    });

    it('generates with boundaries', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        examples: {
          boundaries: [
            { name: 'url at max length', url: '@string(2048)', then: { result: '@created' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.testCount).toBe(1);
    });

    it('expands placeholders', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          success: [
            { name: 'authenticated user', given: { user: '@authenticated' }, then: { result: '@exists' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      // Should contain expanded placeholder values
      expect(result.code).toContain('user_test_123');
    });

    it('generates with markers', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: { success: [{ name: 'test', given: {}, then: { result: true } }] },
      });

      const result = generateUnitTests(spec, { markers: true });

      expect(result.code).toContain('// @speccodex:start');
      expect(result.code).toContain('// @speccodex:end');
    });

    it('generates without markers when disabled', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: { success: [{ name: 'test', given: {}, then: { result: true } }] },
      });

      const result = generateUnitTests(spec, { markers: false });

      expect(result.code).not.toContain('// @speccodex:start');
    });
  });

  describe('error cases', () => {
    it('returns error for spec without examples', () => {
      const spec = createSpec({
        specId: 'spec.test',
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('NO_EXAMPLES');
    });

    it('returns error for invalid spec (missing intent)', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: ['spec.test'],
        appliedMixins: [],
        node: {
          examples: { success: [{ name: 'test', then: { result: true } }] },
        },
      };

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_SPEC');
    });
  });

  // Improvement #7: Coverage Generation
  describe('coverage generation (Improvement #7)', () => {
    it('generates enum value tests in full coverage mode', () => {
      const spec = createSpec({
        specId: 'spec.item.create',
        inputs: {
          status: { type: 'enum', values: ['draft', 'published', 'archived'] },
        },
        examples: {
          success: [{ name: 'basic', given: { status: 'draft' }, then: { result: true } }],
        },
      });

      const result = generateUnitTests(spec, { coverage: 'full' });

      expect(result.valid).toBe(true);
      expect(result.coverageStats).toBeDefined();
      expect(result.coverageStats?.enumCoverage).toBeGreaterThan(0);
      expect(result.code).toContain('enum value coverage');
      expect(result.code).toContain("status: 'published'");
      expect(result.code).toContain("status: 'archived'");
    });

    it('generates boundary tests for numeric fields', () => {
      const spec = createSpec({
        specId: 'spec.item.create',
        inputs: {
          count: { type: 'number', min: 0, max: 100 },
        },
        examples: {
          success: [{ name: 'basic', given: { count: 50 }, then: { result: true } }],
        },
      });

      const result = generateUnitTests(spec, { coverage: 'full' });

      expect(result.valid).toBe(true);
      expect(result.coverageStats?.boundaryCoverage).toBeGreaterThan(0);
      expect(result.code).toContain('boundary coverage');
      expect(result.code).toContain('count at minimum (0)');
      expect(result.code).toContain('count at maximum (100)');
    });

    it('generates boundary tests for string max length', () => {
      const spec = createSpec({
        specId: 'spec.item.create',
        inputs: {
          title: { type: 'string', max: 200 },
        },
        examples: {
          success: [{ name: 'basic', given: { title: 'test' }, then: { result: true } }],
        },
      });

      const result = generateUnitTests(spec, { coverage: 'full' });

      expect(result.valid).toBe(true);
      expect(result.code).toContain('title at max length (200)');
      expect(result.code).toContain("'a'.repeat(200)");
    });

    it('does not generate duplicate tests for covered cases', () => {
      const spec = createSpec({
        specId: 'spec.item.create',
        inputs: {
          status: { type: 'enum', values: ['draft', 'published'] },
        },
        examples: {
          success: [
            { name: 'handles status=draft', given: { status: 'draft' }, then: { result: true } },
            { name: 'handles status=published', given: { status: 'published' }, then: { result: true } },
          ],
        },
      });

      const result = generateUnitTests(spec, { coverage: 'full' });

      expect(result.valid).toBe(true);
      // Should not generate enum tests since all values are covered
      expect(result.coverageStats?.enumCoverage).toBe(0);
    });

    it('reports coverage statistics', () => {
      const spec = createSpec({
        specId: 'spec.item.create',
        inputs: {
          status: { type: 'enum', values: ['a', 'b', 'c'] },
          count: { type: 'number', min: 0, max: 10 },
        },
        examples: {
          success: [{ name: 'basic', given: {}, then: { result: true } }],
        },
      });

      const result = generateUnitTests(spec, { coverage: 'full' });

      expect(result.coverageStats).toBeDefined();
      expect(result.coverageStats?.fromExamples).toBe(1);
      expect(result.coverageStats?.generated).toBeGreaterThan(0);
      expect(result.coverageStats?.enumCoverage).toBe(3); // 3 enum values
      expect(result.coverageStats?.boundaryCoverage).toBeGreaterThan(0);
    });

    it('does not include coverage stats when mode is examples', () => {
      const spec = createSpec({
        specId: 'spec.item.create',
        inputs: {
          status: { type: 'enum', values: ['a', 'b'] },
        },
        examples: {
          success: [{ name: 'basic', given: {}, then: { result: true } }],
        },
      });

      const result = generateUnitTests(spec, { coverage: 'examples' });

      expect(result.coverageStats).toBeUndefined();
    });
  });

  // Improvement #4: Test Name Synchronization
  describe('naming (Improvement #4)', () => {
    it('uses example.name directly as test name', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          success: [
            { name: 'valid URL creates product', given: {}, then: { result: true } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.testNames).toContain('valid URL creates product');
      expect(result.code).toContain("it('valid URL creates product'");
    });

    it('warns when example name is missing', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          success: [
            { given: { url: 'https://x.com' }, then: { result: true } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('MISSING_NAME');
      expect(result.testNames).toContain('example 1');
    });

    it('errors on duplicate example names', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          success: [
            { name: 'test case', given: {}, then: {} },
            { name: 'test case', given: {}, then: {} },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_NAME')).toBe(true);
    });

    it('tracks all test names for traceability', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: {
          success: [
            { name: 'success test 1', given: {}, then: {} },
            { name: 'success test 2', given: {}, then: {} },
          ],
          errors: [
            { name: 'error test 1', given: {}, then: { error: 'ERROR' } },
          ],
        },
      });

      const result = generateUnitTests(spec);

      expect(result.testNames).toHaveLength(3);
      expect(result.testNames).toContain('success test 1');
      expect(result.testNames).toContain('success test 2');
      expect(result.testNames).toContain('error test 1');
    });
  });
});

describe('generatePropertyTests (from spec.speccodex.generate.property)', () => {
  describe('success cases', () => {
    it('generates from invariants', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        inputs: {
          url: { type: 'string', validate: 'url' },
        },
        invariants: [
          { 'result.url': 'valid_url' },
        ],
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.propertyCount).toBe(1);
      expect(result.code).toContain('fc.assert');
      expect(result.code).toContain('fc.webUrl');
    });

    it('generates arbitrary from input schema', () => {
      const spec = createSpec({
        specId: 'spec.test',
        inputs: {
          name: { type: 'string', max: 100 },
          count: { type: 'number', min: 0, max: 1000 },
        },
        invariants: ['result is always defined'],
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('fc.string({ maxLength: 100 })');
      expect(result.code).toContain('fc.integer({ min: 0, max: 1000 })');
    });

    it('generates from boundary with property field', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        examples: {
          boundaries: [
            {
              name: 'url too long',
              url: '@string(2049)',
              then: { error: 'URL_TOO_LONG' },
              property: 'forall url.length > 2048, returns URL_TOO_LONG',
            },
          ],
        },
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.propertyCount).toBe(1);
    });

    it('handles multiple invariants', () => {
      const spec = createSpec({
        specId: 'spec.test',
        invariants: [
          { 'result.id': '@defined' },
          { 'result.createdAt': '@lt(@now)' },
          'userId equals ctx.userId',
        ],
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.propertyCount).toBe(3);
    });
  });

  describe('error cases', () => {
    it('returns error for spec without invariants or boundaries', () => {
      const spec = createSpec({
        specId: 'spec.test',
        examples: { success: [] },
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('NO_INVARIANTS');
    });
  });

  // Improvement #3: Structured invariants
  describe('structured invariants (Improvement #3)', () => {
    it('generates forall invariant property test', () => {
      const spec = createSpec({
        specId: 'spec.items.get',
        invariants: [
          {
            forall: {
              variable: 'item',
              in: 'result.items',
              then: { 'item.status': 'valid' },
            },
          },
        ],
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.propertyCount).toBe(1);
      expect(result.code).toContain('for (const item of result.items)');
      expect(result.code).toContain('expect(item.status).toBe("valid")');
    });

    it('generates forall invariant with where filter', () => {
      const spec = createSpec({
        specId: 'spec.items.get',
        invariants: [
          {
            forall: {
              variable: 'item',
              in: 'result.items',
              where: { 'item.type': 'active' },
              then: { 'item.visible': true },
            },
          },
        ],
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('filter');
      expect(result.code).toContain('item.type === "active"');
      expect(result.code).toContain('expect(item.visible).toBe(true)');
    });

    it('generates exists invariant property test', () => {
      const spec = createSpec({
        specId: 'spec.items.get',
        invariants: [
          {
            exists: {
              variable: 'item',
              in: 'result.items',
              where: { 'item.status': 'active' },
            },
          },
        ],
      });

      const result = generatePropertyTests(spec);

      expect(result.valid).toBe(true);
      expect(result.propertyCount).toBe(1);
      expect(result.code).toContain('.some(item =>');
      expect(result.code).toContain('item.status === "active"');
    });

    it('generates meaningful test names for structured invariants', () => {
      const spec = createSpec({
        specId: 'spec.items.get',
        invariants: [
          {
            forall: {
              variable: 'x',
              in: 'items',
              then: { 'x.valid': true },
            },
          },
          {
            exists: {
              variable: 'y',
              in: 'results',
              where: { 'y.primary': true },
            },
          },
        ],
      });

      const result = generatePropertyTests(spec);

      expect(result.code).toContain("'forall x in items");
      expect(result.code).toContain("'exists y in results");
    });
  });
});

// Gap 5: Property test mock isolation
describe('generatePropertyTests - mock isolation (Gap 5)', () => {
  it('property tests clear mocks between iterations', () => {
    const spec = createSpec({
      specId: 'spec.test',
      inputs: {
        value: { type: 'string' },
      },
      invariants: [
        { 'result.valid': true },
      ],
    });

    const result = generatePropertyTests(spec);

    expect(result.valid).toBe(true);
    expect(result.code).toContain('vi.clearAllMocks()');
    expect(result.code).toContain('beforeEach');
  });
});

// Gap 4: Architecture-aware error patterns
describe('generateUnitTests - error patterns (Gap 4)', () => {
  it('convex architecture uses toMatchObject error pattern', () => {
    const spec = createSpec({
      specId: 'spec.product.create',
      architectures: ['convex.mutation'],
      examples: {
        errors: [
          { name: 'not found', given: { id: 'missing' }, then: { error: 'NOT_FOUND' } },
        ],
      },
    });

    const result = generateUnitTests(spec);

    expect(result.valid).toBe(true);
    expect(result.code).toContain(".rejects.toMatchObject({ data: { code: 'NOT_FOUND' } })");
  });

  it('standard architecture uses toThrow error pattern', () => {
    const spec = createSpec({
      specId: 'spec.utils.validate',
      architectures: ['archcodex.core.domain'],
      examples: {
        errors: [
          { name: 'invalid input', given: { value: '' }, then: { error: 'INVALID_INPUT' } },
        ],
      },
    });

    const result = generateUnitTests(spec);

    expect(result.valid).toBe(true);
    expect(result.code).toContain(".rejects.toThrow('INVALID_INPUT')");
  });

  it('no architecture defaults to standard toThrow', () => {
    const spec = createSpec({
      specId: 'spec.test',
      examples: {
        errors: [
          { name: 'fails', given: { x: 'bad' }, then: { error: 'NULL_ERROR' } },
        ],
      },
    });

    const result = generateUnitTests(spec);

    expect(result.valid).toBe(true);
    expect(result.code).toContain(".rejects.toThrow('NULL_ERROR')");
  });
});

describe('generateIntegrationTests (from spec.speccodex.generate.integration)', () => {
  describe('success cases', () => {
    it('generates audit log verification', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        effects: [
          { audit_log: { action: 'product.create', resourceType: 'product' } },
        ],
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.effectTests).toBe(1);
      // Default (no architecture) uses standard mock pattern
      expect(result.code).toContain('mockLogger');
      expect(result.code).toContain('product.create');
    });

    it('generates database state verification', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        effects: [
          { database: { table: 'products', operation: 'insert' } },
        ],
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      // Default (no architecture) uses standard mock pattern
      expect(result.code).toContain('mockDb');
    });

    it('generates embedding verification', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        effects: [
          { embedding: 'generated_async' },
        ],
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('embedding');
    });

    it('handles multiple effects', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        effects: [
          { audit_log: { action: 'product.create' } },
          { database: { table: 'products', operation: 'insert' } },
          { cache: { invalidated: 'user_products' } },
        ],
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.effectTests).toBe(3);
    });
  });

  describe('error cases', () => {
    it('returns error for spec without effects', () => {
      const spec = createSpec({
        specId: 'spec.test',
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('NO_EFFECTS');
    });
  });

  // Gap 6: Architecture-aware integration tests
  describe('architecture-aware patterns (Gap 6)', () => {
    it('standard architecture uses mock-based verification', () => {
      const spec = createSpec({
        specId: 'spec.email.send',
        architectures: ['archcodex.core.domain'],
        effects: [
          { notification: { type: 'email', channel: 'smtp' } },
        ],
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('vi.fn()');
      expect(result.code).toContain('mockNotifier');
    });

    it('convex architecture uses ctx.db pattern', () => {
      const spec = createSpec({
        specId: 'spec.product.create',
        architectures: ['convex.mutation'],
        effects: [
          { database: { table: 'products', operation: 'insert' } },
        ],
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('ctx.db');
    });

    it('no architecture defaults to standard mocks', () => {
      const spec = createSpec({
        specId: 'spec.test',
        effects: [
          { cache: { invalidated: 'items' } },
        ],
      });

      const result = generateIntegrationTests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('vi.fn()');
    });
  });
});
