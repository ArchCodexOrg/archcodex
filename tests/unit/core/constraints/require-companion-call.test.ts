/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireCompanionCallValidator } from '../../../../src/core/constraints/require-companion-call.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, FunctionCallInfo } from '../../../../src/validators/semantic.types.js';

describe('RequireCompanionCallValidator', () => {
  const validator = new RequireCompanionCallValidator();

  const createCall = (
    callee: string,
    line: number,
    args: string[] = [],
    column = 1
  ): FunctionCallInfo => ({
    callee,
    methodName: callee.split('.').pop() || callee,
    receiver: callee.includes('.') ? callee.split('.').slice(0, -1).join('.') : undefined,
    arguments: args,
    argumentCount: args.length,
    location: { line, column },
    rawText: `${callee}(${args.join(', ')})`,
    controlFlow: { inTryBlock: false, inCatchBlock: false, inFinallyBlock: false, tryDepth: 0 },
    isConstructorCall: false,
    isOptionalChain: false,
  });

  const createContext = (
    calls: FunctionCallInfo[],
    targetDetection?: { mode: 'first_argument' | 'method_chain'; receiver?: string }
  ): ConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    archId: 'test.arch',
    constraintSource: 'test.arch',
    config: targetDetection ? { table_detection: targetDetection } : undefined,
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
    expect(validator.rule).toBe('require_companion_call');
  });

  describe('single rule (shorthand)', () => {
    it('should pass when companion call exists for target operation', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'collectionMembers',
          operations: ['insert', 'delete'],
          call: 'updateProfileResourceCounts',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 5, ['collectionMembers', 'data']),
        createCall('updateProfileResourceCounts', 10),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when companion call is missing for target operation', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'collectionMembers',
          operations: ['insert', 'delete'],
          call: 'updateProfileResourceCounts',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 5, ['collectionMembers', 'data']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('insert(collectionMembers)');
      expect(result.violations[0].message).toContain('updateProfileResourceCounts');
    });

    it('should ignore operations on other targets', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'collectionMembers',
          operations: ['insert', 'delete'],
          call: 'updateProfileResourceCounts',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 5, ['users', 'data']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should ignore non-matching operations', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'collectionMembers',
          operations: ['insert', 'delete'],
          call: 'updateProfileResourceCounts',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.get', 5, ['collectionMembers']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });
  });

  describe('multiple rules', () => {
    it('should check all rules independently', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          rules: [
            { target: 'collectionMembers', operations: ['insert'], call: 'updateCounts' },
            { target: 'users', operations: ['delete'], call: 'cleanupUserData' },
          ],
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 5, ['collectionMembers', 'data']),
        createCall('ctx.db.delete', 10, ['users', 'id']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should pass when all companion calls exist', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          rules: [
            { target: 'collectionMembers', operations: ['insert'], call: 'updateCounts' },
            { target: 'users', operations: ['delete'], call: 'cleanupUserData' },
          ],
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 5, ['collectionMembers', 'data']),
        createCall('updateCounts', 6),
        createCall('ctx.db.delete', 10, ['users', 'id']),
        createCall('cleanupUserData', 11),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });
  });

  describe('target detection modes', () => {
    it('should extract target from first argument (default mode)', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'posts',
          operations: ['insert'],
          call: 'invalidateCache',
        },
        pattern: 'db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('db.insert', 5, ['posts', '{ title: "Hello" }']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('posts');
    });

    it('should extract target from method chain (Prisma style)', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'users',
          operations: ['create'],
          call: 'invalidateUserCache',
        },
        pattern: 'prisma.**',
        severity: 'error',
      };
      // For method_chain: prisma.users.create() has receiver=prisma.users, methodName=create
      const call: FunctionCallInfo = {
        callee: 'prisma.users.create',
        methodName: 'create',
        receiver: 'prisma.users',
        arguments: ['{ name: "John" }'],
        argumentCount: 1,
        location: { line: 5, column: 1 },
        rawText: 'prisma.users.create({ name: "John" })',
        controlFlow: { inTryBlock: false, inCatchBlock: false, inFinallyBlock: false, tryDepth: 0 },
        isConstructorCall: false,
        isOptionalChain: false,
      };
      const context = createContext([call], { mode: 'method_chain', receiver: 'prisma' });
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('users');
    });

    it('should use receiver as target in method_chain mode without base', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'cacheManager',
          operations: ['set'],
          call: 'save',
        },
        pattern: 'cacheManager.*',
        severity: 'error',
      };
      const call: FunctionCallInfo = {
        callee: 'cacheManager.set',
        methodName: 'set',
        receiver: 'cacheManager',
        arguments: ['key', 'value'],
        argumentCount: 2,
        location: { line: 5, column: 1 },
        rawText: 'cacheManager.set(key, value)',
        controlFlow: { inTryBlock: false, inCatchBlock: false, inFinallyBlock: false, tryDepth: 0 },
        isConstructorCall: false,
        isOptionalChain: false,
      };
      const context = createContext([call], { mode: 'method_chain' });
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('cacheManager');
      expect(result.violations[0].message).toContain('save');
    });
  });

  describe('location modes', () => {
    it('should check same_file location (default)', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'items',
          operations: ['insert'],
          call: 'refreshItems',
          location: 'same_file',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 100, ['items', 'data']),
        createCall('refreshItems', 5), // Before the insert, but in same file
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should check after location', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'items',
          operations: ['insert'],
          call: 'refreshItems',
          location: 'after',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      // Companion call is before - should fail
      const context = createContext([
        createCall('refreshItems', 5),
        createCall('ctx.db.insert', 100, ['items', 'data']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
    });

    it('should pass when companion call is after (location: after)', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'items',
          operations: ['insert'],
          call: 'refreshItems',
          location: 'after',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 5, ['items', 'data']),
        createCall('refreshItems', 100),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });
  });

  describe('pattern matching', () => {
    it('should match deep wildcard pattern', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'docs',
          operations: ['insert'],
          call: 'updateIndex',
        },
        pattern: 'ctx.db.**',
        severity: 'error',
      };
      const context = createContext([
        createCall('ctx.db.insert', 5, ['docs', 'data']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
    });

    it('should not match calls outside pattern', () => {
      const constraint: Constraint = {
        rule: 'require_companion_call',
        value: {
          target: 'docs',
          operations: ['insert'],
          call: 'updateIndex',
        },
        pattern: 'ctx.db.*',
        severity: 'error',
      };
      const context = createContext([
        createCall('otherDb.insert', 5, ['docs', 'data']),
      ]);
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true); // Not matching pattern, so no check
    });
  });
});
