/**
 * @arch archcodex.core.domain
 *
 * Tests for schema documentation - dogfooding from spec.speccodex.schema
 */
import { describe, it, expect } from 'vitest';
import {
  getSpecSchema,
  formatSchemaDoc,
} from '../../src/core/spec/schema-docs.js';

describe('getSpecSchema (from spec.speccodex.schema)', () => {
  describe('success cases', () => {
    it('list all schema returns all sections', () => {
      const result = getSpecSchema({ filter: 'all' });

      expect(result.sections).toContain('fields');
      expect(result.sections).toContain('inputs');
      expect(result.sections).toContain('examples');
      expect(result.sections).toContain('placeholders');
      expect(result.sections).toContain('effects');
    });

    it('list spec fields includes required fields', () => {
      const result = getSpecSchema({ filter: 'fields' });

      expect(result.fields).toBeDefined();
      const fieldNames = result.fields!.map(f => f.name);
      expect(fieldNames).toContain('intent');
      expect(fieldNames).toContain('goal');
      expect(fieldNames).toContain('inputs');
      expect(fieldNames).toContain('invariants');
      expect(fieldNames).toContain('examples');
      expect(fieldNames).toContain('effects');
    });

    it('list input types includes all types', () => {
      const result = getSpecSchema({ filter: 'inputs' });

      expect(result.inputTypes).toBeDefined();
      const typeNames = result.inputTypes!.map(t => t.type);
      expect(typeNames).toContain('string');
      expect(typeNames).toContain('number');
      expect(typeNames).toContain('boolean');
      expect(typeNames).toContain('enum');
      expect(typeNames).toContain('id');
      expect(typeNames).toContain('object');
    });

    it('list placeholders includes core placeholders', () => {
      const result = getSpecSchema({ filter: 'placeholders' });

      expect(result.placeholders).toBeDefined();
      const placeholders = result.placeholders!.map(p => p.placeholder);
      expect(placeholders).toContain('@authenticated');
      expect(placeholders).toContain('@string(N)');
      expect(placeholders).toContain('@now');
      expect(placeholders).toContain('@created');
    });

    it('list effect types includes core effects', () => {
      const result = getSpecSchema({ filter: 'effects' });

      expect(result.effects).toBeDefined();
      const effectTypes = result.effects!.map(e => e.type);
      expect(effectTypes).toContain('audit_log');
      expect(effectTypes).toContain('database');
      expect(effectTypes).toContain('embedding');
      expect(effectTypes).toContain('cache');
    });

    it('list base specs includes standard specs', () => {
      const result = getSpecSchema({ filter: 'base-specs' });

      expect(result.baseSpecs).toBeDefined();
      const specIds = result.baseSpecs!.map(s => s.specId);
      expect(specIds).toContain('spec.function');
      expect(specIds).toContain('spec.mutation');
      expect(specIds).toContain('spec.query');
    });

    it('include examples adds YAML examples', () => {
      const result = getSpecSchema({ filter: 'fields', examples: true });

      expect(result.yamlExamples).toBeDefined();
      expect(result.yamlExamples).toContain('spec.');
    });
  });

  describe('example structure', () => {
    it('returns example categories', () => {
      const result = getSpecSchema({ filter: 'examples' });

      expect(result.exampleStructure).toBeDefined();
      expect(result.exampleStructure!.categories).toContain('success');
      expect(result.exampleStructure!.categories).toContain('errors');
      expect(result.exampleStructure!.categories).toContain('warnings');
      expect(result.exampleStructure!.categories).toContain('boundaries');
    });
  });

  describe('field documentation', () => {
    it('fields have required info', () => {
      const result = getSpecSchema({ filter: 'fields' });

      for (const field of result.fields!) {
        expect(field.name).toBeDefined();
        expect(field.type).toBeDefined();
        expect(field.description).toBeDefined();
        expect(field.section).toBeDefined();
        expect(typeof field.required).toBe('boolean');
      }
    });

    it('intent is marked as required', () => {
      const result = getSpecSchema({ filter: 'fields' });

      const intentField = result.fields!.find(f => f.name === 'intent');
      expect(intentField).toBeDefined();
      expect(intentField!.required).toBe(true);
    });
  });

  describe('input type documentation', () => {
    it('input types have examples', () => {
      const result = getSpecSchema({ filter: 'inputs' });

      for (const type of result.inputTypes!) {
        expect(type.type).toBeDefined();
        expect(type.description).toBeDefined();
        expect(type.example).toBeDefined();
      }
    });
  });
});

describe('formatSchemaDoc', () => {
  it('formats fields section', () => {
    const result = getSpecSchema({ filter: 'fields' });
    const formatted = formatSchemaDoc(result);

    expect(formatted).toContain('=== SPEC FIELDS ===');
    expect(formatted).toContain('intent');
    expect(formatted).toContain('(required)');
  });

  it('formats placeholders section', () => {
    const result = getSpecSchema({ filter: 'placeholders' });
    const formatted = formatSchemaDoc(result);

    expect(formatted).toContain('=== @ PLACEHOLDERS ===');
    expect(formatted).toContain('@authenticated');
  });

  it('includes YAML examples when present', () => {
    const result = getSpecSchema({ filter: 'effects', examples: true });
    const formatted = formatSchemaDoc(result);

    expect(formatted).toContain('=== YAML EXAMPLES ===');
    expect(formatted).toContain('audit_log');
  });
});
