/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for ForbidMutationValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ForbidMutationValidator } from '../../../../src/core/constraints/forbid-mutation.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, MutationInfo } from '../../../../src/validators/semantic.types.js';

describe('ForbidMutationValidator', () => {
  let validator: ForbidMutationValidator;

  function createMutation(overrides: Partial<MutationInfo>): MutationInfo {
    return {
      target: 'obj.prop',
      rootObject: 'obj',
      propertyPath: ['prop'],
      operator: '=',
      location: { line: 1, column: 1 },
      rawText: 'obj.prop = value',
      isDelete: false,
      ...overrides,
    };
  }

  function createContext(mutations: MutationInfo[]): ConstraintContext {
    const parsedFile: SemanticModel = {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content: '',
      lineCount: 10,
      language: 'typescript',
      imports: [],
      classes: [],
      interfaces: [],
      functions: [],
      functionCalls: [],
      mutations,
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
    validator = new ForbidMutationValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('forbid_mutation');
    expect(validator.errorCode).toBe('E016');
  });

  describe('exact target match', () => {
    it('should detect mutation of exact target', () => {
      const context = createContext([
        createMutation({
          target: 'process.env',
          rootObject: 'process',
          propertyPath: ['env'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['process.env'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('process.env');
    });

    it('should pass when no forbidden mutations present', () => {
      const context = createContext([
        createMutation({
          target: 'myObj.prop',
          rootObject: 'myObj',
          propertyPath: ['prop'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['process.env'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('root object match', () => {
    it('should match by root object', () => {
      const context = createContext([
        createMutation({
          target: 'window.location',
          rootObject: 'window',
          propertyPath: ['location'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['window'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });

    it('should match nested property by root object', () => {
      const context = createContext([
        createMutation({
          target: 'window.document.body',
          rootObject: 'window',
          propertyPath: ['document', 'body'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['window'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('prefix match', () => {
    it('should match prefix pattern', () => {
      const context = createContext([
        createMutation({
          target: 'process.env.NODE_ENV',
          rootObject: 'process',
          propertyPath: ['env', 'NODE_ENV'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['process.env'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('wildcard patterns', () => {
    it('should match single wildcard (window.*)', () => {
      const context = createContext([
        createMutation({
          target: 'window.customProp',
          rootObject: 'window',
          propertyPath: ['customProp'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['window.*'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });

    it('should not match deep property with single wildcard', () => {
      const context = createContext([
        createMutation({
          target: 'window.document.body',
          rootObject: 'window',
          propertyPath: ['document', 'body'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['window.*'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should match deep wildcard (globalThis.**)', () => {
      const context = createContext([
        createMutation({
          target: 'globalThis.deep.nested.prop',
          rootObject: 'globalThis',
          propertyPath: ['deep', 'nested', 'prop'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['globalThis.**'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('delete operations', () => {
    it('should detect delete operations', () => {
      const context = createContext([
        createMutation({
          target: 'window.customProp',
          rootObject: 'window',
          propertyPath: ['customProp'],
          operator: 'delete',
          isDelete: true,
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['window'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('Delete of');
    });
  });

  describe('different operators', () => {
    it('should detect compound assignment operators', () => {
      const context = createContext([
        createMutation({
          target: 'counter.value',
          rootObject: 'counter',
          propertyPath: ['value'],
          operator: '+=',
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['counter'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });

    it('should detect increment/decrement', () => {
      const context = createContext([
        createMutation({
          target: 'state.count',
          rootObject: 'state',
          propertyPath: ['count'],
          operator: '++',
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['state'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('multiple mutations', () => {
    it('should detect multiple forbidden mutations', () => {
      const context = createContext([
        createMutation({
          target: 'window.foo',
          rootObject: 'window',
          propertyPath: ['foo'],
          location: { line: 1, column: 1 },
        }),
        createMutation({
          target: 'process.env.KEY',
          rootObject: 'process',
          propertyPath: ['env', 'KEY'],
          location: { line: 5, column: 1 },
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['window', 'process'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('violation details', () => {
    it('should include location in violation', () => {
      const context = createContext([
        createMutation({
          target: 'window.prop',
          rootObject: 'window',
          propertyPath: ['prop'],
          location: { line: 20, column: 3 },
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['window'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].line).toBe(20);
      expect(result.violations[0].column).toBe(3);
    });

    it('should include why from constraint', () => {
      const context = createContext([
        createMutation({
          target: 'process.env',
          rootObject: 'process',
          propertyPath: ['env'],
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_mutation',
        value: ['process'],
        severity: 'error',
        why: 'Global state mutation is forbidden',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].why).toBe('Global state mutation is forbidden');
    });
  });
});
