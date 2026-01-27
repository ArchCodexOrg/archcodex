/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for ForbidCallValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ForbidCallValidator } from '../../../../src/core/constraints/forbid-call.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, FunctionCallInfo, ControlFlowContext } from '../../../../src/validators/semantic.types.js';

describe('ForbidCallValidator', () => {
  let validator: ForbidCallValidator;

  const defaultControlFlow: ControlFlowContext = {
    inTryBlock: false,
    inCatchBlock: false,
    inFinallyBlock: false,
    tryDepth: 0,
  };

  function createCall(overrides: Partial<FunctionCallInfo>): FunctionCallInfo {
    return {
      callee: 'test',
      methodName: 'test',
      arguments: [],
      argumentCount: 0,
      location: { line: 1, column: 1 },
      rawText: 'test()',
      controlFlow: defaultControlFlow,
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
    validator = new ForbidCallValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('forbid_call');
    expect(validator.errorCode).toBe('E014');
  });

  describe('exact match', () => {
    it('should detect forbidden exact function call', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('setTimeout');
    });

    it('should pass when no forbidden calls present', () => {
      const context = createContext([
        createCall({ callee: 'console.log', methodName: 'log', receiver: 'console' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect multiple forbidden calls', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
        createCall({ callee: 'setInterval', methodName: 'setInterval', location: { line: 5, column: 1 } }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout', 'setInterval'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('wildcard patterns', () => {
    it('should match single wildcard pattern (api.*)', () => {
      const context = createContext([
        createCall({ callee: 'api.fetch', methodName: 'fetch', receiver: 'api' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['api.*'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should not match deep call with single wildcard', () => {
      const context = createContext([
        createCall({ callee: 'api.client.fetch', methodName: 'fetch', receiver: 'api.client' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['api.*'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should match deep wildcard pattern (api.**)', () => {
      const context = createContext([
        createCall({ callee: 'api.client.fetch', methodName: 'fetch', receiver: 'api.client' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['api.**'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });
  });

  describe('regex patterns', () => {
    it('should match regex pattern', () => {
      const context = createContext([
        createCall({ callee: 'console.log', methodName: 'log', receiver: 'console' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['/^console\\./'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
    });

    it('should not match when regex does not match', () => {
      const context = createContext([
        createCall({ callee: 'myConsole.log', methodName: 'log', receiver: 'myConsole' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['/^console\\./'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('violation details', () => {
    it('should include line and column in violation', () => {
      const context = createContext([
        createCall({
          callee: 'setTimeout',
          methodName: 'setTimeout',
          location: { line: 10, column: 5 },
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].line).toBe(10);
      expect(result.violations[0].column).toBe(5);
    });

    it('should include why from constraint', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        why: 'Use requestAnimationFrame instead',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].why).toBe('Use requestAnimationFrame instead');
    });
  });

  describe('intent exemptions', () => {
    it('should skip violations when function has exempting intent', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 20,
        language: 'typescript',
        imports: [],
        classes: [],
        interfaces: [],
        functions: [
          {
            name: 'logReport',
            location: { line: 5, column: 1 },
            isAsync: false,
            isExported: true,
            isGenerator: false,
            parameters: [],
            intents: ['cli-output'],
          },
        ],
        functionCalls: [
          createCall({
            callee: 'console.log',
            methodName: 'log',
            receiver: 'console',
            parentFunction: 'logReport',
          }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        intents: [], // file-level intents
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['/^console\\./'],
        severity: 'error',
        unless: ['@intent:cli-output'],
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should violate when function lacks exempting intent', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 20,
        language: 'typescript',
        imports: [],
        classes: [],
        interfaces: [],
        functions: [
          {
            name: 'processData',
            location: { line: 5, column: 1 },
            isAsync: false,
            isExported: true,
            isGenerator: false,
            parameters: [],
            intents: [], // no intents
          },
        ],
        functionCalls: [
          createCall({
            callee: 'console.log',
            methodName: 'log',
            receiver: 'console',
            parentFunction: 'processData',
          }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        intents: [],
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['/^console\\./'],
        severity: 'error',
        unless: ['@intent:cli-output'],
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should respect file-level intents when no function intent', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 20,
        language: 'typescript',
        imports: [],
        classes: [],
        interfaces: [],
        functions: [
          {
            name: 'processData',
            location: { line: 5, column: 1 },
            isAsync: false,
            isExported: true,
            isGenerator: false,
            parameters: [],
            intents: [], // no function-level intent
          },
        ],
        functionCalls: [
          createCall({
            callee: 'console.log',
            methodName: 'log',
            receiver: 'console',
            parentFunction: 'processData',
          }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        intents: [{ name: 'cli-output', line: 1, column: 1 }], // file-level intent as IntentAnnotation
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['/^console\\./'],
        severity: 'error',
        unless: ['@intent:cli-output'],
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle mixed intent and non-intent unless conditions', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        unless: ['@intent:timer-allowed', 'some-other-condition'],
      };

      const result = validator.validate(constraint, context);

      // Should still violate since no intent present
      expect(result.passed).toBe(false);
    });
  });

  describe('suggestion building', () => {
    it('should include replace suggestion with alternative', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternative: 'scheduler.delay',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'replace',
        target: 'setTimeout',
        replacement: 'scheduler.delay',
      });
    });

    it('should include replace suggestion with detailed alternatives', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/scheduler',
            export: 'delay',
            description: 'Managed timer with cleanup',
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'replace',
        target: 'setTimeout',
        replacement: 'delay',
        importStatement: "import { delay } from 'src/utils/scheduler';",
      });
    });

    it('should include remove suggestion when no alternative', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'remove',
        target: 'setTimeout',
      });
    });

    it('should use module name when no export in alternatives', () => {
      const context = createContext([
        createCall({ callee: 'axios', methodName: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['axios'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/http-client',
            // No export specified
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'replace',
        target: 'axios',
        replacement: 'src/utils/http-client',
        importStatement: "import * from 'src/utils/http-client';",
      });
    });
  });

  describe('didYouMean building', () => {
    it('should include didYouMean from alternative', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternative: 'scheduler.delay',
        why: 'Use managed timers for proper cleanup',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'scheduler.delay',
        description: 'Use managed timers for proper cleanup',
      });
    });

    it('should include didYouMean from detailed alternatives', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/scheduler',
            export: 'delay',
            description: 'Managed timer',
            example: 'await delay(100)',
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'src/utils/scheduler',
        export: 'delay',
        description: 'Managed timer',
        exampleUsage: 'await delay(100)',
      });
    });

    it('should use default description for alternatives without description', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/scheduler',
            export: 'delay',
            // No description
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.description).toBe('Use the canonical implementation');
    });

    it('should use default description for alternative without why', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternative: 'scheduler.delay',
        // No why field
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.description).toBe('Use the approved alternative instead');
    });

    it('should include didYouMean from pattern registry', () => {
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
        functionCalls: [
          createCall({ callee: 'console.log', methodName: 'log', receiver: 'console' }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              exports: ['logger'],
              usage: 'Use structured logger',
              keywords: ['log', 'debug', 'error', 'console'],
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['/^console\\./'],
        severity: 'error',
        // No alternative/alternatives - should fall back to pattern registry
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'src/utils/logger.ts',
        export: 'logger',
        description: 'Use structured logger',
        exampleUsage: undefined,
      });
    });

    it('should match pattern registry by keyword in callee', () => {
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
        functionCalls: [
          createCall({ callee: 'debugHelper', methodName: 'debugHelper' }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              exports: ['logger'],
              usage: 'Use structured logger',
              keywords: ['log', 'debug', 'error'],
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['debugHelper'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.file).toBe('src/utils/logger.ts');
    });

    it('should return undefined didYouMean when no match found', () => {
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
        functionCalls: [
          createCall({ callee: 'customFunc', methodName: 'customFunc' }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              exports: ['logger'],
              keywords: ['log', 'debug'],
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['customFunc'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toBeUndefined();
    });

    it('should handle pattern registry with no patterns', () => {
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
        functionCalls: [
          createCall({ callee: 'customFunc', methodName: 'customFunc' }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          // No patterns defined
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['customFunc'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toBeUndefined();
    });

    it('should handle pattern with example in registry', () => {
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
        functionCalls: [
          createCall({ callee: 'console.log', methodName: 'log', receiver: 'console' }),
        ],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              exports: ['logger'],
              keywords: ['log', 'console'],
              example: 'logger.info("message")',
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['/^console\\./'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.exampleUsage).toBe('logger.info("message")');
    });
  });

  describe('getFixHint', () => {
    it('should return hint with alternative', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternative: 'scheduler.delay',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Replace with 'scheduler.delay'");
    });

    it('should return hint with alternatives module', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/scheduler',
            export: 'delay',
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Replace with 'src/utils/scheduler' (use delay)");
    });

    it('should return hint with alternatives module without export', () => {
      const context = createContext([
        createCall({ callee: 'axios', methodName: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['axios'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/http-client',
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe("Replace with 'src/utils/http-client'");
    });

    it('should return hint listing forbidden calls when no alternative', () => {
      const context = createContext([
        createCall({ callee: 'setTimeout', methodName: 'setTimeout' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_call',
        value: ['setTimeout', 'setInterval'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe('Remove or replace the forbidden call(s): setTimeout, setInterval');
    });
  });
});
