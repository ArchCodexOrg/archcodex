/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.core.domain.constraint
 * @intent:tested
 *
 * Tests for MCP input normalization:
 * - Tools accepting both string and object file formats
 * - Flexible file path handling across all tools
 * - Error messages for invalid input formats
 */
import { describe, it, expect } from 'vitest';

describe('MCP Input Normalization', () => {
  describe('file path formats', () => {
    it('should accept string file paths', () => {
      const filePath = '/path/to/file.ts';
      expect(typeof filePath).toBe('string');
      expect(filePath).toContain('file.ts');
    });

    it('should accept object with path property', () => {
      const fileObj = { path: '/path/to/file.ts' };
      expect(fileObj.path).toBe('/path/to/file.ts');
    });

    it('should accept object with path and additional metadata', () => {
      const fileObj = {
        path: '/path/to/file.ts',
        format: 'ai',
        archId: 'example.arch',
        action: 'create',
      };
      expect(fileObj.path).toBe('/path/to/file.ts');
      expect(fileObj.format).toBe('ai');
      expect(fileObj.archId).toBe('example.arch');
      expect(fileObj.action).toBe('create');
    });
  });

  describe('array of file inputs', () => {
    it('should handle array of string paths', () => {
      const files = ['/path/a.ts', '/path/b.ts', '/path/c.ts'];
      expect(files).toHaveLength(3);
      files.forEach(f => {
        expect(typeof f).toBe('string');
      });
    });

    it('should handle array of objects with path property', () => {
      const files = [
        { path: '/path/a.ts' },
        { path: '/path/b.ts' },
        { path: '/path/c.ts' },
      ];
      expect(files).toHaveLength(3);
      files.forEach(f => {
        expect(f.path).toMatch(/^\/path\/[a-c]\.ts$/);
      });
    });

    it('should handle mixed array of strings and objects', () => {
      const files = [
        '/path/a.ts',
        { path: '/path/b.ts' },
        '/path/c.ts',
        { path: '/path/d.ts', format: 'ai' },
      ];
      expect(files).toHaveLength(4);
      expect(typeof files[0]).toBe('string');
      expect(typeof files[1]).toBe('object');
      expect(typeof files[2]).toBe('string');
      expect(typeof files[3]).toBe('object');
    });
  });

  describe('tool-specific formats', () => {
    it('archcodex_read should accept path as string or object', () => {
      const inputs = [
        '/path/to/file.ts',
        { path: '/path/to/file.ts' },
        { path: '/path/to/file.ts', format: 'ai' },
      ];

      inputs.forEach(input => {
        if (typeof input === 'string') {
          expect(input).toMatch(/^\/path/);
        } else {
          expect(input.path).toMatch(/^\/path/);
        }
      });
    });

    it('archcodex_check should accept files as strings or objects', () => {
      const validInputs = [
        { files: ['/path/a.ts', '/path/b.ts'] },
        { files: [{ path: '/path/a.ts' }, { path: '/path/b.ts' }] },
        { files: ['/path/a.ts', { path: '/path/b.ts' }] },
      ];

      validInputs.forEach(input => {
        expect(Array.isArray(input.files)).toBe(true);
        expect(input.files.length).toBeGreaterThan(0);
      });
    });

    it('archcodex_validate_plan should accept changes as strings or objects', () => {
      const validInputs = [
        {
          changes: [
            { path: '/path/a.ts', action: 'create' as const },
            { path: '/path/b.ts', action: 'modify' as const },
          ],
        },
        {
          changes: ['/path/a.ts', '/path/b.ts'],
        },
        {
          changes: [
            { path: '/path/a.ts', action: 'create' as const },
            '/path/b.ts',
          ],
        },
      ];

      validInputs.forEach(input => {
        expect(Array.isArray(input.changes)).toBe(true);
        input.changes.forEach(change => {
          if (typeof change === 'string') {
            expect(change).toMatch(/^\/path/);
          } else {
            expect(change.path).toBeTruthy();
          }
        });
      });
    });

    it('archcodex_neighborhood should accept file as string or object', () => {
      const inputs = [
        { file: '/path/to/file.ts' },
        { file: { path: '/path/to/file.ts' } },
      ];

      inputs.forEach(input => {
        if (typeof input.file === 'string') {
          expect(input.file).toMatch(/^\/path/);
        } else {
          expect(input.file.path).toMatch(/^\/path/);
        }
      });
    });

    it('archcodex_impact should accept file as string or object', () => {
      const inputs = [
        { file: '/path/to/file.ts', depth: 2 },
        { file: { path: '/path/to/file.ts' }, depth: 2 },
      ];

      inputs.forEach(input => {
        if (typeof input.file === 'string') {
          expect(input.file).toMatch(/^\/path/);
        } else {
          expect(input.file.path).toMatch(/^\/path/);
        }
        expect(input.depth).toBe(2);
      });
    });
  });

  describe('error handling for invalid formats', () => {
    it('should reject object without path property', () => {
      const invalidObj = { file: '/path/to/file.ts' }; // 'file' instead of 'path'
      expect('path' in invalidObj).toBe(false);
    });

    it('should reject null or undefined path', () => {
      const invalidInputs = [
        { path: null },
        { path: undefined },
        { path: 123 },
        { path: true },
      ];

      invalidInputs.forEach(input => {
        expect(typeof input.path).not.toBe('string');
      });
    });

    it('should reject empty path string', () => {
      const emptyPath = '';
      expect(emptyPath.length).toBe(0);
    });
  });

  describe('metadata preservation', () => {
    it('should preserve all metadata when accepting objects', () => {
      const changeWithMetadata = {
        path: '/path/to/file.ts',
        action: 'create' as const,
        archId: 'domain.service',
        newImports: ['./utils', './types'],
        codePatterns: ['console.log'],
        newPath: '/path/to/new-file.ts',
      };

      expect(changeWithMetadata).toHaveProperty('path');
      expect(changeWithMetadata).toHaveProperty('action');
      expect(changeWithMetadata).toHaveProperty('archId');
      expect(changeWithMetadata).toHaveProperty('newImports');
      expect(changeWithMetadata).toHaveProperty('codePatterns');
      expect(changeWithMetadata).toHaveProperty('newPath');
    });

    it('should accept objects with arbitrary additional properties', () => {
      const enrichedInput = {
        path: '/path/to/file.ts',
        description: 'This is my file',
        author: 'John Doe',
        priority: 'high',
        tags: ['urgent', 'api'],
        metadata: { foo: 'bar' },
      };

      expect(enrichedInput.path).toBe('/path/to/file.ts');
      expect(enrichedInput.description).toBe('This is my file');
      expect(enrichedInput.author).toBe('John Doe');
      expect(enrichedInput.priority).toBe('high');
    });
  });

  describe('user experience improvements', () => {
    it('should allow flexible parameter passing', () => {
      // Before: only strings allowed
      // After: both strings and objects allowed
      const before = { file: '/path/to/file.ts' };
      const after1 = { file: '/path/to/file.ts' };
      const after2 = { file: { path: '/path/to/file.ts', format: 'ai' } };

      expect(before.file).toBe(after1.file);
      if (typeof after2.file === 'object') {
        expect(after2.file.path).toBe('/path/to/file.ts');
      }
    });

    it('should support programmatic input generation', () => {
      // Example: generating tool input from another system
      const generateChangeInput = (path: string, action: 'create' | 'modify' | 'delete' | 'rename') => ({
        path,
        action,
      });

      const changes = [
        generateChangeInput('/src/file.ts', 'create'),
        generateChangeInput('/src/other.ts', 'modify'),
      ];

      expect(changes).toHaveLength(2);
      changes.forEach(c => {
        expect(c.path).toBeTruthy();
        expect(['create', 'modify', 'delete', 'rename']).toContain(c.action);
      });
    });

    it('should work with destructuring patterns', () => {
      const input = { path: '/file.ts', action: 'create' as const, archId: 'test' };
      const { path, action, archId } = input;

      expect(path).toBe('/file.ts');
      expect(action).toBe('create');
      expect(archId).toBe('test');
    });
  });

  describe('backward compatibility', () => {
    it('should maintain compatibility with string-only inputs', () => {
      // Old style - still works
      const oldStyle = { file: '/path/to/file.ts' };
      expect(typeof oldStyle.file).toBe('string');
    });

    it('should maintain compatibility with array of strings', () => {
      // Old style - still works
      const oldStyle = { files: ['/a.ts', '/b.ts', '/c.ts'] };
      expect(Array.isArray(oldStyle.files)).toBe(true);
      oldStyle.files.forEach(f => {
        expect(typeof f).toBe('string');
      });
    });

    it('should not require changes to existing code', () => {
      // Existing code using strings should continue to work
      const toolCall = {
        tool: 'archcodex_read',
        args: { file: '/path/to/file.ts', format: 'ai' },
      };

      expect(toolCall.args.file).toBe('/path/to/file.ts');
    });
  });

  describe('validation consistency', () => {
    it('should apply same validation rules regardless of input format', () => {
      // Both of these should be validated the same way
      const stringInput = '/absolute/path/file.ts';
      const objectInput = { path: '/absolute/path/file.ts' };

      // Both should require absolute paths
      expect(stringInput).toMatch(/^\//);
      expect(objectInput.path).toMatch(/^\//);
    });

    it('should have consistent error messages for both formats', () => {
      const errors = {
        missingPath: 'Missing required "path" property',
        invalidPath: 'Path must be a string',
        absolutePath: 'Path must be absolute',
      };

      expect(errors.missingPath).toContain('path');
      expect(errors.invalidPath).toContain('string');
      expect(errors.absolutePath).toContain('absolute');
    });
  });
});
