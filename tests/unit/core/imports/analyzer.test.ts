/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for ProjectAnalyzer import graph functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectAnalyzer } from '../../../../src/core/imports/analyzer.js';

// Mock dependencies
vi.mock('ts-morph', () => ({
  Project: vi.fn().mockImplementation(() => ({
    addSourceFileAtPath: vi.fn(),
    getSourceFile: vi.fn().mockReturnValue({
      getImportDeclarations: vi.fn().mockReturnValue([]),
      getExportDeclarations: vi.fn().mockReturnValue([]),
    }),
  })),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn().mockReturnValue(null),
}));

import { globFiles, readFile } from '../../../../src/utils/file-system.js';
import { extractArchId } from '../../../../src/core/arch-tag/parser.js';

describe('ProjectAnalyzer', () => {
  let analyzer: ProjectAnalyzer;
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new ProjectAnalyzer(projectRoot);
  });

  describe('constructor', () => {
    it('should create analyzer with project root', () => {
      expect(analyzer).toBeDefined();
    });
  });

  describe('buildImportGraph', () => {
    it('should return empty graph when no files found', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);

      const result = await analyzer.buildImportGraph();

      expect(result.graph.nodes.size).toBe(0);
      expect(result.cycles).toHaveLength(0);
      expect(result.buildTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should build graph with file nodes', async () => {
      const files = [
        '/test/project/src/a.ts',
        '/test/project/src/b.ts',
      ];
      vi.mocked(globFiles).mockResolvedValue(files);
      vi.mocked(readFile).mockResolvedValue('// no arch tag');

      const result = await analyzer.buildImportGraph();

      expect(result.graph.nodes.size).toBe(2);
      expect(result.graph.nodes.has('/test/project/src/a.ts')).toBe(true);
      expect(result.graph.nodes.has('/test/project/src/b.ts')).toBe(true);
    });

    it('should extract arch IDs for files', async () => {
      const files = ['/test/project/src/a.ts'];
      vi.mocked(globFiles).mockResolvedValue(files);
      vi.mocked(readFile).mockResolvedValue('/** @arch archcodex.core */');
      vi.mocked(extractArchId).mockReturnValue('archcodex.core');

      const result = await analyzer.buildImportGraph();

      const node = result.graph.nodes.get('/test/project/src/a.ts');
      expect(node?.archId).toBe('archcodex.core');
    });

    it('should handle files without arch tags', async () => {
      const files = ['/test/project/src/a.ts'];
      vi.mocked(globFiles).mockResolvedValue(files);
      vi.mocked(readFile).mockResolvedValue('export const x = 1;');
      vi.mocked(extractArchId).mockReturnValue(null);

      const result = await analyzer.buildImportGraph();

      const node = result.graph.nodes.get('/test/project/src/a.ts');
      expect(node?.archId).toBeNull();
    });

    it('should use custom include patterns', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);

      await analyzer.buildImportGraph({ include: ['src/**/*.tsx'] });

      expect(globFiles).toHaveBeenCalledWith(
        ['src/**/*.tsx'],
        expect.objectContaining({
          cwd: projectRoot,
          absolute: true,
        })
      );
    });

    it('should use custom exclude patterns', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);

      await analyzer.buildImportGraph({ exclude: ['**/vendor/**'] });

      expect(globFiles).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          ignore: ['**/vendor/**'],
        })
      );
    });

    it('should track build time', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);

      const result = await analyzer.buildImportGraph();

      expect(typeof result.buildTimeMs).toBe('number');
      expect(result.buildTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getImporters', () => {
    it('should return empty array when no cached graph', () => {
      const importers = analyzer.getImporters('/test/project/src/a.ts');
      expect(importers).toHaveLength(0);
    });
  });

  describe('dispose', () => {
    it('should clear caches', async () => {
      vi.mocked(globFiles).mockResolvedValue(['/test/project/src/a.ts']);
      vi.mocked(readFile).mockResolvedValue('');

      await analyzer.buildImportGraph();
      analyzer.dispose();

      // After dispose, getImporters should return empty (no cached graph)
      const importers = analyzer.getImporters('/test/project/src/a.ts');
      expect(importers).toHaveLength(0);
    });
  });
});
