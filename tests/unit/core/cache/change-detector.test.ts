/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for ChangeDetector.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../../../../src/core/cache/manager.js';
import { ChangeDetector } from '../../../../src/core/cache/change-detector.js';
import * as fs from '../../../../src/utils/file-system.js';

vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  fileExists: vi.fn(),
  ensureDir: vi.fn(),
}));

describe('ChangeDetector', () => {
  let cacheManager: CacheManager;
  let detector: ChangeDetector;

  beforeEach(async () => {
    vi.clearAllMocks();
    cacheManager = new CacheManager('/project', 'registry', 'config');
    vi.mocked(fs.fileExists).mockResolvedValue(false);
    await cacheManager.load();
    detector = new ChangeDetector('/project', cacheManager);
  });

  it('should detect new files', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('content');

    const result = await detector.detectChanges(['new-file.ts']);

    expect(result.newFiles).toContain('new-file.ts');
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('should detect changed files', async () => {
    cacheManager.set('file.ts', {
      checksum: 'old-checksum',
      cachedAt: new Date().toISOString(),
      archId: null,
      status: 'pass',
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    });

    vi.mocked(fs.readFile).mockResolvedValue('new content');

    const result = await detector.detectChanges(['file.ts']);

    expect(result.changed).toContain('file.ts');
  });

  it('should detect unchanged files', async () => {
    const content = 'unchanged content';
    const { computeChecksum } = await import('../../../../src/utils/checksum.js');
    const checksum = computeChecksum(content);

    cacheManager.set('file.ts', {
      checksum,
      cachedAt: new Date().toISOString(),
      archId: null,
      status: 'pass',
      violations: [],
      warnings: [],
      imports: [],
      overridesCount: 0,
    });

    vi.mocked(fs.readFile).mockResolvedValue(content);

    const result = await detector.detectChanges(['file.ts']);

    expect(result.unchanged).toContain('file.ts');
  });
});
