/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for ImplementsValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ImplementsValidator } from '../../../../src/core/constraints/implements.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, ClassInfo } from '../../../../src/validators/semantic.types.js';

describe('ImplementsValidator', () => {
  let validator: ImplementsValidator;

  function createClass(overrides: Partial<ClassInfo>): ClassInfo {
    return {
      name: 'TestClass',
      location: { line: 1, column: 1 },
      isExported: true,
      isAbstract: false,
      implements: [],
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
    validator = new ImplementsValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('implements');
    expect(validator.errorCode).toBe('E002');
  });

  describe('class implements required interface', () => {
    it('should pass when class implements required interface', () => {
      const context = createContext([
        createClass({ name: 'MyService', implements: ['IService'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when class does not implement required interface', () => {
      const context = createContext([
        createClass({ name: 'MyService', implements: [], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain("must implement 'IService'");
    });

    it('should fail when class implements wrong interface', () => {
      const context = createContext([
        createClass({ name: 'MyService', implements: ['OtherInterface'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should pass when class implements multiple interfaces including required', () => {
      const context = createContext([
        createClass({ name: 'MyService', implements: ['ILogger', 'IService', 'IDisposable'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('generics handling', () => {
    it('should handle generic interface in constraint', () => {
      const context = createContext([
        createClass({ name: 'UserHandler', implements: ['IHandler'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IHandler<T>',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should handle generic interface in actual implements', () => {
      const context = createContext([
        createClass({ name: 'UserHandler', implements: ['IHandler<User>'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IHandler',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should handle both constraint and implements having generics', () => {
      const context = createContext([
        createClass({ name: 'UserHandler', implements: ['IHandler<User>'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IHandler<T>',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('exported vs non-exported classes', () => {
    it('should skip non-exported classes', () => {
      const context = createContext([
        createClass({ name: 'PrivateHelper', implements: [], isExported: false }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should only check exported classes', () => {
      const context = createContext([
        createClass({ name: 'PrivateHelper', implements: [], isExported: false }),
        createClass({ name: 'PublicService', implements: ['IService'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('multiple classes', () => {
    it('should report violations for all non-compliant classes', () => {
      const context = createContext([
        createClass({ name: 'Service1', implements: [], isExported: true, location: { line: 1, column: 1 } }),
        createClass({ name: 'Service2', implements: ['OtherInterface'], isExported: true, location: { line: 10, column: 1 } }),
        createClass({ name: 'Service3', implements: ['IService'], isExported: true, location: { line: 20, column: 1 } }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
      expect(result.violations[0].message).toContain('Service1');
      expect(result.violations[1].message).toContain('Service2');
    });

    it('should pass when all exported classes implement required interface', () => {
      const context = createContext([
        createClass({ name: 'Service1', implements: ['IService'], isExported: true }),
        createClass({ name: 'Service2', implements: ['IService', 'ILogger'], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('violation details', () => {
    it('should include line and column', () => {
      const context = createContext([
        createClass({ name: 'MyService', implements: [], isExported: true, location: { line: 15, column: 3 } }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].line).toBe(15);
      expect(result.violations[0].column).toBe(3);
    });

    it('should include fixHint', () => {
      const context = createContext([
        createClass({ name: 'MyService', implements: [], isExported: true }),
      ]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Add 'implements IService' to the class declaration");
    });
  });

  describe('empty file', () => {
    it('should pass when file has no classes', () => {
      const context = createContext([]);
      const constraint: Constraint = {
        rule: 'implements',
        value: 'IService',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });
});
