/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for MaxPublicMethodsValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MaxPublicMethodsValidator } from '../../../../src/core/constraints/max-public-methods.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, ClassInfo, MethodInfo } from '../../../../src/validators/semantic.types.js';

describe('MaxPublicMethodsValidator', () => {
  let validator: MaxPublicMethodsValidator;

  function createMethod(name: string, visibility: 'public' | 'private' | 'protected' = 'public'): MethodInfo {
    return {
      name,
      location: { line: 1, column: 1 },
      visibility,
      isStatic: false,
      isAsync: false,
      parameters: [],
    };
  }

  function createClass(methods: MethodInfo[]): ClassInfo {
    return {
      name: 'TestClass',
      location: { line: 1, column: 1 },
      isExported: true,
      isAbstract: false,
      implements: [],
      decorators: [],
      members: [],
      methods,
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
    validator = new MaxPublicMethodsValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('max_public_methods');
    expect(validator.errorCode).toBe('E009');
  });

  describe('method count validation', () => {
    it('should pass when public methods under limit', () => {
      const context = createContext([
        createClass([
          createMethod('method1', 'public'),
          createMethod('method2', 'public'),
          createMethod('method3', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 5,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when public methods exactly at limit', () => {
      const context = createContext([
        createClass([
          createMethod('method1', 'public'),
          createMethod('method2', 'public'),
          createMethod('method3', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 3,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should fail when public methods exceed limit', () => {
      const context = createContext([
        createClass([
          createMethod('method1', 'public'),
          createMethod('method2', 'public'),
          createMethod('method3', 'public'),
          createMethod('method4', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 3,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('4 public methods');
      expect(result.violations[0].message).toContain('maximum is 3');
    });
  });

  describe('visibility filtering', () => {
    it('should only count public methods', () => {
      const context = createContext([
        createClass([
          createMethod('publicMethod1', 'public'),
          createMethod('publicMethod2', 'public'),
          createMethod('privateMethod', 'private'),
          createMethod('protectedMethod', 'protected'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 2,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should fail when only counting public exceeds limit', () => {
      const context = createContext([
        createClass([
          createMethod('pub1', 'public'),
          createMethod('pub2', 'public'),
          createMethod('pub3', 'public'),
          createMethod('priv1', 'private'),
          createMethod('priv2', 'private'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 2,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('3 public methods');
    });
  });

  describe('multiple classes', () => {
    it('should count public methods across all classes', () => {
      const context = createContext([
        createClass([
          createMethod('method1', 'public'),
          createMethod('method2', 'public'),
        ]),
        createClass([
          createMethod('method3', 'public'),
          createMethod('method4', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 3,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('4 public methods');
    });

    it('should pass when sum across classes under limit', () => {
      const context = createContext([
        createClass([
          createMethod('method1', 'public'),
        ]),
        createClass([
          createMethod('method2', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 3,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('empty file', () => {
    it('should pass when file has no classes', () => {
      const context = createContext([]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 5,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should pass when classes have no methods', () => {
      const context = createContext([
        createClass([]),
        createClass([]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 5,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('violation details', () => {
    it('should include actual count in violation message', () => {
      const context = createContext([
        createClass([
          createMethod('m1', 'public'),
          createMethod('m2', 'public'),
          createMethod('m3', 'public'),
          createMethod('m4', 'public'),
          createMethod('m5', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 3,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].message).toContain('5 public methods');
    });

    it('should include fixHint', () => {
      const context = createContext([
        createClass([
          createMethod('m1', 'public'),
          createMethod('m2', 'public'),
          createMethod('m3', 'public'),
          createMethod('m4', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: 3,
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe('Reduce the number of public methods to 3 or fewer. Consider extracting methods to helper classes.');
    });
  });

  describe('string value handling', () => {
    it('should handle string value for constraint', () => {
      const context = createContext([
        createClass([
          createMethod('m1', 'public'),
          createMethod('m2', 'public'),
          createMethod('m3', 'public'),
          createMethod('m4', 'public'),
        ]),
      ]);
      const constraint: Constraint = {
        rule: 'max_public_methods',
        value: '3',
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('maximum is 3');
    });
  });
});
