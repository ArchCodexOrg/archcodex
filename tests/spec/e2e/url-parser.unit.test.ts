/**
 * @arch archcodex.test
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { parseUrl } from './url-parser';

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('parseUrl', () => {
  describe('success cases', () => {
    it('simple URL', () => {
      // Arrange
      const url = "https://example.com/path";

      // Act
      const result = parseUrl({ url });

      // Assert
      expect(result.protocol).toBe('https');
      expect(result.host).toBe('example.com');
      expect(result.path).toBe('/path');
    });

    it('URL with query', () => {
      // Arrange
      const url = "https://api.test.com/search?q=hello&limit=10";

      // Act
      const result = parseUrl({ url });

      // Assert
      expect(result.host).toContain("api");
      expect(result.query).toEqual(expect.objectContaining({"q":"hello"}));
    });

    it('URL with port', () => {
      // Arrange
      const url = "http://localhost:3000/api";

      // Act
      const result = parseUrl({ url });

      // Assert
      expect(result.protocol).toBe('http');
      expect(result.host).toContain("localhost");
    });

  });

  describe('error cases', () => {
    it('empty URL', () => {
      // Arrange
      const url = "";

      // Act
      const result = parseUrl({ url });

      // Assert
      expect(result.error).toBe('EMPTY_URL');
    });

    it('invalid URL', () => {
      // Arrange
      const url = "not-a-url";

      // Act
      const result = parseUrl({ url });

      // Assert
      expect(result.error).toBe('INVALID_FORMAT');
    });

  });

});
// @speccodex:end
