/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for SessionCache - session-scoped cache for file contents and parsed results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the file system dependency
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(async (path: string) => `content of ${path}`),
}));

import { SessionCache } from '../../../../src/core/cache/session-cache.js';
import type { CacheStats } from '../../../../src/core/cache/session-cache.js';
import { readFile } from '../../../../src/utils/file-system.js';

describe('SessionCache', () => {
  let cache: SessionCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new SessionCache();
  });

  describe('content cache', () => {
    it('should cache and retrieve content', async () => {
      cache.setContent('/path/to/file.ts', 'const x = 1;');
      expect(await cache.getContent('/path/to/file.ts')).toBe('const x = 1;');
    });

    it('should return false for uncached content via hasContent', () => {
      expect(cache.hasContent('/nonexistent')).toBe(false);
    });

    it('should return true for cached content via hasContent', () => {
      cache.setContent('/cached.ts', 'cached');
      expect(cache.hasContent('/cached.ts')).toBe(true);
    });

    it('should read from disk on first getContent call', async () => {
      const content = await cache.getContent('/some/file.ts');

      expect(readFile).toHaveBeenCalledWith('/some/file.ts');
      expect(content).toBe('content of /some/file.ts');
    });

    it('should not re-read from disk on subsequent getContent calls', async () => {
      await cache.getContent('/some/file.ts');
      await cache.getContent('/some/file.ts');
      await cache.getContent('/some/file.ts');

      expect(readFile).toHaveBeenCalledTimes(1);
    });

    it('should use setContent value instead of reading from disk', async () => {
      cache.setContent('/pre-set.ts', 'already loaded');
      const content = await cache.getContent('/pre-set.ts');

      expect(readFile).not.toHaveBeenCalled();
      expect(content).toBe('already loaded');
    });

    it('should overwrite existing content with setContent', async () => {
      cache.setContent('/file.ts', 'original');
      cache.setContent('/file.ts', 'updated');

      expect(await cache.getContent('/file.ts')).toBe('updated');
    });

    it('should cache empty string content', async () => {
      cache.setContent('/empty.ts', '');
      expect(cache.hasContent('/empty.ts')).toBe(true);
      expect(await cache.getContent('/empty.ts')).toBe('');
    });
  });

  describe('arch ID cache', () => {
    it('should cache arch IDs', () => {
      cache.setArchId('/path/to/file.ts', 'archcodex.core.domain');
      expect(cache.getArchId('/path/to/file.ts')).toBe('archcodex.core.domain');
    });

    it('should cache null arch IDs', () => {
      cache.setArchId('/path/to/file.ts', null);
      expect(cache.getArchId('/path/to/file.ts')).toBeNull();
    });

    it('should return undefined for uncached arch ID', () => {
      expect(cache.getArchId('/nonexistent')).toBeUndefined();
    });

    it('should report hasArchId correctly for cached entries', () => {
      cache.setArchId('/tagged.ts', 'some.arch');
      expect(cache.hasArchId('/tagged.ts')).toBe(true);
    });

    it('should report hasArchId correctly for null entries', () => {
      cache.setArchId('/untagged.ts', null);
      expect(cache.hasArchId('/untagged.ts')).toBe(true);
    });

    it('should report hasArchId false for uncached files', () => {
      expect(cache.hasArchId('/uncached.ts')).toBe(false);
    });

    it('should overwrite arch ID on re-set', () => {
      cache.setArchId('/file.ts', 'old.arch');
      cache.setArchId('/file.ts', 'new.arch');
      expect(cache.getArchId('/file.ts')).toBe('new.arch');
    });
  });

  describe('semantic model cache', () => {
    const mockModel = {
      filePath: '/test.ts',
      language: 'typescript' as const,
      imports: [],
      exports: [],
      declarations: [],
      topLevelStatements: [],
    };

    it('should cache and retrieve semantic models', () => {
      cache.setSemanticModel('/test.ts', mockModel);
      expect(cache.getSemanticModel('/test.ts')).toBe(mockModel);
    });

    it('should return undefined for uncached semantic model', () => {
      expect(cache.getSemanticModel('/nonexistent.ts')).toBeUndefined();
    });

    it('should report hasSemanticModel correctly', () => {
      expect(cache.hasSemanticModel('/test.ts')).toBe(false);
      cache.setSemanticModel('/test.ts', mockModel);
      expect(cache.hasSemanticModel('/test.ts')).toBe(true);
    });

    it('should overwrite semantic model on re-set', () => {
      const updatedModel = { ...mockModel, filePath: '/updated.ts' };
      cache.setSemanticModel('/test.ts', mockModel);
      cache.setSemanticModel('/test.ts', updatedModel);
      expect(cache.getSemanticModel('/test.ts')).toBe(updatedModel);
    });
  });

  describe('module resolution cache', () => {
    it('should cache resolved module paths', () => {
      cache.setModuleResolution('/from.ts:./utils', '/resolved/utils.ts');
      expect(cache.getModuleResolution('/from.ts:./utils')).toBe('/resolved/utils.ts');
    });

    it('should cache null for unresolved modules', () => {
      cache.setModuleResolution('/from.ts:./missing', null);
      expect(cache.getModuleResolution('/from.ts:./missing')).toBeNull();
    });

    it('should return undefined for uncached module resolution', () => {
      expect(cache.getModuleResolution('/unknown:./module')).toBeUndefined();
    });

    it('should report hasModuleResolution correctly', () => {
      expect(cache.hasModuleResolution('/key')).toBe(false);
      cache.setModuleResolution('/key', '/resolved');
      expect(cache.hasModuleResolution('/key')).toBe(true);
    });

    it('should report hasModuleResolution true for null-cached entries', () => {
      cache.setModuleResolution('/key', null);
      expect(cache.hasModuleResolution('/key')).toBe(true);
    });
  });

  describe('architecture resolution cache', () => {
    it('should cache and retrieve architecture resolutions', () => {
      const resolution = { name: 'core', constraints: [] };
      cache.setArchResolution('archcodex.core', resolution);
      expect(cache.getArchResolution('archcodex.core')).toBe(resolution);
    });

    it('should return undefined for uncached architecture resolution', () => {
      expect(cache.getArchResolution('nonexistent')).toBeUndefined();
    });

    it('should report hasArchResolution correctly', () => {
      expect(cache.hasArchResolution('archcodex.core')).toBe(false);
      cache.setArchResolution('archcodex.core', { resolved: true });
      expect(cache.hasArchResolution('archcodex.core')).toBe(true);
    });

    it('should support typed retrieval via generic', () => {
      interface ArchResult { architecture: string; hints: string[] }
      const value: ArchResult = { architecture: 'core', hints: ['hint1'] };
      cache.setArchResolution('typed.arch', value);

      const retrieved = cache.getArchResolution<ArchResult>('typed.arch');
      expect(retrieved?.architecture).toBe('core');
      expect(retrieved?.hints).toEqual(['hint1']);
    });
  });

  describe('getStats', () => {
    it('should return stats', () => {
      cache.setContent('/a.ts', 'a');
      cache.setContent('/b.ts', 'b');
      cache.setArchId('/a.ts', 'arch.a');
      const stats = cache.getStats();
      expect(stats.contentEntries).toBe(2);
      expect(stats.archIdEntries).toBe(1);
    });

    it('should return all zeros for empty cache', () => {
      const stats = cache.getStats();
      expect(stats.contentEntries).toBe(0);
      expect(stats.archIdEntries).toBe(0);
      expect(stats.semanticModelEntries).toBe(0);
      expect(stats.moduleResolutionEntries).toBe(0);
      expect(stats.archResolutionEntries).toBe(0);
    });

    it('should count all cache types correctly', () => {
      cache.setContent('/file.ts', 'content');
      cache.setArchId('/file.ts', 'arch.id');
      cache.setSemanticModel('/file.ts', {
        filePath: '/file.ts',
        language: 'typescript' as const,
        imports: [],
        exports: [],
        declarations: [],
        topLevelStatements: [],
      });
      cache.setModuleResolution('key1', '/resolved.ts');
      cache.setModuleResolution('key2', null);
      cache.setArchResolution('arch1', {});
      cache.setArchResolution('arch2', {});
      cache.setArchResolution('arch3', {});

      const stats: CacheStats = cache.getStats();
      expect(stats.contentEntries).toBe(1);
      expect(stats.archIdEntries).toBe(1);
      expect(stats.semanticModelEntries).toBe(1);
      expect(stats.moduleResolutionEntries).toBe(2);
      expect(stats.archResolutionEntries).toBe(3);
    });
  });

  describe('clear', () => {
    it('should clear all caches', () => {
      cache.setContent('/path/to/file.ts', 'content');
      cache.setArchId('/path/to/file.ts', 'arch.id');
      cache.clear();
      expect(cache.hasContent('/path/to/file.ts')).toBe(false);
      expect(cache.getArchId('/path/to/file.ts')).toBeUndefined();
    });

    it('should clear all five cache types', () => {
      cache.setContent('/f.ts', 'c');
      cache.setArchId('/f.ts', 'a');
      cache.setSemanticModel('/f.ts', {
        filePath: '/f.ts',
        language: 'typescript' as const,
        imports: [],
        exports: [],
        declarations: [],
        topLevelStatements: [],
      });
      cache.setModuleResolution('key', '/path');
      cache.setArchResolution('arch', {});

      cache.clear();

      const stats = cache.getStats();
      expect(stats.contentEntries).toBe(0);
      expect(stats.archIdEntries).toBe(0);
      expect(stats.semanticModelEntries).toBe(0);
      expect(stats.moduleResolutionEntries).toBe(0);
      expect(stats.archResolutionEntries).toBe(0);
    });

    it('should allow re-population after clear', () => {
      cache.setContent('/file.ts', 'first');
      cache.clear();
      cache.setContent('/file.ts', 'second');
      expect(cache.hasContent('/file.ts')).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clear all caches via dispose alias', () => {
      cache.setContent('/f.ts', 'content');
      cache.setArchId('/f.ts', 'arch');
      cache.setModuleResolution('k', '/v');

      cache.dispose();

      expect(cache.hasContent('/f.ts')).toBe(false);
      expect(cache.hasArchId('/f.ts')).toBe(false);
      expect(cache.hasModuleResolution('k')).toBe(false);
    });

    it('should be safe to call dispose multiple times', () => {
      cache.setContent('/f.ts', 'content');
      cache.dispose();
      cache.dispose();

      expect(cache.getStats().contentEntries).toBe(0);
    });
  });

  describe('cache isolation', () => {
    it('should keep separate caches for different file paths', () => {
      cache.setContent('/a.ts', 'content-a');
      cache.setContent('/b.ts', 'content-b');
      cache.setArchId('/a.ts', 'arch.a');
      cache.setArchId('/b.ts', 'arch.b');

      expect(cache.hasContent('/a.ts')).toBe(true);
      expect(cache.hasContent('/b.ts')).toBe(true);
      expect(cache.getArchId('/a.ts')).toBe('arch.a');
      expect(cache.getArchId('/b.ts')).toBe('arch.b');
    });

    it('should not cross-contaminate between cache types', () => {
      const path = '/same/key.ts';
      cache.setContent(path, 'content');

      expect(cache.hasContent(path)).toBe(true);
      expect(cache.hasArchId(path)).toBe(false);
      expect(cache.hasSemanticModel(path)).toBe(false);
    });
  });
});
