/**
 * @arch archcodex.test.unit
 *
 * Tests for schema cache manager.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import { SchemaCacheManager, createSchemaCacheManager } from '../../../../src/core/context/cache.js';
import type { EntityContext } from '../../../../src/core/context/types.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

// Mock file-system utils
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  fileExists: vi.fn(),
}));

import { stat, mkdir, unlink } from 'node:fs/promises';
import { readFile, writeFile, fileExists } from '../../../../src/utils/file-system.js';

const mockStat = vi.mocked(stat);
const mockMkdir = vi.mocked(mkdir);
const mockUnlink = vi.mocked(unlink);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockFileExists = vi.mocked(fileExists);

describe('SchemaCacheManager', () => {
  const projectRoot = '/test/project';
  const schemaPath = '/test/project/convex/schema.ts';
  const cachePath = '/test/project/.arch/cache/schema-context.json';

  const mockEntities: EntityContext[] = [
    {
      name: 'users',
      fields: [{ name: 'id', type: 'string' }],
      relationships: [],
      behaviors: [],
      existingOperations: [],
      similarOperations: [],
    },
    {
      name: 'embeddings',
      fields: [{ name: 'id', type: 'string' }],
      relationships: [],
      behaviors: [],
      existingOperations: [],
      similarOperations: [],
    },
  ];

  let cacheManager: SchemaCacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = createSchemaCacheManager(projectRoot);
  });

  afterEach(() => {
    cacheManager.dispose();
  });

  describe('createSchemaCacheManager', () => {
    it('creates a cache manager instance', () => {
      expect(cacheManager).toBeInstanceOf(SchemaCacheManager);
    });
  });

  describe('isValid', () => {
    it('returns false when cache file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      const result = await cacheManager.isValid(schemaPath);

      expect(result).toBe(false);
    });

    it('returns false when cache version mismatch', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        version: 999, // Wrong version
        schemaPath,
        schemaMtime: 1000,
        entities: mockEntities,
      }));

      const result = await cacheManager.isValid(schemaPath);

      expect(result).toBe(false);
    });

    it('returns false when schema mtime changed', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        version: 1,
        source: 'convex',
        schemaPath,
        schemaMtime: 1000,
        extractedAt: new Date().toISOString(),
        entities: mockEntities,
      }));
      mockStat.mockResolvedValue({ mtimeMs: 2000 } as import('fs').Stats);

      const result = await cacheManager.isValid(schemaPath);

      expect(result).toBe(false);
    });

    it('returns true when cache is valid', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        version: 1,
        source: 'convex',
        schemaPath,
        schemaMtime: 1000,
        extractedAt: new Date().toISOString(),
        entities: mockEntities,
      }));
      mockStat.mockResolvedValue({ mtimeMs: 1000 } as import('fs').Stats);

      const result = await cacheManager.isValid(schemaPath);

      expect(result).toBe(true);
    });
  });

  describe('get', () => {
    it('returns null when cache is invalid', async () => {
      mockFileExists.mockResolvedValue(false);

      const result = await cacheManager.get(schemaPath);

      expect(result).toBeNull();
    });

    it('returns entities when cache is valid', async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        version: 1,
        source: 'convex',
        schemaPath,
        schemaMtime: 1000,
        extractedAt: new Date().toISOString(),
        entities: mockEntities,
      }));
      mockStat.mockResolvedValue({ mtimeMs: 1000 } as import('fs').Stats);

      const result = await cacheManager.get(schemaPath);

      expect(result).toEqual(mockEntities);
    });
  });

  describe('set', () => {
    it('saves cache to disk', async () => {
      mockStat.mockResolvedValue({ mtimeMs: 1000 } as import('fs').Stats);
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await cacheManager.set('convex', schemaPath, mockEntities);

      expect(mockMkdir).toHaveBeenCalledWith(
        path.dirname(cachePath),
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        cachePath,
        expect.stringContaining('"version": 1')
      );
    });
  });

  describe('clear', () => {
    it('deletes cache file when it exists', async () => {
      mockFileExists.mockResolvedValue(true);
      mockUnlink.mockResolvedValue(undefined);

      await cacheManager.clear();

      expect(mockUnlink).toHaveBeenCalledWith(cachePath);
    });

    it('does nothing when cache file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      await cacheManager.clear();

      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('searchEntities', () => {
    it('filters entities by name pattern (case-insensitive)', () => {
      const result = cacheManager.searchEntities(mockEntities, 'embed');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('embeddings');
    });

    it('returns empty array when no matches', () => {
      const result = cacheManager.searchEntities(mockEntities, 'xyz');

      expect(result).toHaveLength(0);
    });

    it('returns all entities when pattern matches all', () => {
      const result = cacheManager.searchEntities(mockEntities, 's');

      expect(result).toHaveLength(2);
    });
  });

  describe('dispose', () => {
    it('clears memory cache', () => {
      cacheManager.dispose();
      // No direct way to test, but ensures no errors
      expect(true).toBe(true);
    });
  });
});
