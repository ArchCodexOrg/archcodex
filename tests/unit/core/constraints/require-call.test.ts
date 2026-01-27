/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireCallValidator } from '../../../../src/core/constraints/require-call.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, FunctionCallInfo } from '../../../../src/validators/semantic.types.js';

describe('RequireCallValidator', () => {
  const validator = new RequireCallValidator();

  const createContext = (calls: Partial<FunctionCallInfo>[]): ConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    archId: 'test.arch',
    constraintSource: 'test.arch',
    parsedFile: {
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
      functionCalls: calls.map(c => ({
        callee: c.callee || '',
        methodName: c.methodName || c.callee || '',
        receiver: c.receiver,
        arguments: [],
        argumentCount: 0,
        location: { line: 1, column: 1 },
        rawText: '',
        controlFlow: { inTryBlock: false, inCatchBlock: false, inFinallyBlock: false, tryDepth: 0 },
        isConstructorCall: false,
        isOptionalChain: false,
      })),
      mutations: [],
      exports: [],
    } as SemanticModel,
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_call');
  });

  it('should pass when required call exists', () => {
    const constraint: Constraint = { rule: 'require_call', value: ['validateInput'], severity: 'error' };
    const context = createContext([{ callee: 'validateInput', methodName: 'validateInput' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail when required call is missing', () => {
    const constraint: Constraint = { rule: 'require_call', value: ['validateInput'], severity: 'error' };
    const context = createContext([{ callee: 'someOtherCall', methodName: 'someOtherCall' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('validateInput');
  });

  it('should match wildcard suffix pattern', () => {
    const constraint: Constraint = { rule: 'require_call', value: ['validate*'], severity: 'error' };
    const context = createContext([{ callee: 'validateUser', methodName: 'validateUser' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should match method wildcard pattern', () => {
    const constraint: Constraint = { rule: 'require_call', value: ['logger.*'], severity: 'error' };
    const context = createContext([{ callee: 'logger.info', methodName: 'info', receiver: 'logger' }]);
    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });
});
