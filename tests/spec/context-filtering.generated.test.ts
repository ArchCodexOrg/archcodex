/**
 * @arch archcodex.test
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { filterFileReferences } from '../../src/core/context/synthesizer.js';

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('filterFileReferences', () => {
  describe('success cases', () => {
    it('keeps all files when under limit', () => {
      // Arrange
      const fileGroups = [{ archId: "test", files: [{ path: "a.ts", refType: "operation", lineNumber: null }, { path: "b.ts", refType: "operation", lineNumber: null }] }];
      const maxFiles = 10;

      // Act
      const result = filterFileReferences(fileGroups, maxFiles);

      // Assert
      expect(result.truncated).toBe(0);
    });

    it('truncates peripheral when over limit', () => {
      // Arrange
      const fileGroups = [{ archId: "test", files: [{ path: "createEntry.ts", refType: "operation", lineNumber: null }, { path: "updateEntry.ts", refType: "operation", lineNumber: null }, { path: "types.ts", refType: "type", lineNumber: null }, { path: "index.ts", refType: "barrel", lineNumber: null }] }];
      const maxFiles = 3;
      const operation = "createEntry";

      // Act
      const result = filterFileReferences(fileGroups, maxFiles, operation);

      // Assert
      expect(result.truncated).toBeGreaterThan(0);
    });

    it('keeps direct and related even when over limit', () => {
      // Arrange
      const fileGroups = [{ archId: "test", files: [{ path: "createEntry.ts", refType: "operation", lineNumber: null }, { path: "deleteEntry.ts", refType: "operation", lineNumber: null }, { path: "types.ts", refType: "type", lineNumber: null }] }];
      const maxFiles = 2;
      const operation = "createEntry";

      // Act
      const result = filterFileReferences(fileGroups, maxFiles, operation);

      // Assert
      expect(result.truncated).toBe(1);
    });

  });

});
// @speccodex:end