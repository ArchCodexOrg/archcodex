/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireDecoratorValidator } from '../../../../src/core/constraints/require-decorator.js';

describe('RequireDecoratorValidator', () => {
  const validator = new RequireDecoratorValidator();

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_decorator');
  });

  it('should have an error code', () => {
    expect(validator.errorCode).toBeDefined();
  });

  it('should have validate method', () => {
    expect(typeof validator.validate).toBe('function');
  });
});
