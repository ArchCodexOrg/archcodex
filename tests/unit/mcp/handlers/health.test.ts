/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP health handlers (health, sync-index, consistency, types).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleHealth,
  handleSyncIndex,
  handleConsistency,
  handleTypes,
} from '../../../../src/mcp/handlers/health.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
  getRegistryContent: vi.fn(),
}));

vi.mock('../../../../src/core/health/analyzer.js', () => ({
  HealthAnalyzer: vi.fn(function() {
    return {
    analyze: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/similarity/index.js', () => ({
  SimilarityAnalyzer: vi.fn(function() {
    return {
    findInconsistencies: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

vi.mock('../../../../src/core/discovery/index.js', () => ({
  checkIndexStaleness: vi.fn(),
}));

vi.mock('../../../../src/llm/reindexer.js', () => ({
  reindexAll: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
}));

vi.mock('../../../../src/core/types/duplicate-detector.js', () => ({
  DuplicateDetector: vi.fn(function() {
    return {
    scanFiles: vi.fn(),
    dispose: vi.fn(),
  };
  }),
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry, getRegistryContent } from '../../../../src/core/registry/loader.js';
import { HealthAnalyzer } from '../../../../src/core/health/analyzer.js';
import { SimilarityAnalyzer } from '../../../../src/core/similarity/index.js';
import { checkIndexStaleness } from '../../../../src/core/discovery/index.js';
import { reindexAll } from '../../../../src/llm/reindexer.js';
import { globFiles } from '../../../../src/utils/file-system.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { isProjectInitialized, findNearbyProject } from '../../../../src/mcp/utils.js';

describe('MCP Health Handlers', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(isProjectInitialized).mockResolvedValue(true);
    vi.mocked(findNearbyProject).mockResolvedValue(null);
    vi.mocked(loadConfig).mockResolvedValue({
      files: { scan: { include: ['**/*.ts'], exclude: ['node_modules/**'] } },
    });
    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: { base: { description: 'Base' } },
      mixins: {},
    });
    vi.mocked(loadArchIgnore).mockResolvedValue({
      ignores: () => false,
      filter: (files: string[]) => files,
      patterns: () => [],
    });
  });

  describe('handleHealth', () => {
    it('should return health metrics when project is initialized', async () => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        overrideDebt: { active: 5, expiring: 2, expired: 1 },
        coverage: { totalFiles: 100, taggedFiles: 95 },
        registryHealth: { totalArchitectures: 10, usedArchitectures: 8 },
        recommendations: ['Consider removing expired overrides'],
        generatedAt: new Date().toISOString(),
      });

      vi.mocked(HealthAnalyzer).mockImplementation(function() {
      return {
        analyze: mockAnalyze,
      } as unknown as HealthAnalyzer;
    });

      const result = await handleHealth(projectRoot);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.overrideDebt.active).toBe(5);
      expect(parsed.coverage.totalFiles).toBe(100);
    });

    it('should return error when project is not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleHealth(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
      expect(result.content[0].text).toContain('.arch');
    });

    it('should suggest nearby project when found', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handleHealth(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nearby/project');
    });

    it('should pass expiringDays option to analyzer', async () => {
      const mockAnalyze = vi.fn().mockResolvedValue({
        overrideDebt: {},
        coverage: {},
        registryHealth: {},
        recommendations: [],
        generatedAt: new Date().toISOString(),
      });

      vi.mocked(HealthAnalyzer).mockImplementation(function() {
      return {
        analyze: mockAnalyze,
      } as unknown as HealthAnalyzer;
    });

      await handleHealth(projectRoot, 60);

      expect(mockAnalyze).toHaveBeenCalledWith({ expiringDays: 60 });
    });

    it('should handle analyzer errors gracefully', async () => {
      vi.mocked(HealthAnalyzer).mockImplementation(function() {
      return {
        analyze: vi.fn().mockRejectedValue(new Error('Analysis failed')),
      } as unknown as HealthAnalyzer;
    });

      const result = await handleHealth(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Analysis failed');
    });
  });

  describe('handleSyncIndex', () => {
    it('should return staleness status in check-only mode', async () => {
      vi.mocked(checkIndexStaleness).mockResolvedValue({
        isStale: false,
        reason: undefined,
        missingArchIds: [],
      });

      const result = await handleSyncIndex(projectRoot, true);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.isStale).toBe(false);
      expect(parsed.message).toContain('up to date');
    });

    it('should indicate when index is stale', async () => {
      vi.mocked(checkIndexStaleness).mockResolvedValue({
        isStale: true,
        reason: 'Registry modified',
        missingArchIds: ['new.arch'],
      });

      const result = await handleSyncIndex(projectRoot, true);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.isStale).toBe(true);
      expect(parsed.reason).toBe('Registry modified');
      expect(parsed.missingArchIds).toContain('new.arch');
    });

    it('should sync index when check is false and index is stale', async () => {
      vi.mocked(checkIndexStaleness).mockResolvedValue({
        isStale: true,
        reason: 'Registry modified',
        missingArchIds: ['new.arch'],
      });
      vi.mocked(getRegistryContent).mockResolvedValue({});
      vi.mocked(reindexAll).mockResolvedValue({
        results: [
          { keywords: ['test'] },
          { keywords: ['service'] },
        ],
      });

      const result = await handleSyncIndex(projectRoot, false);

      expect(reindexAll).toHaveBeenCalled();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toBe(true);
      expect(parsed.architecturesIndexed).toBe(2);
    });

    it('should sync index when force is true', async () => {
      vi.mocked(checkIndexStaleness).mockResolvedValue({
        isStale: false,
        reason: undefined,
        missingArchIds: [],
      });
      vi.mocked(getRegistryContent).mockResolvedValue({});
      vi.mocked(reindexAll).mockResolvedValue({ results: [{ keywords: ['test'] }] });

      const result = await handleSyncIndex(projectRoot, false, true);

      expect(reindexAll).toHaveBeenCalled();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toBe(true);
    });

    it('should return error when project is not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleSyncIndex(projectRoot);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
    });
  });

  describe('handleConsistency', () => {
    it('should find inconsistencies in file compared to peers', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/a.ts', 'src/b.ts', 'src/c.ts']);

      const mockFindInconsistencies = vi.fn().mockResolvedValue([
        {
          referenceFile: 'src/b.ts',
          similarity: 0.7,
          archId: 'test.arch',
          missing: { methods: ['doSomething'], exports: [] },
          extra: { methods: [], exports: [] },
        },
      ]);

      vi.mocked(SimilarityAnalyzer).mockImplementation(function() {
      return {
        findInconsistencies: mockFindInconsistencies,
        dispose: vi.fn(),
      } as unknown as SimilarityAnalyzer;
    });

      const result = await handleConsistency(projectRoot, 'src/a.ts');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.file).toBe('src/a.ts');
      expect(parsed.issuesFound).toBe(1);
      expect(parsed.issues[0].comparedTo).toBe('src/b.ts');
      expect(parsed.issues[0].missing.methods).toContain('doSomething');
    });

    it('should respect threshold option', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/a.ts', 'src/b.ts']);

      const mockFindInconsistencies = vi.fn().mockResolvedValue([]);
      vi.mocked(SimilarityAnalyzer).mockImplementation(function() {
      return {
        findInconsistencies: mockFindInconsistencies,
        dispose: vi.fn(),
      } as unknown as SimilarityAnalyzer;
    });

      await handleConsistency(projectRoot, 'src/a.ts', { threshold: 0.8 });

      expect(mockFindInconsistencies).toHaveBeenCalledWith('src/a.ts', expect.any(Array), {
        threshold: 0.8,
        sameArchOnly: true,
        minDiff: 1,
      });
    });

    it('should dispose analyzer after use', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/a.ts']);

      const mockDispose = vi.fn();
      vi.mocked(SimilarityAnalyzer).mockImplementation(function() {
      return {
        findInconsistencies: vi.fn().mockResolvedValue([]),
        dispose: mockDispose,
      } as unknown as SimilarityAnalyzer;
    });

      await handleConsistency(projectRoot, 'src/a.ts');

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('handleTypes', () => {
    it('should detect duplicate types', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/a.ts', 'src/b.ts']);

      const mockScanFiles = vi.fn().mockResolvedValue({
        totalTypes: 10,
        exactDuplicates: 2,
        renamedDuplicates: 1,
        similarTypes: 1,
        groups: [
          {
            canonical: { name: 'User', file: 'src/a.ts', line: 5, kind: 'interface' },
            duplicates: [
              {
                type: { name: 'User', file: 'src/b.ts', line: 10 },
                matchType: 'exact',
                similarity: 1,
                missingProperties: [],
                extraProperties: [],
              },
            ],
            suggestion: 'Consolidate into src/a.ts',
          },
        ],
      });

      const { DuplicateDetector } = await import('../../../../src/core/types/duplicate-detector.js');
      vi.mocked(DuplicateDetector).mockImplementation(function() {
      return {
        scanFiles: mockScanFiles,
        dispose: vi.fn(),
      } as unknown as InstanceType<typeof DuplicateDetector>;
    });

      const result = await handleTypes(projectRoot);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalTypes).toBe(10);
      expect(parsed.exactDuplicates).toBe(2);
      expect(parsed.groups).toHaveLength(1);
    });

    it('should return error when no TypeScript files found', async () => {
      vi.mocked(globFiles).mockResolvedValue([]);

      const result = await handleTypes(projectRoot);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No TypeScript files found');
    });

    it('should use custom files option', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/models/user.ts']);

      const mockScanFiles = vi.fn().mockResolvedValue({
        totalTypes: 1,
        exactDuplicates: 0,
        renamedDuplicates: 0,
        similarTypes: 0,
        groups: [],
      });

      const { DuplicateDetector } = await import('../../../../src/core/types/duplicate-detector.js');
      vi.mocked(DuplicateDetector).mockImplementation(function() {
      return {
        scanFiles: mockScanFiles,
        dispose: vi.fn(),
      } as unknown as InstanceType<typeof DuplicateDetector>;
    });

      await handleTypes(projectRoot, { files: ['src/models/**/*.ts'] });

      expect(globFiles).toHaveBeenCalledWith('src/models/**/*.ts', expect.any(Object));
    });

    it('should use custom threshold option', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/a.ts']);

      const mockScanFiles = vi.fn().mockResolvedValue({
        totalTypes: 0,
        exactDuplicates: 0,
        renamedDuplicates: 0,
        similarTypes: 0,
        groups: [],
      });

      const { DuplicateDetector } = await import('../../../../src/core/types/duplicate-detector.js');
      vi.mocked(DuplicateDetector).mockImplementation(function() {
      return {
        scanFiles: mockScanFiles,
        dispose: vi.fn(),
      } as unknown as InstanceType<typeof DuplicateDetector>;
    });

      await handleTypes(projectRoot, { threshold: 90 });

      expect(DuplicateDetector).toHaveBeenCalledWith(projectRoot, expect.objectContaining({
        similarityThreshold: 0.9,
      }));
    });
  });
});
