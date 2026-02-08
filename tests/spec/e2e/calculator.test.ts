/**
 * @arch archcodex.test
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { add } from './calculator';

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('add', () => {
  describe('success cases', () => {
    it('positive numbers', () => {
      // Arrange
      const a = 5;
      const b = 3;

      // Act
      const result = add({ a, b });

      // Assert
      expect(result).toBe(8);
    });

    it('negative numbers', () => {
      // Arrange
      const a = -5;
      const b = -3;

      // Act
      const result = add({ a, b });

      // Assert
      expect(result).toBe(-8);
    });

    it('mixed signs', () => {
      // Arrange
      const a = 10;
      const b = -4;

      // Act
      const result = add({ a, b });

      // Assert
      expect(result).toBe(6);
    });

  });

  describe('error cases', () => {
    it('non-numeric input', () => {
      // Arrange
      const a = "five";
      const b = 3;

      // Act
      const result = add({ a, b });

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_INPUT');
    });

  });

  describe('boundary cases', () => {
    it('large numbers', () => {
      // Arrange - boundary condition
      const a = 999999999;
      const b = 1;

      // Act
      const result = add({ a, b });

      // Assert
      expect(result).toBe(1000000000);
    });

  });
});
// @speccodex:end