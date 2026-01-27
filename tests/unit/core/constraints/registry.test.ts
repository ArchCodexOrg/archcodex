/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { getValidator, hasValidator, getAllValidators } from '../../../../src/core/constraints/registry.js';

describe('Constraint Registry', () => {
  describe('getValidator', () => {
    it('should return validator for known rules', () => {
      expect(getValidator('forbid_import')).toBeDefined();
      expect(getValidator('require_import')).toBeDefined();
      expect(getValidator('must_extend')).toBeDefined();
      expect(getValidator('implements')).toBeDefined();
      expect(getValidator('max_file_lines')).toBeDefined();
    });

    it('should return undefined for unknown rules', () => {
      expect(getValidator('unknown_rule' as any)).toBeUndefined();
    });
  });

  describe('hasValidator', () => {
    it('should return true for known rules', () => {
      expect(hasValidator('forbid_import')).toBe(true);
      expect(hasValidator('naming_pattern')).toBe(true);
    });

    it('should return false for unknown rules', () => {
      expect(hasValidator('unknown_rule' as any)).toBe(false);
    });
  });

  describe('getAllValidators', () => {
    it('should return all registered validators', () => {
      const validators = getAllValidators();
      expect(validators.size).toBeGreaterThan(0);
      expect(validators.has('forbid_import')).toBe(true);
      expect(validators.has('require_import')).toBe(true);
    });
  });
});
