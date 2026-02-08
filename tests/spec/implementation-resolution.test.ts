/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for implementation resolution in SpecCodex.
 * Validates parseImplementation and resolveImplementation functions.
 */
import { describe, it, expect } from 'vitest';
import {
  parseImplementation,
  resolveImplementation,
  type ResolvedSpec,
} from '../../src/core/spec/resolver.js';

describe('parseImplementation', () => {
  describe('path#export format', () => {
    it('parses named export', () => {
      const result = parseImplementation('src/domain/products/mutations/create.ts#create');
      expect(result).toEqual({
        path: 'src/domain/products/mutations/create.ts',
        exportName: 'create',
        isDefault: false,
      });
    });

    it('parses different export name from filename', () => {
      const result = parseImplementation('src/utils/helpers.ts#formatDate');
      expect(result).toEqual({
        path: 'src/utils/helpers.ts',
        exportName: 'formatDate',
        isDefault: false,
      });
    });

    it('parses default export', () => {
      const result = parseImplementation('src/components/Button.tsx#default');
      expect(result).toEqual({
        path: 'src/components/Button.tsx',
        exportName: '',
        isDefault: true,
      });
    });

    it('handles paths with dots', () => {
      const result = parseImplementation('src/lib/api.client.ts#fetchData');
      expect(result).toEqual({
        path: 'src/lib/api.client.ts',
        exportName: 'fetchData',
        isDefault: false,
      });
    });
  });

  describe('path-only format', () => {
    it('parses path without export', () => {
      const result = parseImplementation('src/domain/products/mutations/create.ts');
      expect(result).toEqual({
        path: 'src/domain/products/mutations/create.ts',
        exportName: '',
        isDefault: false,
      });
    });

    it('handles nested paths', () => {
      const result = parseImplementation('src/features/auth/hooks/useAuth.ts');
      expect(result).toEqual({
        path: 'src/features/auth/hooks/useAuth.ts',
        exportName: '',
        isDefault: false,
      });
    });
  });
});

describe('resolveImplementation', () => {
  const createMockSpec = (implementation?: string): ResolvedSpec => ({
    specId: 'spec.product.create',
    inheritanceChain: ['spec.product.create'],
    appliedMixins: [],
    node: {
      intent: 'User creates a product',
      implementation,
    },
  });

  it('returns null when no implementation specified', () => {
    const spec = createMockSpec();
    const result = resolveImplementation(spec);
    expect(result).toBeNull();
  });

  it('resolves implementation with explicit export', () => {
    const spec = createMockSpec('src/domain/products/mutations/create.ts#create');
    const result = resolveImplementation(spec);

    expect(result).toEqual({
      importPath: './src/domain/products/mutations/create.js',
      functionName: 'create',
      original: 'src/domain/products/mutations/create.ts#create',
    });
  });

  it('infers export name from spec ID when not provided', () => {
    const spec = createMockSpec('src/domain/products/mutations/create.ts');
    const result = resolveImplementation(spec);

    expect(result).toEqual({
      importPath: './src/domain/products/mutations/create.js',
      functionName: 'create', // Inferred from spec.product.create
      original: 'src/domain/products/mutations/create.ts',
    });
  });

  it('replaces .ts extension with .js for ESM imports', () => {
    const spec = createMockSpec('src/utils/helpers.ts#formatDate');
    const result = resolveImplementation(spec);

    expect(result?.importPath).toBe('./src/utils/helpers.js');
  });

  it('replaces .tsx extension with .js for ESM imports', () => {
    const spec = createMockSpec('src/components/Button.tsx#Button');
    const result = resolveImplementation(spec);

    expect(result?.importPath).toBe('./src/components/Button.js');
  });

  it('handles already relative paths', () => {
    const spec = createMockSpec('./src/utils/helpers.ts#formatDate');
    const result = resolveImplementation(spec);

    expect(result?.importPath).toBe('./src/utils/helpers.js');
  });

  describe('with test file path', () => {
    it('calculates relative import from test to implementation', () => {
      const spec = createMockSpec('src/core/spec/resolver.ts#resolveSpec');
      const result = resolveImplementation(spec, 'tests/spec/resolver.test.ts');

      expect(result?.importPath).toBe('../../src/core/spec/resolver.js');
    });

    it('handles same directory', () => {
      const spec = createMockSpec('src/utils/helpers.ts#formatDate');
      const result = resolveImplementation(spec, 'src/utils/helpers.test.ts');

      // Local imports need ./ prefix to distinguish from node_modules
      expect(result?.importPath).toBe('./helpers.js');
    });

    it('handles deeply nested test file', () => {
      const spec = createMockSpec('src/domain/products/mutations/create.ts#create');
      const result = resolveImplementation(spec, 'tests/unit/domain/products/create.test.ts');

      // From tests/unit/domain/products/ to src/domain/products/mutations/
      expect(result?.importPath).toBe('../../../../src/domain/products/mutations/create.js');
    });
  });
});

