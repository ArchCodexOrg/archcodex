/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for RequireTryCatchValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RequireTryCatchValidator } from '../../../../src/core/constraints/require-try-catch.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, FunctionCallInfo, ControlFlowContext } from '../../../../src/validators/semantic.types.js';

describe('RequireTryCatchValidator', () => {
  let validator: RequireTryCatchValidator;

  function createControlFlow(overrides: Partial<ControlFlowContext> = {}): ControlFlowContext {
    return {
      inTryBlock: false,
      inCatchBlock: false,
      inFinallyBlock: false,
      tryDepth: 0,
      ...overrides,
    };
  }

  function createCall(overrides: Partial<FunctionCallInfo>): FunctionCallInfo {
    return {
      callee: 'test',
      methodName: 'test',
      arguments: [],
      argumentCount: 0,
      location: { line: 1, column: 1 },
      rawText: 'test()',
      controlFlow: createControlFlow(),
      isConstructorCall: false,
      isOptionalChain: false,
      ...overrides,
    };
  }

  function createContext(calls: FunctionCallInfo[]): ConstraintContext {
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
      functionCalls: calls,
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
    validator = new RequireTryCatchValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('require_try_catch');
    expect(validator.errorCode).toBe('E015');
  });

  describe('using value field', () => {
    it('should fail when matching call is not in try block', () => {
      const context = createContext([
        createCall({ callee: 'fetch', methodName: 'fetch' }),
      ]);
      const constraint: Constraint = {
        rule: 'require_try_catch',
        value: ['fetch'],
        severity: 'warning',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('fetch');
      expect(result.violations[0].message).toContain('try/catch');
    });

    it('should pass when matching call is in try block', () => {
      const context = createContext([
        createCall({
          callee: 'fetch',
          methodName: 'fetch',
          controlFlow: createControlFlow({ inTryBlock: true, tryDepth: 1 }),
        }),
      ]);
      const constraint: Constraint = {
        rule: 'require_try_catch',
        value: ['fetch'],
        severity: 'warning',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('using around field', () => {
    it('should use around field for patterns', () => {
      const context = createContext([
        createCall({ callee: 'api.post', methodName: 'post', receiver: 'api' }),
      ]);
      const constraint = {
        rule: 'require_try_catch',
        value: 'unused',
        around: ['api.*'],
        severity: 'warning',
      } as Constraint;

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should pass when call in around pattern is in try block', () => {
      const context = createContext([
        createCall({
          callee: 'api.post',
          methodName: 'post',
          receiver: 'api',
          controlFlow: createControlFlow({ inTryBlock: true }),
        }),
      ]);
      const constraint = {
        rule: 'require_try_catch',
        value: 'unused',
        around: ['api.*'],
        severity: 'warning',
      } as Constraint;

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('wildcard patterns', () => {
    it('should match single wildcard in around', () => {
      const context = createContext([
        createCall({ callee: 'db.query', methodName: 'query', receiver: 'db' }),
        createCall({ callee: 'db.execute', methodName: 'execute', receiver: 'db' }),
      ]);
      const constraint = {
        rule: 'require_try_catch',
        value: 'unused',
        around: ['db.*'],
        severity: 'warning',
      } as Constraint;

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should match deep wildcard', () => {
      const context = createContext([
        createCall({ callee: 'api.client.fetch', methodName: 'fetch', receiver: 'api.client' }),
      ]);
      const constraint = {
        rule: 'require_try_catch',
        value: 'unused',
        around: ['api.**'],
        severity: 'warning',
      } as Constraint;

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('non-matching calls', () => {
    it('should ignore calls that do not match patterns', () => {
      const context = createContext([
        createCall({ callee: 'console.log', methodName: 'log', receiver: 'console' }),
        createCall({ callee: 'Math.random', methodName: 'random', receiver: 'Math' }),
      ]);
      const constraint = {
        rule: 'require_try_catch',
        value: 'unused',
        around: ['api.*', 'fetch'],
        severity: 'warning',
      } as Constraint;

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('nested try blocks', () => {
    it('should pass for calls in nested try blocks', () => {
      const context = createContext([
        createCall({
          callee: 'fetch',
          methodName: 'fetch',
          controlFlow: createControlFlow({ inTryBlock: true, tryDepth: 2 }),
        }),
      ]);
      const constraint: Constraint = {
        rule: 'require_try_catch',
        value: ['fetch'],
        severity: 'warning',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('violation details', () => {
    it('should include location in violation', () => {
      const context = createContext([
        createCall({
          callee: 'fetch',
          methodName: 'fetch',
          location: { line: 15, column: 10 },
        }),
      ]);
      const constraint: Constraint = {
        rule: 'require_try_catch',
        value: ['fetch'],
        severity: 'warning',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].line).toBe(15);
      expect(result.violations[0].column).toBe(10);
    });
  });
});
