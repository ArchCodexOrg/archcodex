/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  compileNamingPattern,
  validateNamingPattern,
  describeNamingPattern,
} from '../../../../src/core/constraints/pattern-compiler.js';

describe('compileNamingPattern', () => {
  describe('case patterns', () => {
    it('should compile PascalCase pattern', () => {
      const pattern = compileNamingPattern({ case: 'PascalCase' });
      expect(pattern).toBe('^[A-Z][a-zA-Z0-9]*$');

      const regex = new RegExp(pattern);
      expect(regex.test('PaymentService')).toBe(true);
      expect(regex.test('paymentService')).toBe(false);
      expect(regex.test('payment_service')).toBe(false);
    });

    it('should compile camelCase pattern', () => {
      const pattern = compileNamingPattern({ case: 'camelCase' });
      expect(pattern).toBe('^[a-z][a-zA-Z0-9]*$');

      const regex = new RegExp(pattern);
      expect(regex.test('paymentService')).toBe(true);
      expect(regex.test('PaymentService')).toBe(false);
    });

    it('should compile snake_case pattern', () => {
      const pattern = compileNamingPattern({ case: 'snake_case' });
      expect(pattern).toBe('^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$');

      const regex = new RegExp(pattern);
      expect(regex.test('payment_service')).toBe(true);
      expect(regex.test('payment_service_handler')).toBe(true);
      expect(regex.test('PaymentService')).toBe(false);
    });

    it('should compile UPPER_CASE pattern', () => {
      const pattern = compileNamingPattern({ case: 'UPPER_CASE' });
      expect(pattern).toBe('^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$');

      const regex = new RegExp(pattern);
      expect(regex.test('PAYMENT_SERVICE')).toBe(true);
      expect(regex.test('API_KEY')).toBe(true);
      expect(regex.test('paymentService')).toBe(false);
    });

    it('should compile kebab-case pattern', () => {
      const pattern = compileNamingPattern({ case: 'kebab-case' });
      expect(pattern).toBe('^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$');

      const regex = new RegExp(pattern);
      expect(regex.test('payment-service')).toBe(true);
      expect(regex.test('payment-service-handler')).toBe(true);
      expect(regex.test('PaymentService')).toBe(false);
    });

    it('should default to PascalCase when no case specified', () => {
      const pattern = compileNamingPattern({ suffix: 'Service' });
      const regex = new RegExp(pattern);
      expect(regex.test('PaymentService')).toBe(true);
      expect(regex.test('paymentService')).toBe(false);
    });
  });

  describe('with suffix', () => {
    it('should compile pattern with suffix', () => {
      const pattern = compileNamingPattern({
        case: 'PascalCase',
        suffix: 'Service',
      });
      expect(pattern).toBe('^[A-Z][a-zA-Z0-9]*Service$');

      const regex = new RegExp(pattern);
      expect(regex.test('PaymentService')).toBe(true);
      expect(regex.test('UserService')).toBe(true);
      expect(regex.test('Payment')).toBe(false);
      expect(regex.test('PaymentController')).toBe(false);
    });

    it('should escape special characters in suffix', () => {
      const pattern = compileNamingPattern({
        case: 'PascalCase',
        suffix: '.test',
      });
      expect(pattern).toBe('^[A-Z][a-zA-Z0-9]*\\.test$');

      const regex = new RegExp(pattern);
      expect(regex.test('Payment.test')).toBe(true);
      expect(regex.test('Paymenttest')).toBe(false);
    });
  });

  describe('with prefix', () => {
    it('should compile pattern with prefix', () => {
      const pattern = compileNamingPattern({
        case: 'PascalCase',
        prefix: 'I',
      });
      expect(pattern).toBe('^I[A-Z][a-zA-Z0-9]*$');

      const regex = new RegExp(pattern);
      expect(regex.test('IPaymentService')).toBe(true);
      expect(regex.test('PaymentService')).toBe(false);
    });
  });

  describe('with extension', () => {
    it('should compile pattern with extension', () => {
      const pattern = compileNamingPattern({
        case: 'PascalCase',
        suffix: 'Service',
        extension: '.ts',
      });
      expect(pattern).toBe('^[A-Z][a-zA-Z0-9]*Service\\.ts$');

      const regex = new RegExp(pattern);
      expect(regex.test('PaymentService.ts')).toBe(true);
      expect(regex.test('PaymentService.js')).toBe(false);
      expect(regex.test('PaymentService')).toBe(false);
    });

    it('should handle .tsx extension', () => {
      const pattern = compileNamingPattern({
        case: 'PascalCase',
        extension: '.tsx',
      });

      const regex = new RegExp(pattern);
      expect(regex.test('PaymentForm.tsx')).toBe(true);
      expect(regex.test('PaymentForm.ts')).toBe(false);
    });
  });

  describe('combined patterns', () => {
    it('should compile full pattern with all options', () => {
      const pattern = compileNamingPattern({
        case: 'PascalCase',
        prefix: 'I',
        suffix: 'Repository',
        extension: '.ts',
      });
      expect(pattern).toBe('^I[A-Z][a-zA-Z0-9]*Repository\\.ts$');

      const regex = new RegExp(pattern);
      expect(regex.test('IUserRepository.ts')).toBe(true);
      expect(regex.test('UserRepository.ts')).toBe(false);
      expect(regex.test('IUserRepository.js')).toBe(false);
    });
  });
});

describe('validateNamingPattern', () => {
  it('should return null for valid patterns', () => {
    expect(validateNamingPattern({ case: 'PascalCase' })).toBeNull();
    expect(validateNamingPattern({ suffix: 'Service' })).toBeNull();
    expect(validateNamingPattern({ prefix: 'I', extension: '.ts' })).toBeNull();
  });

  it('should return error for empty pattern', () => {
    const error = validateNamingPattern({});
    expect(error).toBe(
      'Naming pattern must specify at least one of: case, prefix, suffix, extension'
    );
  });
});

describe('describeNamingPattern', () => {
  it('should describe pattern with case only', () => {
    expect(describeNamingPattern({ case: 'PascalCase' })).toBe('PascalCase');
  });

  it('should describe pattern with suffix', () => {
    expect(
      describeNamingPattern({ case: 'PascalCase', suffix: 'Service' })
    ).toBe('PascalCase, suffix "Service"');
  });

  it('should describe pattern with prefix', () => {
    expect(describeNamingPattern({ case: 'PascalCase', prefix: 'I' })).toBe(
      'prefix "I", PascalCase'
    );
  });

  it('should describe pattern with extension', () => {
    expect(describeNamingPattern({ extension: '.ts' })).toBe('extension ".ts"');
  });

  it('should describe full pattern', () => {
    expect(
      describeNamingPattern({
        case: 'PascalCase',
        prefix: 'I',
        suffix: 'Repository',
        extension: '.ts',
      })
    ).toBe('prefix "I", PascalCase, suffix "Repository", extension ".ts"');
  });
});
