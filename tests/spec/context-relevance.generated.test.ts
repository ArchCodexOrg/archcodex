/**
 * @arch archcodex.test
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { scoreFileRelevance } from '../../src/core/context/synthesizer.js';

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('scoreFileRelevance', () => {
  describe('success cases', () => {
    it('direct match - operation in filename', () => {
      // Arrange
      const file = { path: "src/entries/mutations/createEntry.ts", refType: "operation", lineNumber: null };
      const operation = "createEntry";

      // Act
      const result = scoreFileRelevance(file, operation);

      // Assert
      expect(result).toBe('direct');
    });

    it('direct match - kebab-case filename', () => {
      // Arrange
      const file = { path: "src/entries/mutations/create-entry.ts", refType: "operation", lineNumber: null };
      const operation = "createEntry";

      // Act
      const result = scoreFileRelevance(file, operation);

      // Assert
      expect(result).toBe('direct');
    });

    it('related - same entity CRUD in same dir', () => {
      // Arrange
      const file = { path: "src/entries/mutations/updateEntry.ts", refType: "operation", lineNumber: null };
      const operation = "createEntry";

      // Act
      const result = scoreFileRelevance(file, operation);

      // Assert
      expect(result).toBe('related');
    });

    it('peripheral - type definition', () => {
      // Arrange
      const file = { path: "src/entries/types.ts", refType: "type", lineNumber: null };
      const operation = "createEntry";

      // Act
      const result = scoreFileRelevance(file, operation);

      // Assert
      expect(result).toBe('peripheral');
    });

    it('peripheral - test file', () => {
      // Arrange
      const file = { path: "tests/unit/entries/createEntry.test.ts", refType: "test", lineNumber: null };
      const operation = "createEntry";

      // Act
      const result = scoreFileRelevance(file, operation);

      // Assert
      expect(result).toBe('peripheral');
    });

    it('peripheral - barrel export', () => {
      // Arrange
      const file = { path: "src/entries/index.ts", refType: "barrel", lineNumber: null };
      const operation = "createEntry";

      // Act
      const result = scoreFileRelevance(file, operation);

      // Assert
      expect(result).toBe('peripheral');
    });

    it('no operation hint - defaults to peripheral', () => {
      // Arrange
      const file = { path: "src/entries/types.ts", refType: "type", lineNumber: null };

      // Act
      const result = scoreFileRelevance(file);

      // Assert
      expect(result).toBe('peripheral');
    });

  });

});
// @speccodex:end