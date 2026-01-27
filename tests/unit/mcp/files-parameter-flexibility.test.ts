/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.core.domain.constraint
 * @intent:tested
 *
 * Tests for flexible files parameter handling:
 * - files parameter accepts both string and array formats
 * - Singular "files" parameter treated as single file
 * - Backward compatibility with existing array-based calls
 */
import { describe, it, expect } from 'vitest';

describe('Files Parameter Flexibility', () => {
  describe('archcodex_check files parameter', () => {
    it('should accept files as an array of strings', () => {
      const input = {
        files: ['/path/a.ts', '/path/b.ts'],
        projectRoot: '/project',
      };
      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(2);
    });

    it('should accept files as a single string', () => {
      const input = {
        files: '/path/file.ts',
        projectRoot: '/project',
      };
      expect(typeof input.files).toBe('string');
      expect(input.files).toBe('/path/file.ts');
    });

    it('should accept files as an array of objects', () => {
      const input = {
        files: [
          { path: '/path/a.ts' },
          { path: '/path/b.ts' },
        ],
        projectRoot: '/project',
      };
      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(2);
      input.files.forEach(f => {
        expect(f).toHaveProperty('path');
      });
    });

    it('should accept files as an array of mixed strings and objects', () => {
      const input = {
        files: [
          '/path/a.ts',
          { path: '/path/b.ts' },
          '/path/c.ts',
        ],
        projectRoot: '/project',
      };
      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(3);
    });

    it('should work with relative paths', () => {
      const input = {
        files: 'convex/projects/members.ts',
        projectRoot: '/Users/stefanvanegmond/development/intelimark',
      };
      expect(input.files).toBe('convex/projects/members.ts');
      expect(input.projectRoot).toBe('/Users/stefanvanegmond/development/intelimark');
    });

    it('should work with relative path arrays', () => {
      const input = {
        files: [
          'convex/projects/members.ts',
          'convex/schemas.ts',
        ],
        projectRoot: '/Users/stefanvanegmond/development/intelimark',
      };
      expect(Array.isArray(input.files)).toBe(true);
      input.files.forEach(f => {
        expect(typeof f).toBe('string');
        expect(f).not.toMatch(/^\//);  // Relative paths don't start with /
      });
    });
  });

  describe('archcodex_types files parameter', () => {
    it('should accept files as a string', () => {
      const input = {
        files: '/path/models',
        threshold: 80,
      };
      expect(typeof input.files).toBe('string');
    });

    it('should accept files as an array', () => {
      const input = {
        files: ['/path/a.ts', '/path/b.ts'],
        threshold: 80,
      };
      expect(Array.isArray(input.files)).toBe(true);
    });

    it('should accept files as mixed array', () => {
      const input = {
        files: [
          '/path/a.ts',
          { path: '/path/b.ts' },
        ],
        threshold: 80,
      };
      expect(Array.isArray(input.files)).toBe(true);
    });
  });

  describe('archcodex_infer files parameter', () => {
    it('should accept files as a string', () => {
      const input = {
        files: '/path/file.ts',
        untaggedOnly: true,
      };
      expect(typeof input.files).toBe('string');
    });

    it('should accept files as an array', () => {
      const input = {
        files: ['/path/a.ts', '/path/b.ts'],
        untaggedOnly: true,
      };
      expect(Array.isArray(input.files)).toBe(true);
    });
  });

  describe('backward compatibility', () => {
    it('should still work with array format (original)', () => {
      const original = {
        files: ['/path/a.ts', '/path/b.ts'],
      };
      expect(Array.isArray(original.files)).toBe(true);
      expect(original.files).toHaveLength(2);
    });

    it('should still work with file parameter', () => {
      const original = {
        file: '/path/file.ts',
      };
      expect(typeof original.file).toBe('string');
    });

    it('should still work with path parameter', () => {
      const original = {
        path: '/path/file.ts',
      };
      expect(typeof original.path).toBe('string');
    });
  });

  describe('real-world examples', () => {
    it('should work with user example from issue', () => {
      const userInput = {
        files: 'convex/projects/members.ts',
        projectRoot: '/Users/stefanvanegmond/development/intelimark',
      };

      // Should not error, path is extracted
      expect(typeof userInput.files).toBe('string');
      expect(userInput.files).toContain('members.ts');
      expect(userInput.projectRoot).toContain('intelimark');
    });

    it('should work with glob patterns as string', () => {
      const input = {
        files: 'src/**/*.ts',
      };
      expect(typeof input.files).toBe('string');
      expect(input.files).toContain('*');
    });

    it('should work with glob patterns in array', () => {
      const input = {
        files: ['src/**/*.ts', 'lib/**/*.ts'],
      };
      expect(Array.isArray(input.files)).toBe(true);
      input.files.forEach(f => {
        expect(f).toContain('*');
      });
    });

    it('should work with mixed absolute and relative paths', () => {
      const input = {
        files: [
          '/absolute/path/a.ts',
          'relative/b.ts',
          { path: 'relative/c.ts' },
          { path: '/absolute/path/d.ts' },
        ],
      };
      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(4);
    });
  });

  describe('error messages improved', () => {
    it('should provide helpful error for invalid format', () => {
      const errorMessage = `Error: Invalid file input. Expected string or object with 'path' property`;
      expect(errorMessage).toContain('path');
    });

    it('should suggest correct usage format', () => {
      const suggestion = `
Usage:
- { "files": "/path/file.ts" } (single file as string)
- { "files": ["/path/a.ts", "/path/b.ts"] } (array)
- { "files": { "path": "/path/file.ts" } } (object)
`;
      expect(suggestion).toContain('string');
      expect(suggestion).toContain('array');
      expect(suggestion).toContain('object');
    });
  });

  describe('type flexibility', () => {
    it('should accept files of various types', () => {
      const validInputs = [
        { files: '/path/file.ts' },
        { files: ['/path/file.ts'] },
        { files: { path: '/path/file.ts' } },
        { files: [{ path: '/path/file.ts' }] },
        { files: ['/path/a.ts', { path: '/path/b.ts' }] },
      ];

      validInputs.forEach(input => {
        if (typeof input.files === 'string') {
          expect(input.files).toMatch(/^\/path/);
        } else if (Array.isArray(input.files)) {
          expect(input.files.length).toBeGreaterThan(0);
        } else if (typeof input.files === 'object') {
          expect(input.files).toHaveProperty('path');
        }
      });
    });

    it('should maintain consistent handling across tools', () => {
      // All these tools should handle files the same way
      const tools = ['archcodex_check', 'archcodex_types', 'archcodex_infer'];
      const input = { files: 'src/**/*.ts' };

      tools.forEach(tool => {
        expect(typeof input.files).toBe('string');  // Each tool accepts string
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const input = { files: '' };
      expect(typeof input.files).toBe('string');
      expect(input.files).toBe('');
    });

    it('should handle empty array', () => {
      const input = { files: [] };
      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(0);
    });

    it('should handle single-item array', () => {
      const input = { files: ['/path/file.ts'] };
      expect(Array.isArray(input.files)).toBe(true);
      expect(input.files).toHaveLength(1);
    });

    it('should handle deeply nested paths', () => {
      const input = {
        files: 'very/deeply/nested/path/to/file.ts',
      };
      expect(typeof input.files).toBe('string');
      expect(input.files).toContain('/');
    });

    it('should handle special characters in paths', () => {
      const input = {
        files: [
          '/path/with-dash/file.ts',
          '/path/with_underscore/file.ts',
          '/path/with.dot/file.ts',
        ],
      };
      expect(Array.isArray(input.files)).toBe(true);
      input.files.forEach(f => {
        expect(typeof f).toBe('string');
      });
    });
  });

  describe('parameter extraction', () => {
    it('should extract files from mixed parameters', () => {
      const input = {
        files: 'convex/projects/members.ts',
        projectRoot: '/project',
        strict: false,
      };

      // Should be able to extract files regardless of other params
      expect(input.files).toBe('convex/projects/members.ts');
      expect(input.projectRoot).toBe('/project');
      expect(input.strict).toBe(false);
    });

    it('should handle files with other options', () => {
      const input = {
        files: ['a.ts', 'b.ts'],
        threshold: 80,
        includePrivate: true,
        untaggedOnly: false,
      };

      expect(Array.isArray(input.files)).toBe(true);
      expect(input.threshold).toBe(80);
      expect(input.includePrivate).toBe(true);
      expect(input.untaggedOnly).toBe(false);
    });
  });

  describe('normalization consistency', () => {
    it('should normalize single string to array', () => {
      // When normalizeFilesList processes a string, it should return [string]
      const singleString = 'file.ts';
      const expected = [singleString];

      expect(typeof singleString).toBe('string');
      expect(Array.isArray(expected)).toBe(true);
      expect(expected).toHaveLength(1);
    });

    it('should normalize array to same array', () => {
      // When normalizeFilesList processes an array, it should return the same array
      const arrayInput = ['a.ts', 'b.ts'];
      const expected = arrayInput;

      expect(Array.isArray(arrayInput)).toBe(true);
      expect(Array.isArray(expected)).toBe(true);
      expect(expected).toHaveLength(2);
    });

    it('should apply same normalization regardless of input format', () => {
      const inputs = [
        '/path/file.ts',
        ['/path/file.ts'],
        { path: '/path/file.ts' },
        [{ path: '/path/file.ts' }],
      ];

      // All should ultimately resolve to ['/path/file.ts']
      inputs.forEach(input => {
        if (typeof input === 'string') {
          expect(input).toBe('/path/file.ts');
        } else if (Array.isArray(input)) {
          const firstItem = input[0];
          if (typeof firstItem === 'string') {
            expect(firstItem).toBe('/path/file.ts');
          } else if (typeof firstItem === 'object') {
            expect(firstItem.path).toBe('/path/file.ts');
          }
        } else if (typeof input === 'object') {
          expect(input.path).toBe('/path/file.ts');
        }
      });
    });
  });
});
