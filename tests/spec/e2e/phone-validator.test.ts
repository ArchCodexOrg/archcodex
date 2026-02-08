/**
 * @arch archcodex.test
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { validatePhone } from './phone-validator';

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('validatePhone', () => {
  describe('success cases', () => {
    it('valid US phone', () => {
      // Arrange
      const phone = "(555) 123-4567";

      // Act
      const result = validatePhone(phone);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.normalized).toHaveLength(10);
    });

    it('valid with country code', () => {
      // Arrange
      const phone = "+1-555-123-4567";

      // Act
      const result = validatePhone(phone);

      // Assert
      expect(result.valid).toBe(true);
    });

    it('valid international', () => {
      // Arrange
      const phone = "+44 20 7946 0958";
      const options = { country: "UK" };

      // Act
      const result = validatePhone(phone, options);

      // Assert
      expect(result.valid).toBe(true);
    });

  });

  describe('error cases', () => {
    it('too short', () => {
      // Arrange
      const phone = "123";

      // Act
      const result = validatePhone(phone);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOO_SHORT');
    });

    it('invalid characters', () => {
      // Arrange
      const phone = "555-abc-1234";

      // Act
      const result = validatePhone(phone);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_CHARS');
    });

    it('empty string', () => {
      // Arrange
      const phone = "";

      // Act
      const result = validatePhone(phone);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EMPTY_INPUT');
    });

  });

});
// @speccodex:end
