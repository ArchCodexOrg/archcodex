/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { BaseConstraintValidator } from '../../../../src/core/constraints/base.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext, ConstraintResult } from '../../../../src/core/constraints/types.js';

class TestValidator extends BaseConstraintValidator {
  readonly rule = 'test_rule' as const;
  readonly errorCode = 'E999';

  validate(_constraint: Constraint, _context: ConstraintContext): ConstraintResult {
    return { passed: true, violations: [] };
  }
}

describe('BaseConstraintValidator', () => {
  const validator = new TestValidator();

  describe('normalizeToArray', () => {
    it('should return array as-is', () => {
      const result = (validator as any).normalizeToArray(['a', 'b']);
      expect(result).toEqual(['a', 'b']);
    });

    it('should wrap string in array', () => {
      const result = (validator as any).normalizeToArray('test');
      expect(result).toEqual(['test']);
    });

    it('should convert number to string array', () => {
      const result = (validator as any).normalizeToArray(42);
      expect(result).toEqual(['42']);
    });
  });

  describe('createViolation', () => {
    it('should create violation with correct fields', () => {
      const constraint: Constraint = {
        rule: 'test_rule',
        value: 'test-value',
        severity: 'error',
        why: 'Test reason',
      };
      const context: ConstraintContext = {
        filePath: '/path/to/file.ts',
        fileName: 'file.ts',
        parsedFile: { filePath: '/path/to/file.ts', fileContent: '', imports: [], classes: [], functions: [], exports: [], decorators: [] },
        archId: 'test.arch',
        constraintSource: 'test-source',
      };

      const violation = (validator as any).createViolation(
        constraint,
        'Test message',
        context,
        { line: 10, column: 5 },
        'actual-value'
      );

      expect(violation.code).toBe('E999');
      expect(violation.rule).toBe('test_rule');
      expect(violation.message).toBe('Test message');
      expect(violation.severity).toBe('error');
      expect(violation.line).toBe(10);
      expect(violation.column).toBe(5);
      expect(violation.why).toBe('Test reason');
    });
  });
});
