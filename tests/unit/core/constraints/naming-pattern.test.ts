/**
 * @arch archcodex.test.unit
 * @intent:cli-output
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
  });

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
  });

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
});
