/**
 * @arch archcodex.core.domain
 *
 * Tests for spec validator - dogfooding from spec.speccodex.validate
 */
import { describe, it, expect } from 'vitest';
import {
  validateSpecRegistry,
  validateSpec,
  formatValidationSummary,
} from '../../src/core/spec/validator.js';
import type { SpecRegistry, SpecNode } from '../../src/core/spec/schema.js';

// Helper to create a minimal registry
function createRegistry(
  nodes: Record<string, Partial<SpecNode>>,
  mixins: Record<string, unknown> = {}
): SpecRegistry {
  const fullNodes: Record<string, SpecNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    fullNodes[id] = {
      intent: 'Test spec',
      ...node,
    } as SpecNode;
  }
  return { nodes: fullNodes, mixins: mixins as SpecRegistry['mixins'] };
}

describe('validateSpecRegistry', () => {
  describe('basic validation', () => {
    it('passes valid registry', () => {
      const registry = createRegistry({
        'spec.test': {
          intent: 'Test function',
          examples: { success: [{ name: 'test', given: {}, then: {} }] },
        },
      });

      const result = validateSpecRegistry(registry);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when intent is missing on leaf spec', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.test': {
            examples: { success: [{ name: 'test', then: {} }] },
          } as SpecNode,
        },
        mixins: {},
      };

      const result = validateSpecRegistry(registry);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_INTENT')).toBe(true);
    });

    it('allows missing intent on base specs', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.base': {
            required_fields: ['intent'],
            optional_fields: ['examples'],
          } as unknown as SpecNode,
        },
        mixins: {},
      };

      const result = validateSpecRegistry(registry);

      // Base specs don't need intent
      expect(result.errors.filter(e => e.code === 'MISSING_INTENT')).toHaveLength(0);
    });
  });

  describe('mixin validation', () => {
    it('fails on unknown mixin reference', () => {
      const registry = createRegistry({
        'spec.test': {
          intent: 'Test',
          mixins: ['unknown_mixin'],
        },
      });

      const result = validateSpecRegistry(registry);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNKNOWN_MIXIN')).toBe(true);
    });

    it('passes with valid mixin reference', () => {
      const registry = createRegistry(
        {
          'spec.test': {
            intent: 'Test',
            mixins: ['auth'],
          },
        },
        {
          auth: { security: { authentication: 'required' } },
        }
      );

      const result = validateSpecRegistry(registry);

      expect(result.errors.filter(e => e.code === 'UNKNOWN_MIXIN')).toHaveLength(0);
    });
  });

  describe('inheritance validation', () => {
    it('fails on unknown parent spec', () => {
      const registry = createRegistry({
        'spec.child': {
          intent: 'Child',
          inherits: 'spec.unknown',
        },
      });

      const result = validateSpecRegistry(registry);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNKNOWN_PARENT')).toBe(true);
    });

    it('detects circular inheritance', () => {
      const registry = createRegistry({
        'spec.a': {
          intent: 'A',
          inherits: 'spec.b',
        },
        'spec.b': {
          intent: 'B',
          inherits: 'spec.a',
        },
      });

      const result = validateSpecRegistry(registry);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CIRCULAR_INHERITANCE')).toBe(true);
    });
  });

  // Improvement #5: Required error section validation
  describe('error section validation (Improvement #5)', () => {
    it('warns when spec has success examples but no error examples', () => {
      const registry = createRegistry({
        'spec.product.create': {
          intent: 'Create a product',
          inputs: {
            url: { type: 'string', required: true, validate: 'url' },
          },
          examples: {
            success: [
              { name: 'valid url', given: { url: 'https://github.com' }, then: { result: true } },
            ],
          },
        },
      });

      const result = validateSpecRegistry(registry);

      expect(result.warnings.some(w => w.code === 'MISSING_ERRORS')).toBe(true);
    });

    it('does not warn when errors section exists', () => {
      const registry = createRegistry({
        'spec.product.create': {
          intent: 'Create a product',
          examples: {
            success: [{ name: 'valid', given: {}, then: {} }],
            errors: [{ name: 'invalid', given: {}, then: { error: 'INVALID' } }],
          },
        },
      });

      const result = validateSpecRegistry(registry);

      expect(result.warnings.filter(w => w.code === 'MISSING_ERRORS')).toHaveLength(0);
    });

    it('does not warn for base specs', () => {
      const registry: SpecRegistry = {
        nodes: {
          'spec.base': {
            required_fields: ['intent'],
            examples: {
              success: [{ name: 'test', then: {} }],
            },
          } as unknown as SpecNode,
        },
        mixins: {},
      };

      const result = validateSpecRegistry(registry);

      expect(result.warnings.filter(w => w.code === 'MISSING_ERRORS')).toHaveLength(0);
    });

    it('suggests auth error when authentication is required', () => {
      const registry = createRegistry({
        'spec.secure.action': {
          intent: 'Secure action',
          security: { authentication: 'required' },
          examples: {
            success: [{ name: 'works', given: {}, then: {} }],
          },
        },
      });

      const result = validateSpecRegistry(registry);

      const warning = result.warnings.find(w => w.code === 'MISSING_ERRORS');
      expect(warning).toBeDefined();
      expect(warning?.message).toContain('NOT_AUTHENTICATED');
    });

    it('suggests validation error for URL input', () => {
      const registry = createRegistry({
        'spec.url.validator': {
          intent: 'Validate URL',
          inputs: {
            url: { type: 'string', validate: 'url' },
          },
          examples: {
            success: [{ name: 'valid', given: { url: 'https://x.com' }, then: {} }],
          },
        },
      });

      const result = validateSpecRegistry(registry);

      const warning = result.warnings.find(w => w.code === 'MISSING_ERRORS');
      expect(warning).toBeDefined();
      expect(warning?.message).toContain('INVALID_URL');
    });

    it('suggests not found error for ID input with table', () => {
      const registry = createRegistry({
        'spec.project.get': {
          intent: 'Get project',
          inputs: {
            projectId: { type: 'id', table: 'projects' },
          },
          examples: {
            success: [{ name: 'found', given: { projectId: 'abc123' }, then: {} }],
          },
        },
      });

      const result = validateSpecRegistry(registry);

      const warning = result.warnings.find(w => w.code === 'MISSING_ERRORS');
      expect(warning).toBeDefined();
      expect(warning?.message).toContain('PROJECTS_NOT_FOUND');
    });

    it('suggests permission error when permissions are required', () => {
      const registry = createRegistry({
        'spec.admin.action': {
          intent: 'Admin action',
          security: { permissions: ['admin'] },
          examples: {
            success: [{ name: 'works', given: {}, then: {} }],
          },
        },
      });

      const result = validateSpecRegistry(registry);

      const warning = result.warnings.find(w => w.code === 'MISSING_ERRORS');
      expect(warning).toBeDefined();
      expect(warning?.message).toContain('PERMISSION_DENIED');
    });
  });

  describe('strict mode', () => {
    it('promotes warnings to errors in strict mode', () => {
      const registry = createRegistry({
        'spec.test': {
          intent: 'Test',
          goal: 'A goal',
          // No outcomes = warning
        },
      });

      const result = validateSpecRegistry(registry, { strict: true });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'GOAL_WITHOUT_OUTCOMES')).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

describe('formatValidationSummary', () => {
  it('formats passing result', () => {
    const registry = createRegistry({
      'spec.test': { intent: 'Test' },
    });

    const result = validateSpecRegistry(registry);
    const formatted = formatValidationSummary(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('passed');
  });

  it('formats failing result with errors', () => {
    const registry: SpecRegistry = {
      nodes: { 'spec.test': {} as SpecNode },
      mixins: {},
    };

    const result = validateSpecRegistry(registry);
    const formatted = formatValidationSummary(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('failed');
    expect(formatted).toContain('MISSING_INTENT');
  });

  it('includes warning count', () => {
    const registry = createRegistry({
      'spec.test': {
        intent: 'Test',
        examples: {
          success: [{ name: 'test', given: {}, then: {} }],
        },
      },
    });

    const result = validateSpecRegistry(registry);
    const formatted = formatValidationSummary(result);

    expect(formatted).toContain('warning');
  });
});
