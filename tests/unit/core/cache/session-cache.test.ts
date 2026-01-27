/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for SessionCache.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionCache } from '../../../../src/core/cache/session-cache.js';

describe('SessionCache', () => {
  let cache: SessionCache;

  beforeEach(() => {
    cache = new SessionCache();
  });

  it('should cache and retrieve content', async () => {
    cache.setContent('/path/to/file.ts', 'const x = 1;');
    expect(await cache.getContent('/path/to/file.ts')).toBe('const x = 1;');
  });

  it('should return false for uncached content via hasContent', () => {
    expect(cache.hasContent('/nonexistent')).toBe(false);
  });

  it('should cache arch IDs', () => {
    cache.setArchId('/path/to/file.ts', 'archcodex.core.domain');
    expect(cache.getArchId('/path/to/file.ts')).toBe('archcodex.core.domain');
  });

  it('should cache null arch IDs', () => {
    cache.setArchId('/path/to/file.ts', null);
    expect(cache.getArchId('/path/to/file.ts')).toBeNull();
  });

  it('should clear all caches', () => {
    cache.setContent('/path/to/file.ts', 'content');
    cache.setArchId('/path/to/file.ts', 'arch.id');
    cache.clear();
    expect(cache.hasContent('/path/to/file.ts')).toBe(false);
    expect(cache.getArchId('/path/to/file.ts')).toBeUndefined();
  });

  it('should return stats', () => {
    cache.setContent('/a.ts', 'a');
    cache.setContent('/b.ts', 'b');
    cache.setArchId('/a.ts', 'arch.a');
    const stats = cache.getStats();
    expect(stats.contentEntries).toBe(2);
    expect(stats.archIdEntries).toBe(1);
  });
});
