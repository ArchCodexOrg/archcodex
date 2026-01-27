/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.core.domain.constraint
 * @intent:tested
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedHealthScanner } from '../../../../src/core/health/scanner.js';
import type { ScanOptions } from '../../../../src/core/health/scanner.js';

// Mock file system operations
vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn(),
  parseArchTags: vi.fn(),
}));

import { globFiles, readFile } from '../../../../src/utils/file-system.js';
import { extractArchId, parseArchTags } from '../../../../src/core/arch-tag/parser.js';

const mockGlobFiles = vi.mocked(globFiles);
const mockReadFile = vi.mocked(readFile);
const mockExtractArchId = vi.mocked(extractArchId);
const mockParseArchTags = vi.mocked(parseArchTags);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UnifiedHealthScanner', () => {
  it('scans files and returns metadata', async () => {
    const scanner = new UnifiedHealthScanner('/project');

    mockGlobFiles.mockResolvedValue(['src/core/engine.ts', 'src/cli/check.ts']);
    mockReadFile.mockResolvedValue('// @arch archcodex.core.engine\ncode');
    mockExtractArchId.mockReturnValue('archcodex.core.engine');
    mockParseArchTags.mockReturnValue({
      archTag: { archId: 'archcodex.core.engine', line: 1, column: 3 },
      overrides: [],
      intents: [],
      errors: [],
    });

    const result = await scanner.scan({
      include: ['src/**/*.ts'],
      exclude: ['node_modules/**'],
    });

    expect(result.files.size).toBe(2);
    expect(result.stats.totalFiles).toBe(2);
    expect(result.stats.cacheMisses).toBe(2);
    expect(result.stats.cacheHits).toBe(0);
  });

  it('extracts arch tags from file metadata', async () => {
    const scanner = new UnifiedHealthScanner('/project');

    mockGlobFiles.mockResolvedValue(['src/service.ts']);
    mockReadFile.mockResolvedValue('// @arch archcodex.core.engine\ncode');
    mockExtractArchId.mockReturnValue('archcodex.core.engine');
    mockParseArchTags.mockReturnValue({
      archTag: { archId: 'archcodex.core.engine', line: 1, column: 3 },
      overrides: [],
      intents: [],
      errors: [],
    });

    const result = await scanner.scan({
      include: ['src/**/*.ts'],
      exclude: [],
    });

    const metadata = result.files.get('src/service.ts');
    expect(metadata?.archId).toBe('archcodex.core.engine');
    expect(metadata?.intents).toEqual([]);
    expect(metadata?.overrides).toEqual([]);
  });

  it('skips files that cannot be read', async () => {
    const scanner = new UnifiedHealthScanner('/project');

    mockGlobFiles.mockResolvedValue(['src/readable.ts', 'src/unreadable.ts']);
    mockReadFile.mockImplementation((path) => {
      if (path.includes('unreadable')) throw new Error('Permission denied');
      return Promise.resolve('// @arch archcodex.core.engine\ncode');
    });
    mockExtractArchId.mockReturnValue('archcodex.core.engine');
    mockParseArchTags.mockReturnValue({
      archTag: { archId: 'archcodex.core.engine', line: 1, column: 3 },
      overrides: [],
      intents: [],
      errors: [],
    });

    const result = await scanner.scan({
      include: ['src/**/*.ts'],
      exclude: [],
    });

    // Should only have the readable file
    expect(result.files.size).toBe(1);
    expect(result.files.has('src/readable.ts')).toBe(true);
    expect(result.files.has('src/unreadable.ts')).toBe(false);
  });

  it('returns stats about scan operation', async () => {
    const scanner = new UnifiedHealthScanner('/project');

    mockGlobFiles.mockResolvedValue(['src/file.ts']);
    mockReadFile.mockResolvedValue('code');
    mockExtractArchId.mockReturnValue(null);
    mockParseArchTags.mockReturnValue({
      archTag: null,
      overrides: [],
      intents: [],
      errors: [],
    });

    const result = await scanner.scan({
      include: ['src/**/*.ts'],
      exclude: [],
    });

    expect(result.stats.totalFiles).toBe(1);
    expect(result.stats.scanTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.cacheMisses).toBe(1);
    expect(result.stats.cacheHits).toBe(0);
  });

  it('parses intents from file content', async () => {
    const scanner = new UnifiedHealthScanner('/project');

    mockGlobFiles.mockResolvedValue(['src/file.ts']);
    mockReadFile.mockResolvedValue('// @intent:admin-only\ncode');
    mockExtractArchId.mockReturnValue('archcodex.core.engine');
    mockParseArchTags.mockReturnValue({
      archTag: { archId: 'archcodex.core.engine', line: 1, column: 3 },
      overrides: [],
      intents: [{ name: 'admin-only', line: 1, column: 3 }],
      errors: [],
    });

    const result = await scanner.scan({
      include: ['src/**/*.ts'],
      exclude: [],
    });

    const metadata = result.files.get('src/file.ts');
    expect(metadata?.intents).toEqual(['admin-only']);
  });
});