describe('integration with generators', () => {
  it('generates proper imports when implementation is set', async () => {
    // This test validates the full flow would work
    const spec: ResolvedSpec = {
      specId: 'spec.product.create',
      inheritanceChain: ['spec.product.create'],
      appliedMixins: [],
      node: {
        intent: 'User creates a product',
        implementation: 'src/domain/products/mutations/create.ts#create',
        examples: {
          success: [
            { name: 'valid product', given: { url: 'https://example.com' }, then: { 'result.url': 'https://example.com' } },
          ],
        },
      },
    };

    const resolved = resolveImplementation(spec);
    expect(resolved).not.toBeNull();
    expect(resolved?.functionName).toBe('create');
    expect(resolved?.importPath).toContain('domain/products/mutations/create');
  });
});

describe('verification specs', () => {
  it('verification specs are loaded from registry', async () => {
    const { loadSpecRegistry } = await import('../../src/core/spec/loader.js');
    const path = await import('node:path');

    const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
    const registry = await loadSpecRegistry(PROJECT_ROOT);

    // Check verification specs are loaded (from verification.spec.yaml)
    const verifySpecs = Object.keys(registry.nodes).filter(k =>
      k.startsWith('spec.speccodex.verify') || k.startsWith('spec.speccodex.drift') || k === 'spec.speccodex.cli.drift'
    );

    expect(verifySpecs.length).toBeGreaterThan(0);
    expect(verifySpecs).toContain('spec.speccodex.verify');
    expect(verifySpecs).toContain('spec.speccodex.verify.format');
    expect(verifySpecs).toContain('spec.speccodex.verify.inferPath');
    expect(verifySpecs).toContain('spec.speccodex.drift.unwired');
    expect(verifySpecs).toContain('spec.speccodex.drift.undocumented');
    expect(verifySpecs).toContain('spec.speccodex.drift.report');
    expect(verifySpecs).toContain('spec.speccodex.cli.drift');
  });

  it('new verification specs have implementation fields', async () => {
    const { loadSpecRegistry } = await import('../../src/core/spec/loader.js');
    const path = await import('node:path');

    const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
    const registry = await loadSpecRegistry(PROJECT_ROOT);

    // Check verification specs that have implementations
    const wiredVerifySpecs = [
      'spec.speccodex.verify',
      'spec.speccodex.verify.format',
      'spec.speccodex.verify.inferPath',
      'spec.speccodex.drift.unwired',
      'spec.speccodex.cli.drift',
    ];

    for (const specId of wiredVerifySpecs) {
      const spec = registry.nodes[specId];
      expect(spec, `${specId} should exist`).toBeDefined();
      expect(spec.implementation, `${specId} should have implementation`).toBeDefined();
    }

    // Drift detection specs are now fully implemented
    const driftSpecs = [
      'spec.speccodex.drift.undocumented',
      'spec.speccodex.drift.report',
    ];

    for (const specId of driftSpecs) {
      const spec = registry.nodes[specId];
      expect(spec, `${specId} should exist`).toBeDefined();
      expect(spec.implementation, `${specId} should have implementation`).toBeDefined();
    }
  });
});
