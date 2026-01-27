/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireImportValidator } from '../../../../src/core/constraints/require-import.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';

describe('RequireImportValidator', () => {
  const validator = new RequireImportValidator();

  const createContext = (imports: SemanticModel['imports']): ConstraintContext => ({
    filePath: '/test/file.ts',
    archId: 'test.arch',
    parsedFile: {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content: '',
      lineCount: 10,
      language: 'typescript',
      imports,
      classes: [],
      interfaces: [],
      functions: [],
      functionCalls: [],
      mutations: [],
      exports: [],
    },
  });

  const createConstraint = (value: string | string[]): Constraint => ({
    rule: 'require_import',
    value,
    severity: 'error',
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_import');
  });

  it('should have an error code', () => {
    expect(validator.errorCode).toBeDefined();
  });

  describe('module specifier matching', () => {
    it('should pass when module specifier matches exactly', () => {
      const context = createContext([
        { moduleSpecifier: 'lodash', location: { line: 1, column: 1 } },
      ]);
      const constraint = createConstraint('lodash');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when module specifier matches with subpath', () => {
      const context = createContext([
        { moduleSpecifier: 'lodash/map', location: { line: 1, column: 1 } },
      ]);
      const constraint = createConstraint('lodash');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });
  });

  describe('named import matching', () => {
    it('should pass when named import exists', () => {
      const context = createContext([
        {
          moduleSpecifier: '../../functions',
          namedImports: ['makeAuthMutation', 'makeAuthQuery'],
          location: { line: 1, column: 1 },
        },
      ]);
      const constraint = createConstraint('makeAuthMutation');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when named import is missing', () => {
      const context = createContext([
        {
          moduleSpecifier: '../../functions',
          namedImports: ['makeAuthQuery'],
          location: { line: 1, column: 1 },
        },
      ]);
      const constraint = createConstraint('makeAuthMutation');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('makeAuthMutation');
    });

    it('should pass with multiple named imports across files', () => {
      const context = createContext([
        {
          moduleSpecifier: './utils',
          namedImports: ['formatDate'],
          location: { line: 1, column: 1 },
        },
        {
          moduleSpecifier: '@/components/cards/CardContainer',
          namedImports: ['CardContainer'],
          location: { line: 2, column: 1 },
        },
      ]);
      const constraint = createConstraint(['formatDate', 'CardContainer']);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });
  });

  describe('default import matching', () => {
    it('should pass when default import exists', () => {
      const context = createContext([
        {
          moduleSpecifier: 'react',
          defaultImport: 'React',
          location: { line: 1, column: 1 },
        },
      ]);
      const constraint = createConstraint('React');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when default import is missing', () => {
      const context = createContext([
        {
          moduleSpecifier: 'react',
          namedImports: ['useState', 'useEffect'],
          location: { line: 1, column: 1 },
        },
      ]);
      const constraint = createConstraint('React');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
    });
  });

  describe('combined matching', () => {
    it('should pass when requirement matches any import type', () => {
      const context = createContext([
        {
          moduleSpecifier: 'react',
          defaultImport: 'React',
          namedImports: ['useState'],
          location: { line: 1, column: 1 },
        },
        {
          moduleSpecifier: 'lodash',
          location: { line: 2, column: 1 },
        },
      ]);
      // React = default import, useState = named import, lodash = module specifier
      const constraint = createConstraint(['React', 'useState', 'lodash']);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when any required import is missing', () => {
      const context = createContext([
        {
          moduleSpecifier: 'react',
          defaultImport: 'React',
          location: { line: 1, column: 1 },
        },
      ]);
      const constraint = createConstraint(['React', 'missingImport']);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('missingImport');
    });
  });

  describe('edge cases', () => {
    it('should handle empty imports array', () => {
      const context = createContext([]);
      const constraint = createConstraint('something');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
    });

    it('should handle imports without namedImports field', () => {
      const context = createContext([
        { moduleSpecifier: 'lodash', location: { line: 1, column: 1 } },
      ]);
      const constraint = createConstraint('map');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
    });
  });

  describe('match: any (OR semantics)', () => {
    const createConstraintWithMatch = (value: string[], match: 'all' | 'any'): Constraint => ({
      rule: 'require_import',
      value,
      severity: 'error',
      match,
    });

    it('should pass when at least one import is present with match: any', () => {
      const context = createContext([
        {
          moduleSpecifier: 'convex/values',
          namedImports: ['ConvexError'],
          location: { line: 1, column: 1 },
        },
      ]);
      // Only ConvexError is present, not Errors
      const constraint = createConstraintWithMatch(['ConvexError', 'Errors'], 'any');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when the other import is present with match: any', () => {
      const context = createContext([
        {
          moduleSpecifier: './errors',
          namedImports: ['Errors'],
          location: { line: 1, column: 1 },
        },
      ]);
      // Only Errors is present, not ConvexError
      const constraint = createConstraintWithMatch(['ConvexError', 'Errors'], 'any');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when none of the imports are present with match: any', () => {
      const context = createContext([
        {
          moduleSpecifier: 'lodash',
          location: { line: 1, column: 1 },
        },
      ]);
      const constraint = createConstraintWithMatch(['ConvexError', 'Errors'], 'any');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('None of the required imports');
    });

    it('should require all imports with match: all (explicit)', () => {
      const context = createContext([
        {
          moduleSpecifier: 'convex/values',
          namedImports: ['ConvexError'],
          location: { line: 1, column: 1 },
        },
      ]);
      // Only ConvexError is present
      const constraint = createConstraintWithMatch(['ConvexError', 'Errors'], 'all');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should default to match: all when not specified', () => {
      const context = createContext([
        {
          moduleSpecifier: 'convex/values',
          namedImports: ['ConvexError'],
          location: { line: 1, column: 1 },
        },
      ]);
      // No match specified - should default to 'all'
      const constraint = createConstraint(['ConvexError', 'Errors']);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });
  });
});
