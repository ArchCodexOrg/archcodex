/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireOneOfValidator } from '../../../../src/core/constraints/require-one-of.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';

describe('RequireOneOfValidator', () => {
  const validator = new RequireOneOfValidator();

  const createContext = (content: string): ConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    archId: 'test.arch',
    constraintSource: 'test',
    parsedFile: {
      content,
      imports: [],
      exports: [],
      classes: [],
      functions: [],
      functionCalls: [],
      decorators: [],
      variables: [],
    } as SemanticModel,
  });

  const createConstraint = (patterns: string[]): Constraint => ({
    rule: 'require_one_of',
    value: patterns,
    severity: 'error',
    why: 'Testing require_one_of',
  });

  describe('literal string patterns', () => {
    it('should pass when first pattern is found', () => {
      const constraint = createConstraint(['isDeleted', 'deletedAt']);
      const context = createContext('if (doc.isDeleted) { return; }');

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when second pattern is found', () => {
      const constraint = createConstraint(['isDeleted', 'deletedAt']);
      const context = createContext('if (doc.deletedAt !== null) { return; }');

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when no patterns are found', () => {
      const constraint = createConstraint(['isDeleted', 'deletedAt']);
      const context = createContext('const doc = await getDocument(id);');

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('None of the required patterns found');
      expect(result.violations[0].message).toContain("'isDeleted'");
      expect(result.violations[0].message).toContain("'deletedAt'");
    });
  });

  describe('annotation opt-out patterns', () => {
    it('should pass with JSDoc annotation opt-out', () => {
      const constraint = createConstraint(['isDeleted', '@no-soft-delete']);
      const context = createContext(`
        /**
         * @no-soft-delete - This function returns all documents including deleted
         */
        function getAllDocuments() {
          return db.query('documents').collect();
        }
      `);

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should pass with single-line comment opt-out', () => {
      const constraint = createConstraint(['isDeleted', '@no-soft-delete']);
      const context = createContext(`
        // @no-soft-delete - intentionally includes deleted
        function getAllDocuments() {
          return db.query('documents').collect();
        }
      `);

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should fail when annotation is not in a comment', () => {
      const constraint = createConstraint(['isDeleted', '@no-soft-delete']);
      const context = createContext(`
        const tag = '@no-soft-delete';
        function getDocuments() {
          return db.query('documents').collect();
        }
      `);

      const result = validator.validate(constraint, context);

      // String literal contains the annotation, but it's not in a comment
      // The current implementation will match it - let's verify the behavior
      expect(result.passed).toBe(false);
    });
  });

  describe('regex patterns', () => {
    it('should pass with regex pattern match', () => {
      const constraint = createConstraint(['/isDeleted\\s*===?\\s*false/', '@no-soft-delete']);
      const context = createContext('if (doc.isDeleted === false) { return doc; }');

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should fail when regex does not match', () => {
      const constraint = createConstraint(['/isDeleted\\s*===?\\s*false/', '@no-soft-delete']);
      const context = createContext('if (doc.isDeleted) { return; }');

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('suggestion generation', () => {
    it('should suggest annotation opt-out when available', () => {
      const constraint = createConstraint(['isDeleted', '@no-soft-delete']);
      const context = createContext('const doc = await getDocument(id);');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toBeDefined();
      expect(result.violations[0].suggestion?.action).toBe('add');
      expect(result.violations[0].suggestion?.replacement).toContain('@no-soft-delete');
    });

    it('should suggest first pattern when no annotation available', () => {
      const constraint = createConstraint(['isDeleted', 'deletedAt']);
      const context = createContext('const doc = await getDocument(id);');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toBeDefined();
      expect(result.violations[0].suggestion?.action).toBe('add');
      expect(result.violations[0].suggestion?.replacement).toBe('isDeleted');
    });
  });

  describe('fix hint', () => {
    it('should mention opt-out when annotation pattern available', () => {
      const constraint = createConstraint(['verifyAuth', '@public-endpoint']);
      const context = createContext('function handler() {}');

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toContain('@public-endpoint');
      expect(result.violations[0].fixHint).toContain('opt-out');
    });
  });

  describe('edge cases', () => {
    it('should handle empty patterns array', () => {
      const constraint = createConstraint([]);
      const context = createContext('const x = 1;');

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('requires an array');
    });

    it('should handle single pattern', () => {
      const constraint = createConstraint(['isDeleted']);
      const context = createContext('if (doc.isDeleted) { return; }');

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });
});
