/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  getAllFunctionsWithIntents,
  findContainingFunction,
  findFunctionByName,
  getEffectiveIntents,
  getEffectiveIntentsForCall,
  hasIntent,
} from '../../../../src/core/constraints/intent-resolver.js';
import type { SemanticModel, FunctionInfo, ClassInfo } from '../../../../src/validators/semantic.types.js';
import type { IntentAnnotation } from '../../../../src/core/arch-tag/types.js';

describe('intent-resolver', () => {
  // Helper to create minimal SemanticModel
  function createModel(
    functions: Partial<FunctionInfo>[],
    classes: Partial<ClassInfo>[] = []
  ): SemanticModel {
    return {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content: '',
      lineCount: 100,
      locCount: 80,
      language: 'typescript',
      imports: [],
      classes: classes.map(c => ({
        name: c.name || 'TestClass',
        isExported: c.isExported ?? true,
        implements: [],
        decorators: [],
        methods: c.methods || [],
        isAbstract: false,
        location: { line: 1, column: 1 },
        ...c,
      })) as ClassInfo[],
      interfaces: [],
      functions: functions.map(f => ({
        name: f.name || 'testFunc',
        isExported: f.isExported ?? true,
        decorators: [],
        location: { line: 1, column: 1 },
        ...f,
      })) as FunctionInfo[],
      functionCalls: [],
      mutations: [],
      exports: [],
    };
  }

  describe('getAllFunctionsWithIntents', () => {
    it('should return standalone functions with intents', () => {
      const model = createModel([
        { name: 'func1', intents: ['cli-output'], startLine: 10, endLine: 20 },
        { name: 'func2', intents: undefined, startLine: 25, endLine: 30 },
      ]);

      const result = getAllFunctionsWithIntents(model);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'func1',
        intents: ['cli-output'],
        startLine: 10,
        endLine: 20,
      });
      expect(result[1].intents).toBeUndefined();
    });

    it('should include class methods with intents', () => {
      const model = createModel([], [
        {
          name: 'MyClass',
          methods: [
            {
              name: 'method1',
              intents: ['stateless'],
              startLine: 5,
              endLine: 15,
              visibility: 'public',
              isStatic: false,
              isAbstract: false,
              decorators: [],
              parameterCount: 0,
              location: { line: 5, column: 3 },
            },
          ],
        },
      ]);

      const result = getAllFunctionsWithIntents(model);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('MyClass.method1');
      expect(result[0].intents).toEqual(['stateless']);
    });
  });

  describe('findContainingFunction', () => {
    it('should find function containing a line', () => {
      const functions = [
        { name: 'outer', startLine: 1, endLine: 50 },
        { name: 'inner', intents: ['cli-output'], startLine: 10, endLine: 20 },
      ];

      const result = findContainingFunction(15, functions);

      // Should return innermost (inner) because it has smaller range
      expect(result?.name).toBe('inner');
    });

    it('should return undefined for line outside all functions', () => {
      const functions = [
        { name: 'func1', startLine: 10, endLine: 20 },
      ];

      const result = findContainingFunction(5, functions);

      expect(result).toBeUndefined();
    });

    it('should handle nested functions (return innermost)', () => {
      const functions = [
        { name: 'outer', startLine: 1, endLine: 100 },
        { name: 'middle', startLine: 10, endLine: 50 },
        { name: 'inner', startLine: 20, endLine: 30 },
      ];

      const result = findContainingFunction(25, functions);

      expect(result?.name).toBe('inner');
    });
  });

  describe('findFunctionByName', () => {
    it('should find function by simple name', () => {
      const functions = [
        { name: 'func1', intents: ['a'] },
        { name: 'func2', intents: ['b'] },
      ];

      const result = findFunctionByName('func2', functions);

      expect(result?.intents).toEqual(['b']);
    });

    it('should find method by qualified name', () => {
      const functions = [
        { name: 'MyClass.method1', intents: ['cli-output'] },
      ];

      const result = findFunctionByName('MyClass.method1', functions);

      expect(result?.intents).toEqual(['cli-output']);
    });

    it('should return undefined for non-existent name', () => {
      const functions = [{ name: 'func1' }];

      const result = findFunctionByName('nonexistent', functions);

      expect(result).toBeUndefined();
    });
  });

  describe('getEffectiveIntents', () => {
    const fileIntents: IntentAnnotation[] = [
      { name: 'file-intent', line: 3, column: 4 },
    ];

    it('should return function intents when line is inside function with intents', () => {
      const functions = [
        { name: 'func1', intents: ['func-intent'], startLine: 10, endLine: 20 },
      ];

      const result = getEffectiveIntents(15, fileIntents, functions);

      expect(result).toEqual(['func-intent']);
    });

    it('should return file intents when line is outside functions', () => {
      const functions = [
        { name: 'func1', intents: ['func-intent'], startLine: 10, endLine: 20 },
      ];

      const result = getEffectiveIntents(5, fileIntents, functions);

      expect(result).toEqual(['file-intent']);
    });

    it('should return file intents when function has no intents', () => {
      const functions = [
        { name: 'func1', startLine: 10, endLine: 20 }, // No intents
      ];

      const result = getEffectiveIntents(15, fileIntents, functions);

      expect(result).toEqual(['file-intent']);
    });

    it('should prioritize innermost function intents for nested functions', () => {
      const functions = [
        { name: 'outer', intents: ['outer-intent'], startLine: 1, endLine: 50 },
        { name: 'inner', intents: ['inner-intent'], startLine: 10, endLine: 20 },
      ];

      const result = getEffectiveIntents(15, fileIntents, functions);

      expect(result).toEqual(['inner-intent']);
    });
  });

  describe('getEffectiveIntentsForCall', () => {
    const fileIntents: IntentAnnotation[] = [
      { name: 'file-intent', line: 3, column: 4 },
    ];

    it('should return file intents when parentFunction is undefined (module scope)', () => {
      const functions = [
        { name: 'func1', intents: ['func-intent'] },
      ];

      const result = getEffectiveIntentsForCall(undefined, fileIntents, functions);

      expect(result).toEqual(['file-intent']);
    });

    it('should return function intents when parent function has intents', () => {
      const functions = [
        { name: 'myFunc', intents: ['cli-output'] },
      ];

      const result = getEffectiveIntentsForCall('myFunc', fileIntents, functions);

      expect(result).toEqual(['cli-output']);
    });

    it('should fall back to file intents when parent function has no intents', () => {
      const functions = [
        { name: 'myFunc' }, // No intents
      ];

      const result = getEffectiveIntentsForCall('myFunc', fileIntents, functions);

      expect(result).toEqual(['file-intent']);
    });
  });

  describe('hasIntent', () => {
    it('should return true for exact match', () => {
      expect(hasIntent(['cli-output', 'stateless'], 'cli-output')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(hasIntent(['CLI-OUTPUT'], 'cli-output')).toBe(true);
      expect(hasIntent(['cli-output'], 'CLI-OUTPUT')).toBe(true);
    });

    it('should return false when intent not present', () => {
      expect(hasIntent(['stateless'], 'cli-output')).toBe(false);
    });

    it('should return false for empty intents', () => {
      expect(hasIntent([], 'cli-output')).toBe(false);
    });
  });
});
