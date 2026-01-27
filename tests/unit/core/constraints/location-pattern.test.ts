/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { LocationPatternValidator } from '../../../../src/core/constraints/location-pattern.js';

describe('LocationPatternValidator', () => {
  const validator = new LocationPatternValidator();

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('location_pattern');
  });

  it('should have an error code', () => {
    expect(validator.errorCode).toBeDefined();
  });

  it('should have validate method', () => {
    expect(typeof validator.validate).toBe('function');
  });
});
