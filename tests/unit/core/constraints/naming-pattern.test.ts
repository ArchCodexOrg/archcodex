/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Comprehensive tests for the NamingPatternValidator constraint.
 * Covers regex patterns, structured naming patterns, validation errors,
 * examples in messages, fix hints, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { NamingPatternValidator } from '../../../../src/core/constraints/naming-pattern.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';

describe('NamingPatternValidator', () => {
  const validator = new NamingPatternValidator();

  const createContext = (fileName: string): ConstraintContext => ({
    fileName,
    filePath: `/src/${fileName}`,
    content: '',
    archId: 'test.arch',
    constraintSource: 'test.arch',
    parsedFile: {
      content: '',
      classes: [],
      imports: [],
      exports: [],
      decorators: [],
      functions: [],
      functionCalls: [],
    },
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('naming_pattern');
  });

  it('should have an error code', () => {
    expect(validator.errorCode).toBeDefined();
  });

  it('should have validate method', () => {
    expect(typeof validator.validate).toBe('function');
  });

  // ---------------------------------------------------------------------------
  // Regex patterns
  // ---------------------------------------------------------------------------

  describe('regex patterns', () => {
    it('should pass when filename matches pattern', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '^[A-Z].*Service\\.ts$',
        severity: 'error',
      };
      const context = createContext('PaymentService.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when filename does not match pattern', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '^[A-Z].*Service\\.ts$',
        severity: 'error',
      };
      const context = createContext('paymentService.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should include pattern in error message for regex patterns', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '^[A-Z].*\\.ts$',
        severity: 'error',
      };
      const context = createContext('lowercase.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].message).toContain("'^[A-Z].*\\.ts$'");
    });

    it('should handle invalid regex pattern gracefully', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '[invalid(regex',
        severity: 'error',
      };
      const context = createContext('anything.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('Invalid naming pattern regex');
    });

    it('should include examples in error message when provided with regex', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '^[A-Z].*Service\\.ts$',
        severity: 'error',
        examples: ['UserService.ts', 'OrderService.ts'],
      };
      const context = createContext('bad.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].message).toContain('UserService.ts');
      expect(result.violations[0].message).toContain('OrderService.ts');
    });

    it('should pass with simple wildcard-like regex', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '.*\\.test\\.ts$',
        severity: 'error',
      };
      expect(validator.validate(constraint, createContext('foo.test.ts')).passed).toBe(true);
      expect(validator.validate(constraint, createContext('foo.spec.ts')).passed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Structured naming patterns
  // ---------------------------------------------------------------------------

  describe('structured naming patterns', () => {
    it('should pass when filename matches structured pattern', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'PascalCase with Service suffix',
        severity: 'error',
        naming: {
          case: 'PascalCase',
          suffix: 'Service',
          extension: '.ts',
        },
      };
      const context = createContext('PaymentService.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(true);
    });

    it('should fail when filename does not match structured pattern', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'PascalCase with Service suffix',
        severity: 'error',
        naming: {
          case: 'PascalCase',
          suffix: 'Service',
          extension: '.ts',
        },
      };
      const context = createContext('paymentService.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('naming pattern');
    });

    it('should include examples in error message when available', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'PascalCase with Service suffix',
        severity: 'error',
        naming: {
          case: 'PascalCase',
          suffix: 'Service',
          extension: '.ts',
        },
        examples: ['PaymentService.ts', 'UserService.ts'],
      };
      const context = createContext('payment.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('PaymentService.ts');
    });

    it('should handle prefix in structured pattern', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'Interface naming',
        severity: 'error',
        naming: {
          case: 'PascalCase',
          prefix: 'I',
          extension: '.ts',
        },
      };
      const passContext = createContext('IPaymentService.ts');
      const failContext = createContext('PaymentService.ts');

      expect(validator.validate(constraint, passContext).passed).toBe(true);
      expect(validator.validate(constraint, failContext).passed).toBe(false);
    });

    it('should handle snake_case pattern', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'snake_case file',
        severity: 'error',
        naming: {
          case: 'snake_case',
          extension: '.py',
        },
      };
      const passContext = createContext('payment_service.py');
      const failContext = createContext('PaymentService.py');

      expect(validator.validate(constraint, passContext).passed).toBe(true);
      expect(validator.validate(constraint, failContext).passed).toBe(false);
    });

    it('should include pattern description in error message', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'kebab-case file',
        severity: 'error',
        naming: {
          case: 'kebab-case',
          extension: '.ts',
        },
      };
      const context = createContext('FooBar.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      // The error message should include the pattern description from describeNamingPattern
      expect(result.violations[0].message).toContain('naming pattern');
    });
  });

  // ---------------------------------------------------------------------------
  // Structured pattern validation
  // ---------------------------------------------------------------------------

  describe('structured pattern validation', () => {
    it('should fail with error for empty structured pattern', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'Invalid pattern',
        severity: 'error',
        naming: {},
      };
      const context = createContext('anything.ts');
      const result = validator.validate(constraint, context);
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('Invalid structured naming pattern');
    });
  });

  // ---------------------------------------------------------------------------
  // Fix hints
  // ---------------------------------------------------------------------------

  describe('fix hints', () => {
    it('should return regex-based fix hint for regex patterns', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '^[A-Z].*\\.ts$',
        severity: 'error',
      };
      const context = createContext('lowercase.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].fixHint).toContain('Rename the file to match the pattern');
    });

    it('should return descriptive fix hint for structured patterns', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'PascalCase Service',
        severity: 'error',
        naming: {
          case: 'PascalCase',
          suffix: 'Service',
          extension: '.ts',
        },
      };
      const context = createContext('bad.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].fixHint).toContain('Rename the file to match');
    });

    it('should include examples in fix hint when available for structured patterns', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'PascalCase Service',
        severity: 'error',
        naming: {
          case: 'PascalCase',
          suffix: 'Service',
          extension: '.ts',
        },
        examples: ['UserService.ts'],
      };
      const context = createContext('bad.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].fixHint).toContain('UserService.ts');
    });
  });

  // ---------------------------------------------------------------------------
  // Violation structure
  // ---------------------------------------------------------------------------

  describe('violation structure', () => {
    it('should include correct code, rule, and severity in violation', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: 'IMPOSSIBLE_PATTERN',
        severity: 'warning',
      };
      const context = createContext('file.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].rule).toBe('naming_pattern');
      expect(result.violations[0].severity).toBe('warning');
      expect(result.violations[0].code).toBeDefined();
    });

    it('should set line 1 and column 1 for naming violations', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '^NOPE$',
        severity: 'error',
      };
      const context = createContext('file.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].line).toBe(1);
      expect(result.violations[0].column).toBe(1);
    });

    it('should include source from context', () => {
      const constraint: Constraint = {
        rule: 'naming_pattern',
        value: '^NOPE$',
        severity: 'error',
      };
      const context = createContext('file.ts');
      const result = validator.validate(constraint, context);
      expect(result.violations[0].source).toBe('test.arch');
    });
  });
});
