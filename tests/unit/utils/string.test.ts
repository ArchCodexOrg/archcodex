/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for string utility functions.
 */
import { describe, it, expect } from 'vitest';
import { truncateString } from '../../../src/utils/string.js';

describe('truncateString', () => {
  describe('normal truncation', () => {
    it('should truncate long string and add ellipsis', () => {
      const result = truncateString('Hello, World!', 10);
      expect(result).toBe('Hello, ...');
      expect(result).toHaveLength(10);
    });

    it('should truncate at the correct position to maintain maxLen including ellipsis', () => {
      const result = truncateString('abcdefghij', 7);
      expect(result).toBe('abcd...');
      expect(result).toHaveLength(7);
    });

    it('should handle very long strings', () => {
      const longStr = 'a'.repeat(1000);
      const result = truncateString(longStr, 20);
      expect(result).toHaveLength(20);
      expect(result).toBe('a'.repeat(17) + '...');
    });
  });

  describe('string shorter than or equal to max', () => {
    it('should return original string when shorter than maxLen', () => {
      expect(truncateString('Hi', 10)).toBe('Hi');
    });

    it('should return original string when exactly maxLen', () => {
      expect(truncateString('Hello', 5)).toBe('Hello');
    });

    it('should return original single character when maxLen is larger', () => {
      expect(truncateString('x', 100)).toBe('x');
    });
  });

  describe('maxLen <= 3 (no room for ellipsis)', () => {
    it('should slice without ellipsis when maxLen is 3', () => {
      expect(truncateString('Hello', 3)).toBe('Hel');
    });

    it('should slice without ellipsis when maxLen is 2', () => {
      expect(truncateString('Hello', 2)).toBe('He');
    });

    it('should slice without ellipsis when maxLen is 1', () => {
      expect(truncateString('Hello', 1)).toBe('H');
    });

    it('should return empty string when maxLen is 0', () => {
      expect(truncateString('Hello', 0)).toBe('');
    });

    it('should return original string when it fits within maxLen <= 3', () => {
      expect(truncateString('ab', 3)).toBe('ab');
    });
  });

  describe('maxLen < 0', () => {
    it('should return empty string for negative maxLen', () => {
      expect(truncateString('Hello', -1)).toBe('');
    });

    it('should return empty string for very negative maxLen', () => {
      expect(truncateString('Hello', -100)).toBe('');
    });
  });

  describe('empty string', () => {
    it('should return empty string when input is empty', () => {
      expect(truncateString('', 10)).toBe('');
    });

    it('should return empty string when both input and maxLen are zero', () => {
      expect(truncateString('', 0)).toBe('');
    });

    it('should return empty string when input is empty and maxLen is negative', () => {
      expect(truncateString('', -5)).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle maxLen of 4 with ellipsis (just enough room for 1 char + ...)', () => {
      const result = truncateString('Hello', 4);
      expect(result).toBe('H...');
      expect(result).toHaveLength(4);
    });

    it('should handle string with spaces', () => {
      expect(truncateString('Hello World', 8)).toBe('Hello...');
    });

    it('should handle string with special characters', () => {
      expect(truncateString('foo@bar.com/path', 10)).toBe('foo@bar...');
    });
  });
});
