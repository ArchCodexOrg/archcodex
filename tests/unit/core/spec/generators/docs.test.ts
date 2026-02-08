/**
 * @arch archcodex.test.unit
 *
 * Tests for documentation generator.
 */
import { describe, it, expect } from 'vitest';
import {
  generateApiDocs,
  generateExampleDocs,
  generateErrorDocs,
  generateAllDocs,
} from '../../../../../src/core/spec/generators/docs.js';
import type { ResolvedSpec } from '../../../../../src/core/spec/schema.js';

describe('Documentation Generator', () => {
  const createSpec = (overrides: Partial<ResolvedSpec['node']> = {}): ResolvedSpec => ({
    specId: 'spec.test.docs',
    inheritanceChain: ['spec.test.docs'],
    appliedMixins: [],
    node: {
      intent: 'Test documentation generation',
      ...overrides,
    },
  });

  describe('generateApiDocs', () => {
    it('generates API docs for spec with inputs', () => {
      const spec = createSpec({
        inputs: {
          name: { type: 'string', required: true, description: 'User name' },
        },
        outputs: {
          success: { type: 'boolean', description: 'Operation result' },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.valid).toBe(true);
      expect(result.markdown).toBeDefined();
    });

    it('handles spec without inputs', () => {
      const spec = createSpec();
      const result = generateApiDocs(spec);

      expect(result.valid).toBe(true);
    });
  });

  describe('generateExampleDocs', () => {
    it('generates examples from success cases', () => {
      const spec = createSpec({
        examples: {
          success: [
            {
              name: 'basic usage',
              given: { name: 'test' },
              then: { success: true },
            },
          ],
        },
      });

      const result = generateExampleDocs(spec);

      expect(result.valid).toBe(true);
      expect(result.exampleCount).toBe(1);
    });
  });

  describe('generateErrorDocs', () => {
    it('generates error catalog from error examples', () => {
      const spec = createSpec({
        examples: {
          errors: [
            {
              name: 'not found',
              given: { id: 'invalid' },
              then: { error: 'NOT_FOUND' },
            },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.valid).toBe(true);
      expect(result.errorCount).toBe(1);
    });
  });

  describe('generateAllDocs', () => {
    it('generates combined documentation', () => {
      const spec = createSpec({
        inputs: { name: { type: 'string' } },
        examples: {
          success: [{ name: 'test', given: {}, then: {} }],
        },
      });

      const result = generateAllDocs(spec);

      expect(result.valid).toBe(true);
      expect(result.markdown).toBeDefined();
    });
  });
});
