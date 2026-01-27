/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { RequireTestFileValidator } from '../../../../src/core/constraints/require-test-file.js';

describe('RequireTestFileValidator', () => {
  const validator = new RequireTestFileValidator();

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_test_file');
  });

  it('should have an error code', () => {
    expect(validator.errorCode).toBeDefined();
  });

  it('should have validate method', () => {
    expect(typeof validator.validate).toBe('function');
  });
});
