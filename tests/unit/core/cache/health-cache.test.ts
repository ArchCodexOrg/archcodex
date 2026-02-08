/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCacheManager } from '../../../../src/core/cache/health-cache.js';
import type { HealthCacheEntry } from '../../../../src/core/cache/health-cache.js';

// Mock file system
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HealthCacheManager', () => {
  it('creates cache manager instance', () => {
    const manager = new HealthCacheManager('/project');
    expect(manager).toBeDefined();
  });

  it('computes checksum for file content', () => {
    const manager = new HealthCacheManager('/project');
    const checksum1 = manager.computeChecksum('content');
    const checksum2 = manager.computeChecksum('content');

    expect(checksum1).toBe(checksum2);
    expect(checksum1).toHaveLength(16); // First 16 chars of SHA-256
  });

  it('detects stale cache when content changes', () => {
    const manager = new HealthCacheManager('/project');

    const checksum1 = manager.computeChecksum('original content');
    const checksum2 = manager.computeChecksum('modified content');

    expect(checksum1).not.toBe(checksum2);
  });

  it('creates cache entry from file metadata', () => {
    const manager = new HealthCacheManager('/project');

    const metadata = {
      path: 'src/file.ts',
      absolutePath: '/project/src/file.ts',
      content: 'code',
      archId: 'archcodex.core.engine',
      hasOverrides: false,
      overrides: [],
      intents: [],
    };

    const entry = manager.createEntry('code', metadata);

    expect(entry).toBeDefined();
    expect(entry.checksum).toHaveLength(16);
    expect(entry.metadata.path).toBe('src/file.ts');
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('detects stale entries correctly', () => {
    const manager = new HealthCacheManager('/project');

    const metadata = {
      path: 'src/file.ts',
      absolutePath: '/project/src/file.ts',
      content: 'original',
      archId: 'archcodex.core.engine',
      hasOverrides: false,
      overrides: [],
      intents: [],
    };

    const cachedEntry = manager.createEntry('original', metadata);

    // Same content - not stale
    expect(manager.isStale('original', cachedEntry)).toBe(false);

    // Different content - is stale
    expect(manager.isStale('modified', cachedEntry)).toBe(true);
  });

  it('cache entry stores file metadata', () => {
    const manager = new HealthCacheManager('/project');

    const metadata = {
      path: 'src/service.ts',
      absolutePath: '/project/src/service.ts',
      content: 'code',
      archId: 'archcodex.core.engine',
      hasOverrides: true,
      overrides: [
        {
          rule: 'forbid_import',
          value: 'axios',
          reason: 'Use ApiClient instead',
          line: 10,
        },
      ],
      intents: ['admin-only'],
    };

    const entry = manager.createEntry('code', metadata);

    expect(entry.metadata.archId).toBe('archcodex.core.engine');
    expect(entry.metadata.hasOverrides).toBe(true);
    expect(entry.metadata.intents).toContain('admin-only');
  });

  it('does not cache semantic model in entries', () => {
    const manager = new HealthCacheManager('/project');

    const metadata = {
      path: 'src/file.ts',
      absolutePath: '/project/src/file.ts',
      content: 'code',
      archId: null,
      hasOverrides: false,
      overrides: [],
      intents: [],
      semanticModel: { functions: [] } as any, // Mock semantic model
    };

    const entry = manager.createEntry('code', metadata);

    // Semantic model should NOT be cached (it's reference-dependent)
    expect(entry.metadata.semanticModel).toBeUndefined();
  });
});
