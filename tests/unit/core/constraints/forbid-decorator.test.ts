/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for ForbidDecoratorValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ForbidDecoratorValidator } from '../../../../src/core/constraints/forbid-decorator.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, ClassInfo, DecoratorInfo } from '../../../../src/validators/semantic.types.js';

describe('ForbidDecoratorValidator', () => {
  let validator: ForbidDecoratorValidator;

  function createDecorator(name: string, line = 1, column = 1): DecoratorInfo {
    return {
      name,
      location: { line, column },
    };
  }

  function createClass(overrides: Partial<ClassInfo>): ClassInfo {
    return {
      name: 'TestClass',
      location: { line: 2, column: 1 },
      isExported: true,
      isAbstract: false,
      implements: [],
      decorators: [],
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
    validator = new ForbidDecoratorValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('forbid_decorator');
    expect(validator.errorCode).toBe('E006');
  });

  describe('decorator detection', () => {
    it('should pass when class has no forbidden decorator', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [createDecorator('Injectable')],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when class has forbidden decorator', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [createDecorator('Deprecated')],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain("forbidden decorator '@Deprecated'");
    });

    it('should handle decorator name with @ prefix in constraint', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [createDecorator('Deprecated')],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: '@Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should pass when class has no decorators', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('multiple decorators', () => {
    it('should detect forbidden decorator among multiple decorators', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [
            createDecorator('Injectable'),
            createDecorator('Deprecated'),
            createDecorator('Scoped'),
          ],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should report multiple violations for same forbidden decorator on multiple classes', () => {
      const context = createContext([
        createClass({
          name: 'Service1',
          decorators: [createDecorator('Deprecated', 1, 1)],
          isExported: true,
          location: { line: 2, column: 1 },
        }),
        createClass({
          name: 'Service2',
          decorators: [createDecorator('Deprecated', 10, 1)],
          isExported: true,
          location: { line: 11, column: 1 },
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('exported vs non-exported classes', () => {
    it('should skip non-exported classes', () => {
      const context = createContext([
        createClass({
          name: 'PrivateHelper',
          decorators: [createDecorator('Deprecated')],
          isExported: false,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should only check exported classes', () => {
      const context = createContext([
        createClass({
          name: 'PrivateHelper',
          decorators: [createDecorator('Deprecated')],
          isExported: false,
        }),
        createClass({
          name: 'PublicService',
          decorators: [createDecorator('Injectable')],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('violation details', () => {
    it('should include decorator location in violation', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [createDecorator('Deprecated', 15, 3)],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].line).toBe(15);
      expect(result.violations[0].column).toBe(3);
    });

    it('should include class name in violation message', () => {
      const context = createContext([
        createClass({
          name: 'MySpecialService',
          decorators: [createDecorator('Deprecated')],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].message).toContain('MySpecialService');
    });

    it('should include fixHint', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [createDecorator('Deprecated')],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Remove the '@Deprecated' decorator");
    });

    it('should handle @ prefix in constraint for fixHint', () => {
      const context = createContext([
        createClass({
          name: 'MyService',
          decorators: [createDecorator('Deprecated')],
          isExported: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: '@Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Remove the '@Deprecated' decorator");
    });
  });

  describe('empty file', () => {
    it('should pass when file has no classes', () => {
      const context = createContext([]);
      const constraint: Constraint = {
        rule: 'forbid_decorator',
        value: 'Deprecated',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });
});
