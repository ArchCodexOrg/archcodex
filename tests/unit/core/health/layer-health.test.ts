/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectOrphanFiles, detectPhantomPaths, detectStaleExclusions } from '../../../../src/core/health/layer-health.js';
import type { LayerConfig } from '../../../../src/core/config/schema.js';

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn(),
}));

import { globFiles, readFile } from '../../../../src/utils/file-system.js';
import { extractArchId } from '../../../../src/core/arch-tag/parser.js';

const mockGlobFiles = vi.mocked(globFiles);
const mockReadFile = vi.mocked(readFile);
const mockExtractArchId = vi.mocked(extractArchId);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectOrphanFiles', () => {
  const layers: LayerConfig[] = [
    { name: 'core', paths: ['src/core/**'], can_import: [], exclude: [] },
    { name: 'cli', paths: ['src/cli/**'], can_import: ['core'], exclude: [] },
    { name: 'utils', paths: ['src/utils/**'], can_import: [], exclude: [] },
  ];

  it('returns empty when no layers defined', async () => {
    const result = await detectOrphanFiles('/project', [], {
      include: ['src/**/*.ts'],
      exclude: [],
    });

    expect(result.totalFiles).toBe(0);
    expect(result.coveredFiles).toBe(0);
    expect(result.orphans).toEqual([]);
  });

  it('detects orphan files not in any layer', async () => {
    mockGlobFiles.mockResolvedValue([
      'src/core/engine.ts',
      'src/cli/commands/check.ts',
      'src/standalone/foo.ts',
      'src/other/bar.ts',
    ]);

    const result = await detectOrphanFiles('/project', layers, {
      include: ['src/**/*.ts'],
      exclude: [],
    });

    expect(result.totalFiles).toBe(4);
    expect(result.coveredFiles).toBe(2);
    expect(result.orphans).toEqual(['src/standalone/foo.ts', 'src/other/bar.ts']);
  });

  it('all files covered returns no orphans', async () => {
    mockGlobFiles.mockResolvedValue([
      'src/core/engine.ts',
      'src/cli/commands/check.ts',
      'src/utils/logger.ts',
    ]);

    const result = await detectOrphanFiles('/project', layers, {
      include: ['src/**/*.ts'],
      exclude: [],
    });

    expect(result.totalFiles).toBe(3);
    expect(result.coveredFiles).toBe(3);
    expect(result.orphans).toEqual([]);
  });

  it('respects layer exclude patterns', async () => {
    const layersWithExclude: LayerConfig[] = [
      { name: 'core', paths: ['src/core/**'], can_import: [], exclude: ['src/core/generated/**'] },
    ];

    mockGlobFiles.mockResolvedValue([
      'src/core/engine.ts',
      'src/core/generated/types.ts',
    ]);

    const result = await detectOrphanFiles('/project', layersWithExclude, {
      include: ['src/**/*.ts'],
      exclude: [],
    });

    // generated file is excluded from the layer, so it's orphan
    expect(result.orphans).toEqual(['src/core/generated/types.ts']);
  });
});

describe('detectPhantomPaths', () => {
  it('returns empty when all paths match files', async () => {
    const layers: LayerConfig[] = [
      { name: 'core', paths: ['src/core/**'], can_import: [], exclude: [] },
      { name: 'cli', paths: ['src/cli/**'], can_import: [], exclude: [] },
    ];

    mockGlobFiles.mockImplementation(async (pattern) => {
      if (pattern === 'src/core/**') return ['src/core/engine.ts'];
      if (pattern === 'src/cli/**') return ['src/cli/commands/check.ts'];
      return [];
    });

    const result = await detectPhantomPaths('/project', layers);
    expect(result).toEqual([]);
  });

  it('detects paths matching zero files', async () => {
    const layers: LayerConfig[] = [
      { name: 'core', paths: ['src/core/**'], can_import: [], exclude: [] },
      { name: 'security', paths: ['src/security/**'], can_import: [], exclude: [] },
    ];

    mockGlobFiles.mockImplementation(async (pattern) => {
      if (pattern === 'src/core/**') return ['src/core/engine.ts'];
      if (pattern === 'src/security/**') return []; // phantom path
      return [];
    });

    const result = await detectPhantomPaths('/project', layers);
    expect(result).toEqual([
      { layerName: 'security', pattern: 'src/security/**' },
    ]);
  });

  it('detects phantom paths within multi-path layers', async () => {
    const layers: LayerConfig[] = [
      { name: 'cli', paths: ['src/cli/**', 'src/mcp/**', 'src/admin/**'], can_import: [], exclude: [] },
    ];

    mockGlobFiles.mockImplementation(async (pattern) => {
      if (pattern === 'src/cli/**') return ['src/cli/check.ts'];
      if (pattern === 'src/mcp/**') return ['src/mcp/server.ts'];
      if (pattern === 'src/admin/**') return []; // phantom
      return [];
    });

    const result = await detectPhantomPaths('/project', layers);
    expect(result).toEqual([
      { layerName: 'cli', pattern: 'src/admin/**' },
    ]);
  });
});

describe('detectStaleExclusions', () => {
  it('skips built-in exclusion patterns', async () => {
    const result = await detectStaleExclusions('/project', [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
      '**/*.test.ts',
    ]);

    expect(result).toEqual([]);
    expect(mockGlobFiles).not.toHaveBeenCalled();
  });

  it('detects stale exclusions where all files have @arch tags', async () => {
    mockGlobFiles.mockResolvedValue(['examples/demo.ts', 'examples/sample.ts']);
    mockReadFile.mockResolvedValue('/** @arch archcodex.test */\nconsole.log("hi");');
    mockExtractArchId.mockReturnValue('archcodex.test');

    const result = await detectStaleExclusions('/project', ['examples/**']);

    expect(result).toEqual([{
      pattern: 'examples/**',
      source: 'files.scan.exclude',
      matchedFileCount: 2,
      reason: 'All 2 matched file(s) already have @arch tags',
    }]);
  });

  it('does not flag exclusion when some files lack @arch tags', async () => {
    mockGlobFiles.mockResolvedValue(['examples/demo.ts', 'examples/noarch.ts']);
    mockReadFile.mockImplementation(async (p: string) => {
      if (p.includes('demo')) return '/** @arch archcodex.test */';
      return '// no arch tag';
    });
    mockExtractArchId.mockImplementation((content: string) => {
      if (content.includes('@arch')) return 'archcodex.test';
      return null;
    });

    const result = await detectStaleExclusions('/project', ['examples/**']);
    expect(result).toEqual([]);
  });

  it('does not flag exclusions matching zero files', async () => {
    mockGlobFiles.mockResolvedValue([]);

    const result = await detectStaleExclusions('/project', ['nonexistent/**']);
    expect(result).toEqual([]);
  });

  it('handles file read errors gracefully', async () => {
    mockGlobFiles.mockResolvedValue(['examples/broken.ts']);
    mockReadFile.mockRejectedValue(new Error('File not found'));

    const result = await detectStaleExclusions('/project', ['examples/**']);
    expect(result).toEqual([]); // Not stale since we can't confirm
  });
});
