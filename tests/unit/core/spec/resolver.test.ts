/**
 * @arch archcodex.test.unit
 *
 * Tests for SpecCodex resolver.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSpec,
  getSpecAncestors,
  formatSpecForLLM,
} from '../../../../src/core/spec/resolver.js';
import type { SpecRegistry } from '../../../../src/core/spec/schema.js';

describe('Spec Resolver', () => {
  const createRegistry = (): SpecRegistry => ({
    version: '1.0',
    nodes: {
      'spec.base': {
        type: 'base',
        intent: 'Base spec',
        security: { authentication: 'required' },
      },
      'spec.child': {
        inherits: 'spec.base',
        intent: 'Child spec',
        inputs: {
          name: { type: 'string', required: true },
        },
      },
      'spec.grandchild': {
        inherits: 'spec.child',
        intent: 'Grandchild spec',
        outputs: {
          result: { type: 'string' },
        },
      },
      'spec.with.mixin': {
        intent: 'Spec with mixin',
        mixins: ['requires_auth'],
      },
    },
    mixins: {
      requires_auth: {
        description: 'Requires authentication',
        examples: {
          errors: [
            { name: 'unauthenticated', given: { user: null }, then: { error: 'NOT_AUTHENTICATED' } },
          ],
        },
      },
    },
  });

  describe('resolveSpec', () => {
    it('resolves spec without inheritance', () => {
      const registry = createRegistry();
      const result = resolveSpec(registry, 'spec.base');

      expect(result.valid).toBe(true);
      expect(result.spec?.specId).toBe('spec.base');
      expect(result.spec?.inheritanceChain).toEqual(['spec.base']);
    });

    it('resolves spec with single inheritance', () => {
      const registry = createRegistry();
      const result = resolveSpec(registry, 'spec.child');

      expect(result.valid).toBe(true);
      expect(result.spec?.inheritanceChain).toContain('spec.base');
      expect(result.spec?.inheritanceChain).toContain('spec.child');
      // Should inherit security from base
      expect(result.spec?.node.security?.authentication).toBe('required');
    });

    it('resolves spec with deep inheritance', () => {
      const registry = createRegistry();
      const result = resolveSpec(registry, 'spec.grandchild');

      expect(result.valid).toBe(true);
      expect(result.spec?.inheritanceChain).toHaveLength(3);
      // Should have inputs from child and security from base
      expect(result.spec?.node.inputs?.name).toBeDefined();
      expect(result.spec?.node.security?.authentication).toBe('required');
    });

    it('resolves spec with mixin', () => {
      const registry = createRegistry();
      const result = resolveSpec(registry, 'spec.with.mixin');

      expect(result.valid).toBe(true);
      expect(result.spec?.appliedMixins).toContain('requires_auth');
      // Should have error examples from mixin
      expect(result.spec?.node.examples?.errors).toBeDefined();
    });

    it('returns error for missing spec', () => {
      const registry = createRegistry();
      const result = resolveSpec(registry, 'spec.missing');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('returns error for circular inheritance', () => {
      const registry: SpecRegistry = {
        version: '1.0',
        nodes: {
          'spec.a': { inherits: 'spec.b', intent: 'A' },
          'spec.b': { inherits: 'spec.a', intent: 'B' },
        },
        mixins: {},
      };

      const result = resolveSpec(registry, 'spec.a');
      expect(result.valid).toBe(false);
    });
  });

  describe('getSpecAncestors', () => {
    it('returns empty for spec without inheritance', () => {
      const registry = createRegistry();
      const ancestors = getSpecAncestors(registry, 'spec.base');

      expect(ancestors).toEqual([]);
    });

    it('returns ancestor chain', () => {
      const registry = createRegistry();
      const ancestors = getSpecAncestors(registry, 'spec.grandchild');

      expect(ancestors).toContain('spec.child');
      expect(ancestors).toContain('spec.base');
    });
  });

  describe('formatSpecForLLM', () => {
    it('formats resolved spec for LLM consumption', () => {
      const registry = createRegistry();
      const resolved = resolveSpec(registry, 'spec.child');

      if (!resolved.spec) throw new Error('Spec should be resolved');

      const formatted = formatSpecForLLM(resolved.spec);

      expect(formatted).toContain('spec.child');
      expect(formatted).toContain('Child spec');
      expect(formatted).toContain('inputs');
    });
  });
});
