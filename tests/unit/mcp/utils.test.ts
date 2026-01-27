/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP utility functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDefaultProjectRoot,
  cacheProjectRoot,
  findProjectRoot,
  resolveProjectRootFromFile,
  resolveProjectRootFromFiles,
  isProjectInitialized,
  findNearbyProject,
  normalizeFilePath,
  normalizeFilePaths,
  normalizeFilesList,
  normalizeStringList,
} from '../../../src/mcp/utils.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

import { access } from 'fs/promises';

describe('MCP Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDefaultProjectRoot', () => {
    const originalArgv = process.argv;
    const originalEnv = process.env;

    afterEach(() => {
      process.argv = originalArgv;
      process.env = originalEnv;
    });

    it('should return cwd when no --project arg or env var', () => {
      process.argv = ['node', 'script.js'];
      delete process.env.ARCHCODEX_PROJECT_ROOT;

      const result = getDefaultProjectRoot();

      expect(result).toBe(process.cwd());
    });

    it('should return --project arg when specified', () => {
      process.argv = ['node', 'script.js', '--project', '/custom/path'];
      delete process.env.ARCHCODEX_PROJECT_ROOT;

      const result = getDefaultProjectRoot();

      expect(result).toContain('custom');
    });

    it('should return env var when set', () => {
      process.argv = ['node', 'script.js'];
      process.env.ARCHCODEX_PROJECT_ROOT = '/env/path';

      const result = getDefaultProjectRoot();

      expect(result).toContain('env');
    });
  });

  describe('cacheProjectRoot', () => {
    it('should cache project root for file path', () => {
      cacheProjectRoot('/test/file.ts', '/test');
      // Cache is internal, but subsequent findProjectRoot should use it
    });

    it('should handle LRU eviction (no error)', () => {
      // Add many entries to trigger eviction
      for (let i = 0; i < 1100; i++) {
        cacheProjectRoot(`/test/file${i}.ts`, '/test');
      }
      // Should not throw
    });
  });

  describe('findProjectRoot', () => {
    it('should return cached root when available', async () => {
      // Prime the cache
      cacheProjectRoot('/cached/path/file.ts', '/cached');

      const result = await findProjectRoot('/cached/path/file.ts', '/default');

      expect(result).toBe('/cached');
    });

    it('should return directory containing .arch/', async () => {
      vi.mocked(access)
        .mockRejectedValueOnce(new Error('Not found')) // /test/src
        .mockResolvedValueOnce(undefined); // /test has .arch

      const result = await findProjectRoot('/test/src/file.ts', '/default');

      expect(result).toBe('/test');
    });

    it('should return null when no .arch/ found', async () => {
      vi.mocked(access).mockRejectedValue(new Error('Not found'));

      const result = await findProjectRoot('/no/arch/file.ts', '/default');

      expect(result).toBeNull();
    });
  });

  describe('resolveProjectRootFromFile', () => {
    it('should return explicit root when provided', async () => {
      const result = await resolveProjectRootFromFile('/default', '/some/file.ts', '/explicit');

      expect(result).toContain('explicit');
    });

    it('should find root from file path', async () => {
      vi.mocked(access).mockResolvedValueOnce(undefined);

      const result = await resolveProjectRootFromFile('/default', '/project/src/file.ts');

      expect(result).toBeDefined();
    });

    it('should return default when no .arch/ found', async () => {
      vi.mocked(access).mockRejectedValue(new Error('Not found'));

      const result = await resolveProjectRootFromFile('/default', '/no/arch/file.ts');

      expect(result).toBe('/default');
    });
  });

  describe('resolveProjectRootFromFiles', () => {
    it('should return explicit root when provided', async () => {
      const result = await resolveProjectRootFromFiles('/default', ['/a.ts', '/b.ts'], '/explicit');

      expect(result).toContain('explicit');
    });

    it('should find root from first valid file', async () => {
      vi.mocked(access)
        .mockRejectedValueOnce(new Error('Not found')) // First file
        .mockResolvedValueOnce(undefined); // Second file's directory

      const result = await resolveProjectRootFromFiles('/default', ['/no/arch/a.ts', '/project/b.ts']);

      expect(result).toBeDefined();
    });

    it('should return default when no files have .arch/', async () => {
      vi.mocked(access).mockRejectedValue(new Error('Not found'));

      const result = await resolveProjectRootFromFiles('/default', ['/a.ts', '/b.ts']);

      expect(result).toBe('/default');
    });
  });

  describe('isProjectInitialized', () => {
    it('should return true when .arch/ exists', async () => {
      vi.mocked(access).mockResolvedValueOnce(undefined);

      const result = await isProjectInitialized('/project');

      expect(result).toBe(true);
    });

    it('should return false when .arch/ does not exist', async () => {
      vi.mocked(access).mockRejectedValueOnce(new Error('Not found'));

      const result = await isProjectInitialized('/no-arch');

      expect(result).toBe(false);
    });
  });

  describe('findNearbyProject', () => {
    it('should find project with .arch/ by walking up directories', async () => {
      vi.mocked(access)
        .mockRejectedValueOnce(new Error('Not found')) // /a/b/c
        .mockRejectedValueOnce(new Error('Not found')) // /a/b
        .mockResolvedValueOnce(undefined); // /a has .arch

      const result = await findNearbyProject('/a/b/c');

      expect(result).toBe('/a');
    });

    it('should return null when no project found', async () => {
      vi.mocked(access).mockRejectedValue(new Error('Not found'));

      const result = await findNearbyProject('/no/project/here');

      expect(result).toBeNull();
    });
  });
});

