/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for CacheManager.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../../../../src/core/cache/manager.js';
import * as fs from '../../../../src/utils/file-system.js';

vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  fileExists: vi.fn(),
  ensureDir: vi.fn(),
}));

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new CacheManager('/project', 'registry-content', 'config-content');
  });

  it('should create empty cache when file does not exist', async () => {
    vi.mocked(fs.fileExists).mockResolvedValue(false);
    await manager.load();
    expect(manager.hasCache()).toBe(false);
  });

  it('should invalidate cache on checksum mismatch', () => {
    expect(manager.isValid('file.ts', 'different-checksum')).toBe(false);
  });

  it('should return null for non-existent file', () => {
    expect(manager.get('nonexistent.ts')).toBeNull();
  });

  it('should store and retrieve cached results', async () => {
    vi.mocked(fs.fileExists).mockResolvedValue(false);
    await manager.load();

    const result = {
      checksum: 'abc123',
      cachedAt: new Date().toISOString(),
      archId: 'arch.test',
      status: 'pass' as const,
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    };

    manager.set('file.ts', result);
    expect(manager.get('file.ts')).toEqual(result);
  });

  it('should track cache stats', async () => {
    vi.mocked(fs.fileExists).mockResolvedValue(false);
    await manager.load();

    manager.isValid('file1.ts', 'checksum1');

    manager.set('file2.ts', {
      checksum: 'checksum2',
      cachedAt: new Date().toISOString(),
      archId: null,
      status: 'pass',
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    });
    manager.isValid('file2.ts', 'checksum2');

    const stats = manager.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
  });

  it('should prune deleted files', async () => {
    vi.mocked(fs.fileExists).mockResolvedValue(false);
    await manager.load();

    manager.set('existing.ts', {
      checksum: 'abc',
      cachedAt: new Date().toISOString(),
      archId: null,
      status: 'pass',
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    });
    manager.set('deleted.ts', {
      checksum: 'def',
      cachedAt: new Date().toISOString(),
      archId: null,
      status: 'pass',
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    });

    const pruned = manager.prune(new Set(['existing.ts']));
    expect(pruned).toBe(1);
    expect(manager.get('deleted.ts')).toBeNull();
    expect(manager.get('existing.ts')).not.toBeNull();
  });
});
