/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { MaxFileLinesValidator } from '../../../../src/core/constraints/max-file-lines.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';

const createContext = (lineCount: number, locCount: number): ConstraintContext => ({
  filePath: '/test/file.ts',
  fileName: 'file.ts',
  archId: 'test.arch',
  constraintSource: 'test.arch',
  parsedFile: {
    filePath: '/test/file.ts',
    fileName: 'file.ts',
    extension: '.ts',
    content: '',
    lineCount,
    locCount,
    language: 'typescript',
    imports: [],
    classes: [],
    interfaces: [],
    functions: [],
    functionCalls: [],
    mutations: [],
    exports: [],
  },
});

describe('MaxFileLinesValidator', () => {
  const validator = new MaxFileLinesValidator();

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('max_file_lines');
  });

  it('should have an error code', () => {
    expect(validator.errorCode).toBeDefined();
  });

  it('should have validate method', () => {
    expect(typeof validator.validate).toBe('function');
  });

  describe('validate', () => {
    it('should pass when file is under the limit', () => {
      const constraint: Constraint = { rule: 'max_file_lines', value: 100, severity: 'error' };
      const context = createContext(50, 40);

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when file exceeds the limit', () => {
      const constraint: Constraint = { rule: 'max_file_lines', value: 100, severity: 'error' };
      const context = createContext(150, 120);

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('150 lines');
    });

    it('should use locCount when exclude_comments is true', () => {
      const constraint: Constraint = {
        rule: 'max_file_lines',
        value: 100,
        severity: 'error',
        exclude_comments: true,
      };
      // lineCount = 150 (would fail), locCount = 80 (passes)
      const context = createContext(150, 80);

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail on locCount when exclude_comments is true and LOC exceeds limit', () => {
      const constraint: Constraint = {
        rule: 'max_file_lines',
        value: 100,
        severity: 'error',
        exclude_comments: true,
      };
      // lineCount = 200, locCount = 120 (exceeds 100)
      const context = createContext(200, 120);

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('120 lines of code');
    });

    it('should use lineCount when exclude_comments is false', () => {
      const constraint: Constraint = {
        rule: 'max_file_lines',
        value: 100,
        severity: 'error',
        exclude_comments: false,
      };
      const context = createContext(150, 80);

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('150 lines');
    });
  });
});
