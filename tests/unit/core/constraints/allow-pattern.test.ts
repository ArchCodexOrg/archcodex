/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the AllowPatternValidator and its resolution behavior.
 */
import { describe, it, expect } from 'vitest';
import { AllowPatternValidator } from '../../../../src/core/constraints/allow-pattern.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext, ParsedFile } from '../../../../src/core/constraints/types.js';

describe('AllowPatternValidator', () => {
  const validator = new AllowPatternValidator();

  function createContext(content: string, filePath = '/test/file.ts'): ConstraintContext {
    const parsedFile: ParsedFile = {
      content,
      filePath,
      classes: [],
      imports: [],
      exports: [],
      functions: [],
      decorators: [],
    };

    return {
      parsedFile,
      constraintSource: 'test.architecture',
    };
  }

  describe('rule and errorCode', () => {
    it('should have correct rule name', () => {
      expect(validator.rule).toBe('allow_pattern');
    });

    it('should have empty error code (not a validation constraint)', () => {
      expect(validator.errorCode).toBe('');
    });
  });

  describe('validate', () => {
    it('should always pass validation (not a validation constraint)', () => {
      const constraint: Constraint = {
        rule: 'allow_pattern',
        value: 'console\\.log',
        pattern: 'console\\.log',
        severity: 'error',
      };

      const context = createContext(`
        console.log('this is allowed');
      `);

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass regardless of content', () => {
      const constraint: Constraint = {
        rule: 'allow_pattern',
        value: 'anything',
        severity: 'error',
      };

      const context = createContext('any content here');

      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
