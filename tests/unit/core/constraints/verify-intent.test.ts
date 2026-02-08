/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { VerifyIntentValidator } from '../../../../src/core/constraints/verify-intent.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext, IntentAnnotation } from '../../../../src/core/constraints/types.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';
import type { IntentRegistry } from '../../../../src/core/registry/schema.js';

describe('VerifyIntentValidator', () => {
  const validator = new VerifyIntentValidator();

  const createContext = (
    content: string,
    intents: IntentAnnotation[],
    intentRegistry: IntentRegistry
  ): ConstraintContext => ({
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    archId: 'test.arch',
    constraintSource: 'test.arch',
    intents,
    intentRegistry,
    parsedFile: {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content,
      lineCount: content.split('\n').length,
      language: 'typescript',
      imports: [],
      classes: [],
      interfaces: [],
      functions: [],
      functionCalls: [],
      mutations: [],
      exports: [],
    } as SemanticModel,
  });

  const defaultConstraint: Constraint = {
    rule: 'verify_intent',
    severity: 'warning',
  };

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('verify_intent');
  });

  it('should pass when no intents are present', () => {
    const registry: IntentRegistry = { intents: {} };
    const context = createContext('const x = 1;', [], registry);
    const result = validator.validate(defaultConstraint, context);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should skip undefined intents (handled elsewhere)', () => {
    const registry: IntentRegistry = { intents: {} };
    const intents: IntentAnnotation[] = [
      { name: 'undefined-intent', line: 1, column: 1 },
    ];
    const context = createContext('const x = 1;', intents, registry);
    const result = validator.validate(defaultConstraint, context);
    expect(result.passed).toBe(true);
  });

  describe('requires patterns', () => {
    it('should pass when required pattern is found', () => {
      const registry: IntentRegistry = {
        intents: {
          'admin-only': {
            description: 'Admin access required',
            requires: ['isAdmin'],
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'admin-only', line: 3, column: 4 },
      ];
      const content = `
        function checkAccess() {
          if (isAdmin()) { return true; }
        }
      `;
      const context = createContext(content, intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when required pattern is missing', () => {
      const registry: IntentRegistry = {
        intents: {
          'admin-only': {
            description: 'Admin access required',
            requires: ['isAdmin'],
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'admin-only', line: 3, column: 4 },
      ];
      const content = `
        function checkAccess() {
          return true;
        }
      `;
      const context = createContext(content, intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].code).toBe('I002');
      expect(result.violations[0].message).toContain('requires pattern');
    });

    it('should handle regex patterns in requires', () => {
      const registry: IntentRegistry = {
        intents: {
          'admin-only': {
            description: 'Admin access required',
            requires: ['/isAdmin|hasAdminRole/i'],
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'admin-only', line: 1, column: 1 },
      ];
      const content = 'if (hasAdminRole()) { doSomething(); }';
      const context = createContext(content, intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(true);
    });
  });

  describe('forbids patterns', () => {
    it('should pass when forbidden pattern is absent', () => {
      const registry: IntentRegistry = {
        intents: {
          stateless: {
            description: 'No internal state',
            forbids: ['this\\.cache'],
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'stateless', line: 1, column: 1 },
      ];
      const content = 'function process(data) { return data * 2; }';
      const context = createContext(content, intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when forbidden pattern is present', () => {
      const registry: IntentRegistry = {
        intents: {
          stateless: {
            description: 'No internal state',
            forbids: ['this\\.cache'],
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'stateless', line: 1, column: 1 },
      ];
      const content = 'this.cache.set("key", value);';
      const context = createContext(content, intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].code).toBe('I002');
      expect(result.violations[0].message).toContain('forbids pattern');
    });

    it('should handle regex patterns in forbids', () => {
      const registry: IntentRegistry = {
        intents: {
          'public-endpoint': {
            description: 'No auth required',
            forbids: ['/requireAuth|authenticate/'],
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'public-endpoint', line: 1, column: 1 },
      ];
      const content = 'authenticate(user);';
      const context = createContext(content, intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(false);
    });
  });

  describe('conflicts_with', () => {
    it('should pass when no conflicting intents present', () => {
      const registry: IntentRegistry = {
        intents: {
          'public-endpoint': {
            description: 'No auth required',
            conflicts_with: ['admin-only'],
          },
          'admin-only': {
            description: 'Admin access required',
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'public-endpoint', line: 1, column: 1 },
      ];
      const context = createContext('const x = 1;', intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when conflicting intents are present', () => {
      const registry: IntentRegistry = {
        intents: {
          'public-endpoint': {
            description: 'No auth required',
            conflicts_with: ['admin-only'],
          },
          'admin-only': {
            description: 'Admin access required',
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'public-endpoint', line: 1, column: 1 },
        { name: 'admin-only', line: 2, column: 1 },
      ];
      const context = createContext('const x = 1;', intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].code).toBe('I003');
      expect(result.violations[0].message).toContain('conflicts with');
    });
  });

  describe('requires_intent', () => {
    it('should pass when required intent is present', () => {
      const registry: IntentRegistry = {
        intents: {
          cached: {
            description: 'Response can be cached',
            requires_intent: ['idempotent'],
          },
          idempotent: {
            description: 'Operation is idempotent',
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'cached', line: 1, column: 1 },
        { name: 'idempotent', line: 2, column: 1 },
      ];
      const context = createContext('const x = 1;', intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when required intent is missing', () => {
      const registry: IntentRegistry = {
        intents: {
          cached: {
            description: 'Response can be cached',
            requires_intent: ['idempotent'],
          },
          idempotent: {
            description: 'Operation is idempotent',
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'cached', line: 1, column: 1 },
      ];
      const context = createContext('const x = 1;', intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].code).toBe('I004');
      expect(result.violations[0].message).toContain('requires');
      expect(result.violations[0].message).toContain('idempotent');
    });
  });

  describe('combined validations', () => {
    it('should collect multiple violations', () => {
      const registry: IntentRegistry = {
        intents: {
          'admin-only': {
            description: 'Admin access required',
            requires: ['isAdmin'],
            forbids: ['publicAccess'],
            conflicts_with: ['public-endpoint'],
          },
          'public-endpoint': {
            description: 'No auth required',
          },
        },
      };
      const intents: IntentAnnotation[] = [
        { name: 'admin-only', line: 1, column: 1 },
        { name: 'public-endpoint', line: 2, column: 1 },
      ];
      const content = 'const publicAccess = true;';
      const context = createContext(content, intents, registry);
      const result = validator.validate(defaultConstraint, context);
      expect(result.passed).toBe(false);
      // Missing isAdmin, has publicAccess, conflicts with public-endpoint
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });
});
