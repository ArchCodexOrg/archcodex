/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for condition evaluator.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  hasCondition,
} from '../../../../src/core/constraints/condition-evaluator.js';
import type { ConstraintCondition } from '../../../../src/core/registry/schema.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';

describe('ConditionEvaluator', () => {
  function createSemanticModel(overrides: Partial<SemanticModel> = {}): SemanticModel {
    return {
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
      mutations: [],
      ...overrides,
    };
  }

  describe('hasCondition', () => {
    it('should return false for undefined condition', () => {
      expect(hasCondition(undefined)).toBe(false);
    });

    it('should return false for empty condition', () => {
      expect(hasCondition({})).toBe(false);
    });

    it('should return true for has_decorator condition', () => {
      expect(hasCondition({ has_decorator: '@Controller' })).toBe(true);
    });

    it('should return true for has_import condition', () => {
      expect(hasCondition({ has_import: 'express' })).toBe(true);
    });

    it('should return true for extends condition', () => {
      expect(hasCondition({ extends: 'BaseController' })).toBe(true);
    });

    it('should return true for file_matches condition', () => {
      expect(hasCondition({ file_matches: '*.controller.ts' })).toBe(true);
    });

    it('should return true for implements condition', () => {
      expect(hasCondition({ implements: 'IService' })).toBe(true);
    });

    it('should return true for method_has_decorator condition', () => {
      expect(hasCondition({ method_has_decorator: '@Get' })).toBe(true);
    });
  });

  describe('evaluateCondition - has_decorator', () => {
    it('should return satisfied when class has decorator', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'MyController',
            isExported: true,
            implements: [],
            decorators: [{ name: 'Controller', location: { line: 1, column: 1 } }],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { has_decorator: '@Controller' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain('Found decorator @Controller');
    });

    it('should return not satisfied when no class has decorator', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'MyService',
            isExported: true,
            implements: [],
            decorators: [{ name: 'Injectable', location: { line: 1, column: 1 } }],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { has_decorator: '@Controller' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('No class has decorator @Controller');
    });

    it('should handle decorator name without @ prefix', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'MyController',
            isExported: true,
            implements: [],
            decorators: [{ name: 'Controller', location: { line: 1, column: 1 } }],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { has_decorator: 'Controller' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
    });
  });

  describe('evaluateCondition - has_import', () => {
    it('should return satisfied when file has import', () => {
      const parsedFile = createSemanticModel({
        imports: [
          { moduleSpecifier: 'express', location: { line: 1, column: 1 } },
        ],
      });

      const condition: ConstraintCondition = { has_import: 'express' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain("Found import 'express'");
    });

    it('should return not satisfied when file does not have import', () => {
      const parsedFile = createSemanticModel({
        imports: [
          { moduleSpecifier: 'lodash', location: { line: 1, column: 1 } },
        ],
      });

      const condition: ConstraintCondition = { has_import: 'express' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain("No import matches 'express'");
    });

    it('should support wildcard pattern matching', () => {
      const parsedFile = createSemanticModel({
        imports: [
          { moduleSpecifier: '@nestjs/common', location: { line: 1, column: 1 } },
        ],
      });

      const condition: ConstraintCondition = { has_import: '@nestjs/*' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
    });
  });

  describe('evaluateCondition - extends', () => {
    it('should return satisfied when class extends base', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'UserController',
            isExported: true,
            extends: 'BaseController',
            implements: [],
            decorators: [],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { extends: 'BaseController' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain('Found class extending BaseController');
    });

    it('should check inheritance chain', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'UserController',
            isExported: true,
            extends: 'CrudController',
            inheritanceChain: ['CrudController', 'BaseController'],
            implements: [],
            decorators: [],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { extends: 'BaseController' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
    });

    it('should return not satisfied when no class extends base', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'UserService',
            isExported: true,
            implements: [],
            decorators: [],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { extends: 'BaseController' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(false);
    });
  });

  describe('evaluateCondition - file_matches', () => {
    it('should return satisfied when file path matches pattern', () => {
      const parsedFile = createSemanticModel();

      const condition: ConstraintCondition = { file_matches: '*.controller.ts' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/src/users/user.controller.ts',
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain("File path matches '*.controller.ts'");
    });

    it('should return not satisfied when file path does not match', () => {
      const parsedFile = createSemanticModel();

      const condition: ConstraintCondition = { file_matches: '*.controller.ts' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/src/users/user.service.ts',
      });

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain("File path does not match '*.controller.ts'");
    });

    it('should support full path patterns', () => {
      const parsedFile = createSemanticModel();

      const condition: ConstraintCondition = { file_matches: '**/src/api/**/*.ts' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/project/src/api/users/controller.ts',
      });

      expect(result.satisfied).toBe(true);
    });
  });

  describe('evaluateCondition - implements', () => {
    it('should return satisfied when class implements interface', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'UserService',
            isExported: true,
            implements: ['IUserService', 'IService'],
            decorators: [],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { implements: 'IService' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain('Found class implementing IService');
    });

    it('should return not satisfied when no class implements interface', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'UserService',
            isExported: true,
            implements: ['IUserService'],
            decorators: [],
            methods: [],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { implements: 'IController' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('No class implements IController');
    });
  });

  describe('evaluateCondition - method_has_decorator', () => {
    it('should return satisfied when method has decorator', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'UserController',
            isExported: true,
            implements: [],
            decorators: [],
            methods: [
              {
                name: 'getUser',
                visibility: 'public',
                isStatic: false,
                isAbstract: false,
                decorators: [{ name: 'Get', location: { line: 5, column: 3 } }],
                parameterCount: 1,
                location: { line: 5, column: 3 },
              },
            ],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { method_has_decorator: '@Get' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toContain('Found method/function with decorator @Get');
    });

    it('should check standalone functions', () => {
      const parsedFile = createSemanticModel({
        functions: [
          {
            name: 'handleRequest',
            isExported: true,
            decorators: [{ name: 'Route', location: { line: 1, column: 1 } }],
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { method_has_decorator: 'Route' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
    });

    it('should return not satisfied when no method has decorator', () => {
      const parsedFile = createSemanticModel({
        classes: [
          {
            name: 'UserController',
            isExported: true,
            implements: [],
            decorators: [],
            methods: [
              {
                name: 'getUser',
                visibility: 'public',
                isStatic: false,
                isAbstract: false,
                decorators: [],
                parameterCount: 1,
                location: { line: 5, column: 3 },
              },
            ],
            isAbstract: false,
            location: { line: 1, column: 1 },
          },
        ],
      });

      const condition: ConstraintCondition = { method_has_decorator: '@Get' };
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(false);
    });
  });

  describe('evaluateCondition - no condition', () => {
    it('should return satisfied when no condition is specified', () => {
      const parsedFile = createSemanticModel();

      const condition: ConstraintCondition = {};
      const result = evaluateCondition(condition, {
        parsedFile,
        filePath: '/test/file.ts',
      });

      expect(result.satisfied).toBe(true);
      expect(result.reason).toBe('No condition specified');
    });
  });
});
