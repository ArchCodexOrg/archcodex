/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.core.domain.constraint
 * @intent:tested
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentAnalyzer } from '../../../../src/core/health/intent-analyzer.js';
import type { ScanResult } from '../../../../src/core/health/scanner.js';
import type { UnifiedHealthScanner } from '../../../../src/core/health/scanner.js';

// Mock dependencies
vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadIntentRegistry: vi.fn(),
  listIntentNames: vi.fn(),
}));

import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { loadIntentRegistry, listIntentNames } from '../../../../src/core/registry/loader.js';

const mockLoadArchIgnore = vi.mocked(loadArchIgnore);
const mockLoadIntentRegistry = vi.mocked(loadIntentRegistry);
const mockListIntentNames = vi.mocked(listIntentNames);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IntentAnalyzer', () => {
  it('analyzes intent health from scan result', async () => {
    const analyzer = new IntentAnalyzer('/project');

    // Mock archignore to return all files
    mockLoadArchIgnore.mockResolvedValue({ filter: (files: string[]) => files });

    // Mock intent registry
    mockLoadIntentRegistry.mockResolvedValue({
      intents: {
        'admin-only': { conflicts_with: [] },
        'public-endpoint': { conflicts_with: [] },
      },
    } as any);
    mockListIntentNames.mockReturnValue(['admin-only', 'public-endpoint']);

    const scanner = { parseSemanticModel: vi.fn() } as any as UnifiedHealthScanner;

    const scanResult: ScanResult = {
      files: new Map([
        [
          'src/admin.ts',
          {
            path: 'src/admin.ts',
            absolutePath: '/project/src/admin.ts',
            content: '// @intent:admin-only',
            archId: 'archcodex.core.engine',
            hasOverrides: false,
            overrides: [],
            intents: ['admin-only'],
          },
        ],
        [
          'src/api.ts',
          {
            path: 'src/api.ts',
            absolutePath: '/project/src/api.ts',
            content: '// @intent:public-endpoint',
            archId: 'archcodex.core.engine',
            hasOverrides: false,
            overrides: [],
            intents: ['public-endpoint'],
          },
        ],
        [
          'src/util.ts',
          {
            path: 'src/util.ts',
            absolutePath: '/project/src/util.ts',
            content: 'code',
            archId: 'archcodex.util',
            hasOverrides: false,
            overrides: [],
            intents: [],
          },
        ],
      ]),
      stats: { totalFiles: 3, scanTimeMs: 100, cacheHits: 0, cacheMisses: 3 },
    };

    const result = await analyzer.analyze(scanResult, scanner);

    expect(result.totalFiles).toBe(3);
    expect(result.filesWithIntents).toBe(2);
    expect(result.totalIntents).toBe(2);
    expect(result.fileLevelIntents).toBe(2);
    expect(result.functionLevelIntents).toBe(0);
    expect(result.uniqueIntents).toBe(2);
    expect(result.undefinedIntents).toEqual([]);
    expect(result.unusedIntents).toEqual([]);
  });

  it('detects undefined intents', async () => {
    const analyzer = new IntentAnalyzer('/project');

    mockLoadArchIgnore.mockResolvedValue({ filter: (files: string[]) => files });
    mockLoadIntentRegistry.mockResolvedValue({
      intents: {},
    } as any);
    mockListIntentNames.mockReturnValue([]);

    const scanner = { parseSemanticModel: vi.fn() } as any as UnifiedHealthScanner;

    const scanResult: ScanResult = {
      files: new Map([
        [
          'src/file.ts',
          {
            path: 'src/file.ts',
            absolutePath: '/project/src/file.ts',
            content: 'code',
            archId: null,
            hasOverrides: false,
            overrides: [],
            intents: ['unknown-intent'],
          },
        ],
      ]),
      stats: { totalFiles: 1, scanTimeMs: 50, cacheHits: 0, cacheMisses: 1 },
    };

    const result = await analyzer.analyze(scanResult, scanner);

    expect(result.undefinedIntents).toContain('unknown-intent');
    expect(result.validationIssues).toBeGreaterThan(0);
  });

  it('handles missing intent registry gracefully', async () => {
    const analyzer = new IntentAnalyzer('/project');

    mockLoadArchIgnore.mockResolvedValue({ filter: (files: string[]) => files });
    mockLoadIntentRegistry.mockRejectedValue(new Error('Not found'));

    const scanner = { parseSemanticModel: vi.fn() } as any as UnifiedHealthScanner;

    const scanResult: ScanResult = {
      files: new Map([
        [
          'src/file.ts',
          {
            path: 'src/file.ts',
            absolutePath: '/project/src/file.ts',
            content: 'code',
            archId: null,
            hasOverrides: false,
            overrides: [],
            intents: [],
          },
        ],
      ]),
      stats: { totalFiles: 1, scanTimeMs: 50, cacheHits: 0, cacheMisses: 1 },
    };

    const result = await analyzer.analyze(scanResult, scanner);

    expect(result.registryError).toContain('Not found');
    expect(result.undefinedIntents).toEqual([]);
  });

  it('calculates intent coverage percentage', async () => {
    const analyzer = new IntentAnalyzer('/project');

    mockLoadArchIgnore.mockResolvedValue({ filter: (files: string[]) => files });
    mockLoadIntentRegistry.mockResolvedValue({ intents: {} } as any);
    mockListIntentNames.mockReturnValue([]);

    const scanner = { parseSemanticModel: vi.fn() } as any as UnifiedHealthScanner;

    const scanResult: ScanResult = {
      files: new Map([
        [
          'src/file1.ts',
          {
            path: 'src/file1.ts',
            absolutePath: '/project/src/file1.ts',
            content: '// @intent:admin',
            archId: null,
            hasOverrides: false,
            overrides: [],
            intents: ['admin'],
          },
        ],
        [
          'src/file2.ts',
          {
            path: 'src/file2.ts',
            absolutePath: '/project/src/file2.ts',
            content: 'no intents',
            archId: null,
            hasOverrides: false,
            overrides: [],
            intents: [],
          },
        ],
      ]),
      stats: { totalFiles: 2, scanTimeMs: 100, cacheHits: 0, cacheMisses: 2 },
    };

    const result = await analyzer.analyze(scanResult, scanner);

    expect(result.intentCoveragePercent).toBe(50); // 1 out of 2 files
  });
});
