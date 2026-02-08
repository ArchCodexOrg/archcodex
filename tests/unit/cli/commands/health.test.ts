/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the health command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHealthCommand } from '../../../../src/cli/commands/health.js';
import type { HealthReport } from '../../../../src/core/health/types.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockHealthReport: HealthReport;
let mockStaleness = {
  isStale: false,
  reason: undefined as string | undefined,
  missingArchIds: [] as string[],
};

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: { source_patterns: ['src/**/*.ts'] },
  }),
}));

vi.mock('../../../../src/core/health/index.js', () => ({
  HealthAnalyzer: vi.fn(function() {
    return {
    analyze: vi.fn().mockImplementation(async () => mockHealthReport),
  };
  }),
}));

vi.mock('../../../../src/core/discovery/staleness.js', () => ({
  checkIndexStaleness: vi.fn().mockImplementation(async () => mockStaleness),
}));

vi.mock('../../../../src/cli/commands/health-output.js', () => ({
  printLayerCoverage: vi.fn(),
  printRecommendation: vi.fn(),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { HealthAnalyzer } from '../../../../src/core/health/index.js';
import { checkIndexStaleness } from '../../../../src/core/discovery/staleness.js';
import { printLayerCoverage, printRecommendation } from '../../../../src/cli/commands/health-output.js';
import { logger as log } from '../../../../src/utils/logger.js';

function createBaseReport(): HealthReport {
  return {
    overrideDebt: {
      active: 0,
      expired: 0,
      expiringSoon: 0,
      noExpiry: 0,
      filesWithOverrides: 0,
    },
    coverage: {
      totalFiles: 100,
      taggedFiles: 80,
      untaggedFiles: 20,
      coveragePercent: 80,
      untaggedSample: [],
    },
    registryHealth: {
      totalArchitectures: 10,
      usedArchitectures: 10,
      unusedArchitectures: 0,
      usagePercent: 100,
      unusedArchIds: [],
    },
    topViolatedConstraints: [],
    topOverriddenArchs: [],
    recommendations: [],
  };
}

describe('health command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');

    // Reset mock data
    mockHealthReport = createBaseReport();
    mockStaleness = {
      isStale: false,
      reason: undefined,
      missingArchIds: [],
    };

    // Reset HealthAnalyzer mock
    vi.mocked(HealthAnalyzer).mockImplementation(function() {
      return {
      analyze: vi.fn().mockImplementation(async () => mockHealthReport),
    } as any;
    });

    // Reset staleness mock
    vi.mocked(checkIndexStaleness).mockImplementation(async () => mockStaleness);

    // Reset loadConfig mock to resolve by default
    vi.mocked(loadConfig).mockResolvedValue({
      version: '1.0',
      files: { source_patterns: ['src/**/*.ts'] },
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createHealthCommand', () => {
    it('should create a command with correct name', () => {
      const command = createHealthCommand();
      expect(command.name()).toBe('health');
    });

    it('should have the correct description', () => {
      const command = createHealthCommand();
      expect(command.description()).toBe('Show architectural health dashboard');
    });

    it('should have required options', () => {
      const command = createHealthCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--expiring-days');
      expect(optionNames).toContain('--by-arch');
      expect(optionNames).toContain('--no-cache');
      expect(optionNames).toContain('--no-layers');
    });

    it('should have correct default for config option', () => {
      const command = createHealthCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.defaultValue).toBe('.arch/config.yaml');
    });

    it('should have correct default for expiring-days option', () => {
      const command = createHealthCommand();
      const expiringOption = command.options.find((opt) => opt.long === '--expiring-days');
      expect(expiringOption?.defaultValue).toBe('30');
    });

    it('should have short flags for common options', () => {
      const command = createHealthCommand();
      const options = command.options;

      const configOption = options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');

      const verboseOption = options.find((opt) => opt.long === '--verbose');
      expect(verboseOption?.short).toBe('-v');
    });
  });

  describe('command execution', () => {
    it('should load config and run health analysis', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      expect(loadConfig).toHaveBeenCalled();
      expect(HealthAnalyzer).toHaveBeenCalledWith('/project', expect.any(Object));
    });

    it('should check index staleness', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      expect(checkIndexStaleness).toHaveBeenCalledWith('/project');
    });

    it('should pass expiring-days option to analyzer', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--expiring-days', '60']);

      const analyzeCall = vi.mocked(HealthAnalyzer).mock.results[0].value.analyze;
      expect(analyzeCall).toHaveBeenCalledWith(
        expect.objectContaining({
          expiringDays: 60,
        })
      );
    });

    it('should pass verbose flag to analyzer for untagged sample', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--verbose']);

      const analyzeCall = vi.mocked(HealthAnalyzer).mock.results[0].value.analyze;
      expect(analyzeCall).toHaveBeenCalledWith(
        expect.objectContaining({
          untaggedSampleSize: 10000,
        })
      );
    });

    it('should use small sample size when not verbose', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const analyzeCall = vi.mocked(HealthAnalyzer).mock.results[0].value.analyze;
      expect(analyzeCall).toHaveBeenCalledWith(
        expect.objectContaining({
          untaggedSampleSize: 10,
        })
      );
    });

    it('should pass --by-arch option to analyzer', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--by-arch']);

      const analyzeCall = vi.mocked(HealthAnalyzer).mock.results[0].value.analyze;
      expect(analyzeCall).toHaveBeenCalledWith(
        expect.objectContaining({
          includeArchUsage: true,
        })
      );
    });

    it('should enable caching by default', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const analyzeCall = vi.mocked(HealthAnalyzer).mock.results[0].value.analyze;
      expect(analyzeCall).toHaveBeenCalledWith(
        expect.objectContaining({
          useCache: true,
        })
      );
    });

    it('should disable caching with --no-cache', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--no-cache']);

      const analyzeCall = vi.mocked(HealthAnalyzer).mock.results[0].value.analyze;
      expect(analyzeCall).toHaveBeenCalledWith(
        expect.objectContaining({
          useCache: false,
        })
      );
    });

    it('should skip layers with --no-layers', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--no-layers']);

      const analyzeCall = vi.mocked(HealthAnalyzer).mock.results[0].value.analyze;
      expect(analyzeCall).toHaveBeenCalledWith(
        expect.objectContaining({
          skipLayers: true,
        })
      );
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is set', async () => {
      mockHealthReport = createBaseReport();

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.coverage.coveragePercent).toBe(80);
    });

    it('should include index status in JSON output', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'missing architectures',
        missingArchIds: ['arch.missing'],
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.indexStatus.isStale).toBe(true);
    });
  });

  describe('override debt display', () => {
    it('should show no overrides message when active is 0', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.overrideDebt.active = 0;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No active overrides'))).toBe(true);
    });

    it('should show active overrides count', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.overrideDebt.active = 5;
      mockHealthReport.overrideDebt.filesWithOverrides = 3;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Active:') && c?.includes('5'))).toBe(true);
    });

    it('should show expiring overrides', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.overrideDebt.active = 5;
      mockHealthReport.overrideDebt.expiringSoon = 2;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Expiring:') && c?.includes('2'))).toBe(true);
    });

    it('should show expired overrides', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.overrideDebt.active = 5;
      mockHealthReport.overrideDebt.expired = 3;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Expired:') && c?.includes('3'))).toBe(true);
    });

    it('should show no-expiry overrides', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.overrideDebt.active = 5;
      mockHealthReport.overrideDebt.noExpiry = 1;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No expiry:') && c?.includes('1'))).toBe(true);
    });
  });

  describe('coverage display', () => {
    it('should show coverage percentage', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.coverage.coveragePercent = 75;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('75%'))).toBe(true);
    });

    it('should show untagged file count', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.coverage.untaggedFiles = 15;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Untagged:') && c?.includes('15'))).toBe(true);
    });

    it('should show untagged sample files', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.coverage.untaggedFiles = 3;
      mockHealthReport.coverage.untaggedSample = ['file1.ts', 'file2.ts'];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('file1.ts'))).toBe(true);
    });

    it('should show all untagged files in verbose mode', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.coverage.untaggedFiles = 3;
      mockHealthReport.coverage.untaggedSample = ['file1.ts', 'file2.ts', 'file3.ts'];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('All untagged files:'))).toBe(true);
    });

    it('should show truncation message when many untagged files', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.coverage.untaggedFiles = 10;
      mockHealthReport.coverage.untaggedSample = ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts'];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('and 5 more'))).toBe(true);
    });
  });

  describe('architecture usage (--by-arch)', () => {
    it('should show architecture usage when --by-arch is set', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.coverage.archUsage = [
        { archId: 'arch.one', fileCount: 10 },
        { archId: 'arch.two', fileCount: 5 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--by-arch']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture Usage'))).toBe(true);
      expect(calls.some((c) => c?.includes('arch.one'))).toBe(true);
    });

    it('should not show architecture usage without --by-arch', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.coverage.archUsage = [
        { archId: 'arch.one', fileCount: 10 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture Usage'))).toBe(false);
    });
  });

  describe('registry health', () => {
    it('should show all architectures in use message', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.unusedArchitectures = 0;

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('All architectures are in use'))).toBe(true);
    });

    it('should show unused architectures count', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.unusedArchitectures = 3;
      mockHealthReport.registryHealth.unusedArchIds = ['arch.unused1', 'arch.unused2'];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Unused:') && c?.includes('3'))).toBe(true);
    });

    it('should show unused arch IDs in verbose mode', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.unusedArchitectures = 2;
      mockHealthReport.registryHealth.unusedArchIds = ['arch.unused1', 'arch.unused2'];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('arch.unused1'))).toBe(true);
    });
  });

  describe('bloat detection', () => {
    it('should show similar architectures', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.similarArchitectures = [
        { archId1: 'arch.one', archId2: 'arch.two', similarity: 0.85 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Bloat Detection'))).toBe(true);
      expect(calls.some((c) => c?.includes('Similar:'))).toBe(true);
    });

    it('should show similar architecture details in verbose mode', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.similarArchitectures = [
        { archId1: 'arch.one', archId2: 'arch.two', similarity: 0.85 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('arch.one') && c?.includes('arch.two'))).toBe(true);
    });

    it('should show redundant architectures', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.redundantArchitectures = [
        { archId: 'arch.child', parentArchId: 'arch.parent' },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Redundant:'))).toBe(true);
    });

    it('should show deep inheritance chains', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.deepInheritance = [
        { archId: 'arch.deep', depth: 5, chain: ['a', 'b', 'c', 'd', 'e'] },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Deep chains:'))).toBe(true);
    });

    it('should show low usage architectures', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.lowUsageArchitectures = [
        { archId: 'arch.single', fileCount: 1 },
        { archId: 'arch.two', fileCount: 2 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Single-file:'))).toBe(true);
      expect(calls.some((c) => c?.includes('Low-usage:'))).toBe(true);
    });

    it('should show singleton violations', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.singletonViolations = [
        { archId: 'arch.singleton', fileCount: 3, files: ['a.ts', 'b.ts', 'c.ts'] },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Singleton:'))).toBe(true);
    });

    it('should show verbose hint when not verbose', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.registryHealth.similarArchitectures = [
        { archId1: 'arch.one', archId2: 'arch.two', similarity: 0.85 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('use --verbose'))).toBe(true);
    });
  });

  describe('layer health', () => {
    it('should call printLayerCoverage when layer health exists', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.layerHealth = {
        totalLayers: 3,
        layersCovered: 2,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      expect(printLayerCoverage).toHaveBeenCalledWith(mockHealthReport.layerHealth, false);
    });

    it('should pass verbose flag to printLayerCoverage', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.layerHealth = {
        totalLayers: 3,
        layersCovered: 2,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--verbose']);

      expect(printLayerCoverage).toHaveBeenCalledWith(mockHealthReport.layerHealth, true);
    });
  });

  describe('discovery index status', () => {
    it('should show index up to date', async () => {
      mockStaleness = {
        isStale: false,
        reason: undefined,
        missingArchIds: [],
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Index is up to date'))).toBe(true);
    });

    it('should show stale index warning', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'missing architectures',
        missingArchIds: ['arch.missing'],
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('STALE'))).toBe(true);
    });

    it('should add recommendation when index is stale', async () => {
      mockStaleness = {
        isStale: true,
        reason: 'missing architectures',
        missingArchIds: [],
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      // Check that printRecommendation was called with index sync recommendation
      expect(printRecommendation).toHaveBeenCalled();
    });
  });

  describe('intent health', () => {
    it('should show intent health stats', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.intentHealth = {
        filesWithIntents: 10,
        totalFiles: 100,
        intentCoveragePercent: 10,
        totalIntents: 15,
        uniqueIntents: 5,
        undefinedIntents: [],
        unusedIntents: [],
        validationIssues: 0,
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Intent Health'))).toBe(true);
      expect(calls.some((c) => c?.includes('Files with intents:'))).toBe(true);
    });

    it('should show file-level and function-level breakdown', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.intentHealth = {
        filesWithIntents: 10,
        totalFiles: 100,
        intentCoveragePercent: 10,
        totalIntents: 15,
        uniqueIntents: 5,
        fileLevelIntents: 8,
        functionLevelIntents: 7,
        undefinedIntents: [],
        unusedIntents: [],
        validationIssues: 0,
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('File-level:'))).toBe(true);
      expect(calls.some((c) => c?.includes('Function-level:'))).toBe(true);
    });

    it('should show undefined intents', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.intentHealth = {
        filesWithIntents: 10,
        totalFiles: 100,
        intentCoveragePercent: 10,
        totalIntents: 15,
        uniqueIntents: 5,
        undefinedIntents: ['unknown-intent'],
        unusedIntents: [],
        validationIssues: 0,
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Undefined:'))).toBe(true);
    });

    it('should show unused intents', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.intentHealth = {
        filesWithIntents: 10,
        totalFiles: 100,
        intentCoveragePercent: 10,
        totalIntents: 15,
        uniqueIntents: 5,
        undefinedIntents: [],
        unusedIntents: ['deprecated-intent'],
        validationIssues: 0,
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Unused:'))).toBe(true);
    });

    it('should show validation issues', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.intentHealth = {
        filesWithIntents: 10,
        totalFiles: 100,
        intentCoveragePercent: 10,
        totalIntents: 15,
        uniqueIntents: 5,
        undefinedIntents: [],
        unusedIntents: [],
        validationIssues: 3,
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Issues:'))).toBe(true);
    });

    it('should show all intents valid message', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.intentHealth = {
        filesWithIntents: 10,
        totalFiles: 100,
        intentCoveragePercent: 10,
        totalIntents: 15,
        uniqueIntents: 5,
        undefinedIntents: [],
        unusedIntents: [],
        validationIssues: 0,
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('All intents are valid'))).toBe(true);
    });

    it('should show registry error when present', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.intentHealth = {
        filesWithIntents: 0,
        totalFiles: 100,
        intentCoveragePercent: 0,
        totalIntents: 0,
        uniqueIntents: 0,
        undefinedIntents: [],
        unusedIntents: [],
        validationIssues: 0,
        registryError: 'Failed to load registry',
      };

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Registry Error:'))).toBe(true);
    });
  });

  describe('top violated constraints', () => {
    it('should show top violated constraints', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.topViolatedConstraints = [
        { constraint: 'forbid_import:axios', overrideCount: 5 },
        { constraint: 'max_file_lines', overrideCount: 3 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Top Overridden Constraints'))).toBe(true);
      expect(calls.some((c) => c?.includes('forbid_import:axios'))).toBe(true);
    });
  });

  describe('top overridden architectures', () => {
    it('should show top overridden architectures', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.topOverriddenArchs = [
        { archId: 'arch.one', overrideCount: 10, filesWithOverrides: 5 },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Top Overridden Architectures'))).toBe(true);
      expect(calls.some((c) => c?.includes('arch.one'))).toBe(true);
    });
  });

  describe('files with multiple overrides', () => {
    it('should show files with multiple overrides', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.filesWithMultipleOverrides = [
        { filePath: 'src/legacy/complex.ts', overrideCount: 4, archId: 'arch.legacy' },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Files with Multiple Overrides'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/legacy/complex.ts'))).toBe(true);
    });
  });

  describe('recommendations', () => {
    it('should call printRecommendation for each recommendation', async () => {
      mockHealthReport = createBaseReport();
      mockHealthReport.recommendations = [
        { type: 'warning', title: 'Test', message: 'Test message' },
        { type: 'info', title: 'Info', message: 'Info message' },
      ];

      const command = createHealthCommand();
      await command.parseAsync(['node', 'test']);

      expect(printRecommendation).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createHealthCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected - process.exit throws
      }

      expect(log.error).toHaveBeenCalledWith('Config not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createHealthCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle health analyzer errors', async () => {
      vi.mocked(HealthAnalyzer).mockImplementation(function() {
      return {
        analyze: vi.fn().mockRejectedValue(new Error('Analysis failed')),
      } as any;
    });

      const command = createHealthCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Analysis failed');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('custom config path', () => {
    it('should use custom config path when provided', async () => {
      const command = createHealthCommand();
      await command.parseAsync(['node', 'test', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith('/project', 'custom/config.yaml');
    });
  });
});
