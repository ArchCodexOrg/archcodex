/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireCallBeforeValidator } from '../../../../src/core/constraints/require-call-before.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, FunctionCallInfo } from '../../../../src/validators/semantic.types.js';

describe('RequireCallBeforeValidator', () => {
  const validator = new RequireCallBeforeValidator();

  const createCall = (callee: string, line: number, column = 1): FunctionCallInfo => ({
    callee,
    methodName: callee.split('.').pop() || callee,
    receiver: callee.includes('.') ? callee.split('.').slice(0, -1).join('.') : undefined,
    arguments: [],
    argumentCount: 0,
    location: { line, column },
    rawText: `${callee}()`,
    controlFlow: { inTryBlock: false, inCatchBlock: false, inFinallyBlock: false, tryDepth: 0 },
    isConstructorCall: false,
    isOptionalChain: false,
  });

  const createContext = (calls: FunctionCallInfo[]): ConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    archId: 'test.arch',
    constraintSource: 'test.arch',
    parsedFile: {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content: '',
      lineCount: 100,
      language: 'typescript',
      imports: [],
      classes: [],
      interfaces: [],
      functions: [],
      functionCalls: calls,
      mutations: [],
      exports: [],
    } as SemanticModel,
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_call_before');
  });

  it('should pass when prerequisite call comes before guarded call', () => {
    const constraint: Constraint = {
      rule: 'require_call_before',
      value: ['canAccessProject'],
      before: ['ctx.db.patch'],
      severity: 'error',
    };
    const context = createContext([
      createCall('canAccessProject', 5),
      createCall('ctx.db.patch', 10),
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should fail when prerequisite call comes after guarded call', () => {
    const constraint: Constraint = {
      rule: 'require_call_before',
      value: ['canAccessProject'],
      before: ['ctx.db.patch'],
      severity: 'error',
    };
    const context = createContext([
      createCall('ctx.db.patch', 5),
      createCall('canAccessProject', 10),
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('ctx.db.patch');
    expect(result.violations[0].message).toContain('canAccessProject');
  });

  it('should fail when prerequisite call is missing entirely', () => {
    const constraint: Constraint = {
      rule: 'require_call_before',
      value: ['canAccessProject'],
      before: ['ctx.db.patch'],
      severity: 'error',
    };
    const context = createContext([
      createCall('ctx.db.patch', 5),
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
  });

  it('should pass when no guarded calls exist', () => {
    const constraint: Constraint = {
      rule: 'require_call_before',
      value: ['canAccessProject'],
      before: ['ctx.db.patch'],
      severity: 'error',
    };
    const context = createContext([
      createCall('someOtherCall', 5),
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should match wildcard patterns in before', () => {
    const constraint: Constraint = {
      rule: 'require_call_before',
      value: ['checkPermission'],
      before: ['ctx.db.*'],
      severity: 'error',
    };
    const context = createContext([
      createCall('checkPermission', 5),
      createCall('ctx.db.patch', 10),
      createCall('ctx.db.delete', 15),
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should accept any of multiple prerequisite calls', () => {
    const constraint: Constraint = {
      rule: 'require_call_before',
      value: ['canAccessProject', 'checkPermission', 'isAdmin'],
      before: ['ctx.db.patch'],
      severity: 'error',
    };
    const context = createContext([
      createCall('isAdmin', 5), // Only one prerequisite, but that's enough
      createCall('ctx.db.patch', 10),
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should check each guarded call independently', () => {
    const constraint: Constraint = {
      rule: 'require_call_before',
      value: ['checkPermission'],
      before: ['ctx.db.patch'],
      severity: 'error',
    };
    const context = createContext([
      createCall('checkPermission', 5),
      createCall('ctx.db.patch', 10), // OK - has prerequisite before
      createCall('ctx.db.patch', 20), // Also OK - same prerequisite applies
    ]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });
});
