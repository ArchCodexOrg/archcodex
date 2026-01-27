/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for health-output print helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printLayerCoverage, printRecommendation } from '../../../../src/cli/commands/health-output.js';
import type { HealthRecommendation, LayerCoverageHealth } from '../../../../src/core/health/types.js';

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, { green: (s: string) => s }),
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    blue: (s: string) => s,
    white: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('health-output', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('printLayerCoverage', () => {
    it('should print layer coverage header', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 100,
        coveredFiles: 10,
        totalSourceFiles: 10,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Layer Coverage'));
    });

    it('should print coverage statistics', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 85,
        coveredFiles: 85,
        totalSourceFiles: 100,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('85/100'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('85%'));
    });

    it('should use green for coverage >= 95%', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 95,
        coveredFiles: 95,
        totalSourceFiles: 100,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('95%'));
    });

    it('should use yellow for coverage >= 80% and < 95%', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 85,
        coveredFiles: 85,
        totalSourceFiles: 100,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('85%'));
    });

    it('should use red for coverage < 80%', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 70,
        coveredFiles: 70,
        totalSourceFiles: 100,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('70%'));
    });

    it('should print orphan files count', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 90,
        coveredFiles: 90,
        totalSourceFiles: 100,
        orphanFiles: ['src/orphan1.ts', 'src/orphan2.ts'],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Orphan files'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2'));
    });

    it('should print orphan file paths (limited to 5 when not verbose)', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 90,
        coveredFiles: 90,
        totalSourceFiles: 100,
        orphanFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      // Should show hint about more files
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('... and 2 more'));
    });

    it('should print all orphan files when verbose', () => {
      const orphanFiles = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'];
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 90,
        coveredFiles: 90,
        totalSourceFiles: 100,
        orphanFiles,
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, true);

      // Should print all files
      for (const file of orphanFiles) {
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(file));
      }
    });

    it('should print phantom paths warning', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 100,
        coveredFiles: 10,
        totalSourceFiles: 10,
        orphanFiles: [],
        phantomPaths: [
          { layerName: 'cli', pattern: 'src/cli/**/*.ts' },
          { layerName: 'core', pattern: 'src/core/**/*.ts' },
        ],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2 phantom layer path'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('cli'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('core'));
    });

    it('should print stale exclusions info', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 100,
        coveredFiles: 10,
        totalSourceFiles: 10,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [
          { pattern: '**/*.test.ts', reason: 'No test files exist' },
        ],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1 stale exclusion'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('**/*.test.ts'));
    });

    it('should show success message when no issues', () => {
      const layerHealth: LayerCoverageHealth = {
        coveragePercent: 100,
        coveredFiles: 10,
        totalSourceFiles: 10,
        orphanFiles: [],
        phantomPaths: [],
        staleExclusions: [],
      };

      printLayerCoverage(layerHealth, false);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('All files are covered'));
    });
  });

  describe('printRecommendation', () => {
    it('should print warning recommendation with yellow icon', () => {
      const rec: HealthRecommendation = {
        type: 'warning',
        title: 'High override debt',
        message: 'You have 10 overrides that need review',
      };

      printRecommendation(rec);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('High override debt'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('10 overrides'));
    });

    it('should print action recommendation with blue icon', () => {
      const rec: HealthRecommendation = {
        type: 'action',
        title: 'Run health check',
        message: 'Your architecture needs attention',
      };

      printRecommendation(rec);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Run health check'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('needs attention'));
    });

    it('should print info recommendation', () => {
      const rec: HealthRecommendation = {
        type: 'info',
        title: 'Coverage status',
        message: 'Your coverage is at 85%',
      };

      printRecommendation(rec);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Coverage status'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('85%'));
    });

    it('should print command suggestion when provided', () => {
      const rec: HealthRecommendation = {
        type: 'action',
        title: 'Fix violations',
        message: 'Run check command to see details',
        command: 'archcodex check --verbose',
      };

      printRecommendation(rec);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Run:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('archcodex check --verbose'));
    });

    it('should not print Run: when no command provided', () => {
      const rec: HealthRecommendation = {
        type: 'info',
        title: 'Info only',
        message: 'Just some info',
      };

      printRecommendation(rec);

      const runCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('Run:')
      );
      expect(runCalls.length).toBe(0);
    });
  });
});
