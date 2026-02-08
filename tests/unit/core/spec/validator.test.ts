/**
 * @arch archcodex.test.unit
 *
 * Tests for SpecCodex validator.
 */
import { describe, it, expect } from 'vitest';
import {
  validateSpecRegistry,
  formatValidationSummary,
} from '../../../../src/core/spec/validator.js';
import type { SpecRegistry } from '../../../../src/core/spec/schema.js';

describe('Spec Validator', () => {
  describe('validateSpecRegistry', () => {
    it('validates empty registry', () => {
      const registry: SpecRegistry = {
        version: '1.0',
        nodes: {},
        mixins: {},
      };

      const result = validateSpecRegistry(registry);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('validates registry with specs', () => {
      const registry: SpecRegistry = {
        version: '1.0',
        nodes: {
          'spec.test': { intent: 'Test' },
        },
        mixins: {},
      };

      const result = validateSpecRegistry(registry);
      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
    });

    it('returns warnings for missing intent', () => {
      const registry: SpecRegistry = {
        version: '1.0',
        nodes: {
          'spec.no.intent': { inputs: { name: { type: 'string' } } },
        },
        mixins: {},
      };

      const result = validateSpecRegistry(registry);
      // Missing intent should be an error
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('formatValidationSummary', () => {
    it('formats validation result as string', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [],
        stats: { specsChecked: 1, mixinsChecked: 0, examplesChecked: 0 },
      };

      const summary = formatValidationSummary(result);
      expect(typeof summary).toBe('string');
    });
  });
});
