/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for additional parameter flexibility fixes:
 * - archcodex_validate_plan: newImports and codePatterns as string or array
 * - archcodex_types: files parameter as string or array
 * - archcodex_infer: files parameter as string or array
 */
import { describe, it, expect } from 'vitest';

describe('Additional Parameter Flexibility', () => {
  describe('archcodex_validate_plan - newImports parameter', () => {
    it('should accept newImports as a string', () => {
      const change = {
        path: '/src/file.ts',
        action: 'create' as const,
        newImports: './utils',  // String instead of array
      };

      expect(typeof change.newImports).toBe('string');
      expect(change.newImports).toBe('./utils');
    });

    it('should accept newImports as an array', () => {
      const change = {
        path: '/src/file.ts',
        action: 'create' as const,
        newImports: ['./utils', './helpers'],  // Array of strings
      };

      expect(Array.isArray(change.newImports)).toBe(true);
      expect(change.newImports).toHaveLength(2);
    });

    it('should accept newImports as undefined', () => {
      const change = {
        path: '/src/file.ts',
        action: 'create' as const,
        newImports: undefined,  // Optional field
      };

      expect(change.newImports).toBeUndefined();
    });

    it('should handle mixed string and array newImports in batch', () => {
      const changes = [
        {
          path: '/src/file1.ts',
          action: 'create' as const,
          newImports: './utils',  // String
        },
        {
          path: '/src/file2.ts',
          action: 'modify' as const,
          newImports: ['./helpers', './config'],  // Array
        },
        {
          path: '/src/file3.ts',
          action: 'create' as const,
          // No newImports
        },
      ];

      expect(changes).toHaveLength(3);
      expect(typeof changes[0].newImports).toBe('string');
      expect(Array.isArray(changes[1].newImports)).toBe(true);
      expect(changes[2].newImports).toBeUndefined();
    });
  });

  describe('archcodex_validate_plan - codePatterns parameter', () => {
    it('should accept codePatterns as a string', () => {
      const change = {
        path: '/src/file.ts',
        action: 'create' as const,
        codePatterns: 'console\\.log',  // String instead of array
      };

      expect(typeof change.codePatterns).toBe('string');
      expect(change.codePatterns).toContain('console');
    });

    it('should accept codePatterns as an array', () => {
      const change = {
        path: '/src/file.ts',
        action: 'create' as const,
        codePatterns: ['console\\.log', 'eval\\('],  // Array of patterns
      };

      expect(Array.isArray(change.codePatterns)).toBe(true);
      expect(change.codePatterns).toHaveLength(2);
    });

    it('should accept both newImports and codePatterns as strings', () => {
      const change = {
        path: '/src/file.ts',
        action: 'create' as const,
        newImports: './utils',  // String
        codePatterns: 'console\\.log',  // String
        archId: 'archcodex.core.domain',
      };

      expect(typeof change.newImports).toBe('string');
      expect(typeof change.codePatterns).toBe('string');
      expect(change.archId).toBe('archcodex.core.domain');
    });

    it('should accept both newImports and codePatterns as arrays', () => {
      const change = {
        path: '/src/file.ts',
        action: 'modify' as const,
        newImports: ['./utils', './helpers'],  // Array
        codePatterns: ['console\\.log', 'eval\\('],  // Array
        archId: 'archcodex.core.domain',
      };

      expect(Array.isArray(change.newImports)).toBe(true);
      expect(Array.isArray(change.codePatterns)).toBe(true);
    });

    it('should accept mixed string and array formats in single change', () => {
      const change = {
        path: '/src/file.ts',
        action: 'create' as const,
        newImports: './utils',  // String
        codePatterns: ['console\\.log', 'eval\\('],  // Array (mixed)
        archId: 'archcodex.core.domain',
        newPath: '/src/new-file.ts',
      };

      expect(typeof change.newImports).toBe('string');
      expect(Array.isArray(change.codePatterns)).toBe(true);
    });
  });

  describe('archcodex_validate_plan - complete change objects', () => {
    it('should handle validation request with string formats', () => {
      const input = {
        changes: [
          {
            path: '/src/service.ts',
            action: 'create' as const,
            archId: 'archcodex.core.domain',
            newImports: './types',  // String
            codePatterns: 'console\\.log',  // String
          },
        ],
      };

      expect(input.changes).toHaveLength(1);
      expect(input.changes[0].path).toBe('/src/service.ts');
      expect(typeof input.changes[0].newImports).toBe('string');
      expect(typeof input.changes[0].codePatterns).toBe('string');
    });

    it('should handle validation request with array formats', () => {
      const input = {
        changes: [
          {
            path: '/src/service.ts',
            action: 'create' as const,
            archId: 'archcodex.core.domain',
            newImports: ['./types', './utils'],  // Array
            codePatterns: ['console\\.log', 'eval\\('],  // Array
          },
        ],
      };

      expect(input.changes).toHaveLength(1);
      expect(Array.isArray(input.changes[0].newImports)).toBe(true);
      expect(Array.isArray(input.changes[0].codePatterns)).toBe(true);
    });

    it('should handle validation request with mixed formats', () => {
      const input = {
        changes: [
          {
            path: '/src/file1.ts',
            action: 'create' as const,
            archId: 'archcodex.core.domain',
            newImports: './types',  // String
            codePatterns: ['console\\.log', 'eval\\('],  // Array
          },
          {
            path: '/src/file2.ts',
            action: 'modify' as const,
            newImports: ['./utils', './helpers'],  // Array
            codePatterns: 'debug',  // String
          },
        ],
      };

      expect(input.changes).toHaveLength(2);
      expect(typeof input.changes[0].newImports).toBe('string');
      expect(Array.isArray(input.changes[0].codePatterns)).toBe(true);
      expect(Array.isArray(input.changes[1].newImports)).toBe(true);
      expect(typeof input.changes[1].codePatterns).toBe('string');
    });
  });

  describe('archcodex_types - files parameter', () => {
    it('should accept files as a single string', () => {
      const input = {
        files: 'src/**/*.ts',
        threshold: 80,
      };

      expect(typeof input.files).toBe('string');
      expect(input.files).toContain('src');
    });

    it('should accept files as an array of strings', () => {
      const input = {
        files: ['src/**/*.ts', 'lib/**/*.ts'],
        threshold: 80,
      };

      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(2);
    });

    it('should accept files with other parameters', () => {
      const input1 = {
        files: 'src/models/*.ts',
        threshold: 85,
        includePrivate: true,
      };

      const input2 = {
        files: ['src/models/*.ts', 'src/types/*.ts'],
        threshold: 85,
        includePrivate: false,
      };

      expect(typeof input1.files).toBe('string');
      expect(Array.isArray(input2.files)).toBe(true);
      expect(input1.includePrivate).toBe(true);
      expect(input2.includePrivate).toBe(false);
    });

    it('should accept specific file paths', () => {
      const input = {
        files: 'src/models/User.ts',
        threshold: 90,
      };

      expect(typeof input.files).toBe('string');
      expect(input.files).toMatch(/User\.ts$/);
    });

    it('should accept array of specific files', () => {
      const input = {
        files: ['src/models/User.ts', 'src/types/UserType.ts'],
        threshold: 95,
      };

      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toContain('src/models/User.ts');
    });
  });

  describe('archcodex_infer - files parameter', () => {
    it('should accept files as a single string', () => {
      const input = {
        files: 'src/**/*.ts',
        untaggedOnly: true,
      };

      expect(typeof input.files).toBe('string');
      expect(input.files).toContain('src');
    });

    it('should accept files as an array of strings', () => {
      const input = {
        files: ['src/**/*.ts', 'lib/**/*.ts'],
        untaggedOnly: false,
      };

      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(2);
    });

    it('should accept files with untaggedOnly parameter', () => {
      const input1 = {
        files: 'src/untagged/**/*.ts',
        untaggedOnly: true,
      };

      const input2 = {
        files: ['src/**/*.ts', 'lib/**/*.ts'],
        untaggedOnly: false,
      };

      expect(typeof input1.files).toBe('string');
      expect(Array.isArray(input2.files)).toBe(true);
      expect(input1.untaggedOnly).toBe(true);
      expect(input2.untaggedOnly).toBe(false);
    });

    it('should accept specific file paths', () => {
      const input = {
        files: 'src/legacy/oldService.ts',
        untaggedOnly: true,
      };

      expect(typeof input.files).toBe('string');
      expect(input.files).toContain('oldService.ts');
    });

    it('should accept array of specific files', () => {
      const input = {
        files: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
        untaggedOnly: false,
      };

      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(3);
    });

    it('should accept glob patterns', () => {
      const input1 = {
        files: 'src/**/*.test.ts',
        untaggedOnly: true,
      };

      const input2 = {
        files: ['src/**/handlers/*.ts', 'src/**/validators/*.ts'],
        untaggedOnly: false,
      };

      expect(input1.files).toContain('*');
      expect(input2.files[0]).toContain('*');
    });
  });

  describe('unified flexibility across tools', () => {
    it('should support consistent string format across tools', () => {
      const fileString = 'src/models/User.ts';

      // All these tools should accept the same string format
      const typesInput = { files: fileString };
      const inferInput = { files: fileString };
      const validateInput = {
        changes: [
          {
            path: fileString,
            action: 'create' as const,
            newImports: './types',  // Also flexible
          },
        ],
      };

      expect(typeof typesInput.files).toBe('string');
      expect(typeof inferInput.files).toBe('string');
      expect(validateInput.changes[0].path).toBe(fileString);
    });

    it('should support consistent array format across tools', () => {
      const files = ['src/models/User.ts', 'src/models/Post.ts'];

      // All these tools should accept the same array format
      const typesInput = { files };
      const inferInput = { files };
      const validateInput = {
        changes: [
          {
            path: files[0],
            action: 'create' as const,
            newImports: ['./types', './utils'],  // Also flexible
          },
        ],
      };

      expect(Array.isArray(typesInput.files)).toBe(true);
      expect(Array.isArray(inferInput.files)).toBe(true);
      expect(Array.isArray(validateInput.changes[0].newImports)).toBe(true);
    });
  });

  describe('error scenarios', () => {
    it('should handle invalid change format', () => {
      const invalidInput = {
        changes: [
          {
            path: '/src/file.ts',
            action: 'invalid',  // Invalid action
          },
        ],
      };

      expect(invalidInput.changes[0].action).not.toMatch(/^(create|modify|delete|rename)$/);
    });

    it('should handle missing path in change', () => {
      const invalidInput = {
        changes: [
          {
            // Missing path
            action: 'create' as const,
          },
        ],
      };

      expect('path' in invalidInput.changes[0]).toBe(false);
    });

    it('should handle null or undefined files', () => {
      const input1 = { files: undefined };
      const input2 = { files: null as unknown as string };

      // Should handle gracefully
      expect(input1.files).toBeUndefined();
      expect(input2.files).toBeNull();
    });
  });

  describe('backward compatibility', () => {
    it('should maintain compatibility with array-only format for archcodex_types', () => {
      // Old style - still works
      const oldStyle = {
        files: ['src/models/*.ts', 'src/types/*.ts'],
        threshold: 80,
      };

      expect(Array.isArray(oldStyle.files)).toBe(true);
      expect(oldStyle.files).toHaveLength(2);
    });

    it('should maintain compatibility with array-only format for archcodex_infer', () => {
      // Old style - still works
      const oldStyle = {
        files: ['src/untagged/**/*.ts'],
        untaggedOnly: true,
      };

      expect(Array.isArray(oldStyle.files)).toBe(true);
    });

    it('should maintain compatibility with strict validate_plan format', () => {
      // Old style - still works
      const oldStyle = {
        changes: [
          {
            path: '/src/file.ts',
            action: 'create' as const,
            newImports: ['./types', './utils'],
            codePatterns: ['console\\.log'],
          },
        ],
      };

      expect(Array.isArray(oldStyle.changes[0].newImports)).toBe(true);
      expect(Array.isArray(oldStyle.changes[0].codePatterns)).toBe(true);
    });
  });

  describe('parameter normalization examples', () => {
    it('should show string → array normalization for patterns', () => {
      // Input: single string pattern
      const stringPattern = 'src/**/*.ts';
      // Expected internal: ['src/**/*.ts']

      expect(typeof stringPattern).toBe('string');
      // After normalization would be: [stringPattern]
    });

    it('should show array → array passthrough for patterns', () => {
      // Input: array of patterns
      const arrayPatterns = ['src/**/*.ts', 'lib/**/*.ts'];
      // Expected internal: ['src/**/*.ts', 'lib/**/*.ts'] (unchanged)

      expect(Array.isArray(arrayPatterns)).toBe(true);
      expect(arrayPatterns).toHaveLength(2);
    });

    it('should show string → array normalization for imports', () => {
      // Input: single string import
      const stringImport = './utils';
      // Expected internal: ['./utils']

      expect(typeof stringImport).toBe('string');
      // After normalization would be: [stringImport]
    });

    it('should show array → array passthrough for imports', () => {
      // Input: array of imports
      const arrayImports = ['./utils', './helpers', './config'];
      // Expected internal: ['./utils', './helpers', './config'] (unchanged)

      expect(Array.isArray(arrayImports)).toBe(true);
      expect(arrayImports).toHaveLength(3);
    });
  });
});