describe('Input Normalization', () => {
  describe('normalizeFilePath', () => {
    it('should return string as-is', () => {
      const result = normalizeFilePath('/path/to/file.ts');

      expect(result).toBe('/path/to/file.ts');
    });

    it('should extract path from object', () => {
      const result = normalizeFilePath({ path: '/path/to/file.ts', format: 'ai' });

      expect(result).toBe('/path/to/file.ts');
    });

    it('should throw for object without path property', () => {
      expect(() => normalizeFilePath({ format: 'ai' })).toThrow('Invalid file input');
    });

    it('should throw for object with non-string path', () => {
      expect(() => normalizeFilePath({ path: 123 })).toThrow('Invalid file input');
    });

    it('should throw for null', () => {
      expect(() => normalizeFilePath(null as unknown as string)).toThrow();
    });
  });

  describe('normalizeFilePaths', () => {
    it('should return empty array for undefined', () => {
      const result = normalizeFilePaths(undefined);

      expect(result).toEqual([]);
    });

    it('should return empty array for non-array', () => {
      const result = normalizeFilePaths('not-an-array' as unknown as string[]);

      expect(result).toEqual([]);
    });

    it('should normalize array of strings', () => {
      const result = normalizeFilePaths(['/a.ts', '/b.ts']);

      expect(result).toEqual(['/a.ts', '/b.ts']);
    });

    it('should normalize array of objects', () => {
      const result = normalizeFilePaths([{ path: '/a.ts' }, { path: '/b.ts' }]);

      expect(result).toEqual(['/a.ts', '/b.ts']);
    });

    it('should normalize mixed array', () => {
      const result = normalizeFilePaths(['/a.ts', { path: '/b.ts' }]);

      expect(result).toEqual(['/a.ts', '/b.ts']);
    });

    it('should throw for invalid item in array', () => {
      expect(() => normalizeFilePaths(['/a.ts', { invalid: true }])).toThrow('Invalid file in array');
    });
  });

  describe('normalizeFilesList', () => {
    it('should return empty array for undefined', () => {
      const result = normalizeFilesList(undefined);

      expect(result).toEqual([]);
    });

    it('should normalize single string to array', () => {
      const result = normalizeFilesList('/single.ts');

      expect(result).toEqual(['/single.ts']);
    });

    it('should normalize single object to array', () => {
      const result = normalizeFilesList({ path: '/single.ts' });

      expect(result).toEqual(['/single.ts']);
    });

    it('should normalize array of files', () => {
      const result = normalizeFilesList(['/a.ts', '/b.ts']);

      expect(result).toEqual(['/a.ts', '/b.ts']);
    });

    it('should throw for invalid single input', () => {
      expect(() => normalizeFilesList({ invalid: true })).toThrow('Invalid file list');
    });
  });

  describe('normalizeStringList', () => {
    it('should return empty array for undefined', () => {
      const result = normalizeStringList(undefined);

      expect(result).toEqual([]);
    });

    it('should normalize single string to array', () => {
      const result = normalizeStringList('src/**');

      expect(result).toEqual(['src/**']);
    });

    it('should return array as-is', () => {
      const result = normalizeStringList(['src/**', 'lib/**']);

      expect(result).toEqual(['src/**', 'lib/**']);
    });
  });
});
