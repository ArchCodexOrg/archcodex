/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for MustExtendValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MustExtendValidator } from '../../../../src/core/constraints/must-extend.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, ClassInfo } from '../../../../src/validators/semantic.types.js';

describe('MustExtendValidator', () => {
  let validator: MustExtendValidator;

  function createClass(overrides: Partial<ClassInfo>): ClassInfo {
    return {
      name: 'TestClass',
      location: { line: 1, column: 1 },
      isExported: true,
      isAbstract: false,
      members: [],
      methods: [],
      ...overrides,
    };
  }

  function createContext(classes: ClassInfo[]): ConstraintContext {
    const parsedFile: SemanticModel = {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content: '',
      lineCount: 10,
      language: 'typescript',
      imports: [],
      classes,
      interfaces: [],
      functions: [],
      functionCalls: [],
      mutations: [],
    };

    return {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      parsedFile,
      archId: 'test.arch',
      constraintSource: 'test.arch',
    };
  }

  beforeEach(() => {
    validator = new MustExtendValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('must_extend');
    expect(validator.errorCode).toBe('E001');
  });

  describe('class extends required base', () => {
    it('should pass when class extends required base', () => {
      const context = createContext([
        createClass({ name: 'MyService', extends: 'BaseService', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when class has no base class', () => {
      const context = createContext([
        createClass({ name: 'MyService', extends: undefined, isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('has no base class');
    });

    it('should fail when class extends wrong base', () => {
      const context = createContext([
        createClass({ name: 'MyService', extends: 'OtherBase', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain("found 'OtherBase'");
    });
  });

  describe('generics handling', () => {
    it('should handle generic base class in constraint', () => {
      const context = createContext([
        createClass({ name: 'UserFilter', extends: 'BaseFilter', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseFilter<T>',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should handle generic base class in actual extends', () => {
      const context = createContext([
        createClass({ name: 'UserFilter', extends: 'BaseFilter<User>', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseFilter',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should handle both constraint and extends having generics', () => {
      const context = createContext([
        createClass({ name: 'UserFilter', extends: 'BaseFilter<User>', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseFilter<T>',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('inheritance chain', () => {
    it('should pass when base is in inheritance chain', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          extends: 'ServiceBase',
          inheritanceChain: ['ServiceBase', 'BaseService'],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should fail when base is not in inheritance chain', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          extends: 'OtherBase',
          inheritanceChain: ['OtherBase', 'SomethingElse'],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });

    it('should handle missing inheritance chain gracefully', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          extends: 'OtherBase',
          inheritanceChain: undefined,
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('exported vs non-exported classes', () => {
    it('should skip non-exported classes', () => {
      const context = createContext([
        createClass({ name: 'PrivateHelper', extends: undefined, isExported: false }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should only check exported classes', () => {
      const context = createContext([
        createClass({ name: 'PrivateHelper', extends: undefined, isExported: false }),
        createClass({ name: 'PublicService', extends: 'BaseService', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('multiple classes', () => {
    it('should report violations for all non-compliant classes', () => {
      const context = createContext([
        createClass({ name: 'Service1', extends: undefined, isExported: true, location: { line: 1, column: 1 } }),
        createClass({ name: 'Service2', extends: 'WrongBase', isExported: true, location: { line: 10, column: 1 } }),
        createClass({ name: 'Service3', extends: 'BaseService', isExported: true, location: { line: 20, column: 1 } }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
      expect(result.violations[0].message).toContain('Service1');
      expect(result.violations[1].message).toContain('Service2');
    });

    it('should pass when all exported classes extend required base', () => {
      const context = createContext([
        createClass({ name: 'Service1', extends: 'BaseService', isExported: true }),
        createClass({ name: 'Service2', extends: 'BaseService', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('violation details', () => {
    it('should include line and column', () => {
      const context = createContext([
        createClass({ name: 'MyService', extends: undefined, isExported: true, location: { line: 15, column: 3 } }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].line).toBe(15);
      expect(result.violations[0].column).toBe(3);
    });

    it('should include actual extends in message for wrong base', () => {
      const context = createContext([
        createClass({ name: 'MyService', extends: 'WrongBase', isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].message).toContain('WrongBase');
    });

    it('should include fixHint', () => {
      const context = createContext([
        createClass({ name: 'MyService', extends: undefined, isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Add 'extends BaseService' to the class declaration");
    });
  });

  describe('empty file', () => {
    it('should pass when file has no classes', () => {
      const context = createContext([]);
      const constraint: Constraint = {
        rule: 'must_extend',
        value: 'BaseService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });
});
