/**
 * @arch archcodex.test.unit
 *
 * Tests for SpecCodex schema documentation.
 */
import { describe, it, expect } from 'vitest';
import {
  getSpecSchema,
  formatSchemaDoc,
} from '../../../../src/core/spec/schema-docs.js';

describe('Schema Documentation', () => {
  describe('getSpecSchema', () => {
    it('returns schema documentation result', () => {
      const result = getSpecSchema();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('accepts filter option', () => {
      const result = getSpecSchema({ filter: 'inputs' });
      expect(result).toBeDefined();
    });
  });

  describe('formatSchemaDoc', () => {
    it('formats schema result as string', () => {
      const result = getSpecSchema();
      const doc = formatSchemaDoc(result);
      expect(typeof doc).toBe('string');
    });
  });
});
