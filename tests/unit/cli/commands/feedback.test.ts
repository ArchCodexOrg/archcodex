/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the feedback command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeedbackCommand } from '../../../../src/cli/commands/feedback.js';
import type { FeedbackReport, ViolationStats } from '../../../../src/core/feedback/types.js';

// Module-level mock configuration
let mockStoreExists = true;
let mockReport: FeedbackReport = {
  period: { from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now(), days: 30 },
  summary: {
    totalViolations: 0,
    totalOverrides: 0,
    uniqueRules: 0,
    uniqueFiles: 0,
  },
  topViolations: [],
  recommendations: [],
};
let mockStats: ViolationStats[] = [];
let mockPrunedCount = 0;
let mockStoreError: Error | null = null;
let mockAnalyzerError: Error | null = null;

// Mock dependencies
vi.mock('../../../../src/core/feedback/index.js', () => ({
  FeedbackStore: vi.fn(function() {
    return {
    exists: vi.fn().mockImplementation(async () => {
      if (mockStoreError) throw mockStoreError;
      return mockStoreExists;
    }),
    clear: vi.fn().mockImplementation(async () => {
      if (mockStoreError) throw mockStoreError;
    }),
    pruneOldEntries: vi.fn().mockImplementation(async () => {
      if (mockStoreError) throw mockStoreError;
      return mockPrunedCount;
    }),
  };
  }),
  FeedbackAnalyzer: vi.fn(function() {
    return {
    generateReport: vi.fn().mockImplementation(async () => {
      if (mockAnalyzerError) throw mockAnalyzerError;
      return mockReport;
    }),
    getViolationStats: vi.fn().mockImplementation(async () => {
      if (mockAnalyzerError) throw mockAnalyzerError;
      return mockStats;
    }),
  };
  }),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Mock process.cwd
vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

// Spy on console.log
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('feedback command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockStoreExists = true;
    mockReport = {
      period: { from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now(), days: 30 },
      summary: {
        totalViolations: 0,
        totalOverrides: 0,
        uniqueRules: 0,
        uniqueFiles: 0,
      },
      topViolations: [],
      recommendations: [],
    };
    mockStats = [];
    mockPrunedCount = 0;
    mockStoreError = null;
    mockAnalyzerError = null;

    // Reset mocks
    const feedback = await import('../../../../src/core/feedback/index.js');
    vi.mocked(feedback.FeedbackStore).mockImplementation(function() {
      return {
      exists: vi.fn().mockImplementation(async () => {
        if (mockStoreError) throw mockStoreError;
        return mockStoreExists;
      }),
      clear: vi.fn().mockImplementation(async () => {
        if (mockStoreError) throw mockStoreError;
      }),
      pruneOldEntries: vi.fn().mockImplementation(async () => {
        if (mockStoreError) throw mockStoreError;
        return mockPrunedCount;
      }),
    };
    });
    vi.mocked(feedback.FeedbackAnalyzer).mockImplementation(function() {
      return {
      generateReport: vi.fn().mockImplementation(async () => {
        if (mockAnalyzerError) throw mockAnalyzerError;
        return mockReport;
      }),
      getViolationStats: vi.fn().mockImplementation(async () => {
        if (mockAnalyzerError) throw mockAnalyzerError;
        return mockStats;
      }),
    };
    });
  });

  describe('createFeedbackCommand', () => {
    it('should create a command with correct name', () => {
      const command = createFeedbackCommand();
      expect(command.name()).toBe('feedback');
    });

    it('should have the correct description', () => {
      const command = createFeedbackCommand();
      expect(command.description()).toContain('violation');
    });

    it('should have subcommands', () => {
      const command = createFeedbackCommand();
      const subcommands = command.commands;

      const subcommandNames = subcommands.map((cmd) => cmd.name());
      expect(subcommandNames).toContain('report');
      expect(subcommandNames).toContain('stats');
      expect(subcommandNames).toContain('clear');
      expect(subcommandNames).toContain('prune');
    });
  });

  describe('report subcommand', () => {
    it('should warn when no feedback data exists', async () => {
      const feedback = await import('../../../../src/core/feedback/index.js');
      vi.mocked(feedback.FeedbackStore).mockImplementation(function() {
      return {
        exists: vi.fn().mockResolvedValue(false),
        clear: vi.fn(),
        pruneOldEntries: vi.fn(),
      };
    });

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const reportCmd = command.commands.find(c => c.name() === 'report')!;

      await expect(reportCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit');

      expect(logger.logger.warn).toHaveBeenCalledWith(
        'No feedback data found. Run "archcodex check --record-violations" first.'
      );
    });

    it('should output JSON when --json flag is provided', async () => {
      mockReport = {
        period: { from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now(), days: 30 },
        summary: {
          totalViolations: 5,
          totalOverrides: 2,
          uniqueRules: 3,
          uniqueFiles: 4,
        },
        topViolations: [],
        recommendations: [],
      };

      const command = createFeedbackCommand();
      const reportCmd = command.commands.find(c => c.name() === 'report')!;
      await reportCmd.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"totalViolations"')
      );
      expect(jsonCall).toBeDefined();
    });

    it('should generate human-readable report by default', async () => {
      mockReport = {
        period: { from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now(), days: 30 },
        summary: {
          totalViolations: 10,
          totalOverrides: 3,
          uniqueRules: 5,
          uniqueFiles: 8,
        },
        topViolations: [],
        recommendations: [],
      };

      const command = createFeedbackCommand();
      const reportCmd = command.commands.find(c => c.name() === 'report')!;
      await reportCmd.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ARCHCODEX FEEDBACK REPORT'));
    });

    it('should display top violations in report', async () => {
      mockReport = {
        period: { from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now(), days: 30 },
        summary: {
          totalViolations: 10,
          totalOverrides: 3,
          uniqueRules: 2,
          uniqueFiles: 5,
        },
        topViolations: [
          { rule: 'forbid_import', value: 'axios', count: 5, overrideCount: 2, affectedFiles: ['a.ts'] },
        ],
        recommendations: [],
      };

      const command = createFeedbackCommand();
      const reportCmd = command.commands.find(c => c.name() === 'report')!;
      await reportCmd.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Top Violated Constraints'));
    });

    it('should display recommendations when present', async () => {
      mockReport = {
        period: { from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now(), days: 30 },
        summary: {
          totalViolations: 10,
          totalOverrides: 3,
          uniqueRules: 2,
          uniqueFiles: 5,
        },
        topViolations: [],
        recommendations: [
          {
            type: 'relax_constraint',
            title: 'Consider relaxing forbid_import',
            description: 'This constraint is frequently overridden',
            suggestedAction: 'Add unless clause',
            evidence: { violationCount: 5, overrideCount: 3 },
          },
        ],
      };

      const command = createFeedbackCommand();
      const reportCmd = command.commands.find(c => c.name() === 'report')!;
      await reportCmd.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Recommendations'));
    });

    it('should handle errors gracefully', async () => {
      mockAnalyzerError = new Error('Analysis failed');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const reportCmd = command.commands.find(c => c.name() === 'report')!;

      await expect(reportCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalled();
    });
  });

  describe('stats subcommand', () => {
    it('should warn when no feedback data exists', async () => {
      const feedback = await import('../../../../src/core/feedback/index.js');
      vi.mocked(feedback.FeedbackStore).mockImplementation(function() {
      return {
        exists: vi.fn().mockResolvedValue(false),
        clear: vi.fn(),
        pruneOldEntries: vi.fn(),
      };
    });

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const statsCmd = command.commands.find(c => c.name() === 'stats')!;

      await expect(statsCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit');

      expect(logger.logger.warn).toHaveBeenCalledWith(
        'No feedback data found. Run "archcodex check --record-violations" first.'
      );
    });

    it('should output JSON when --json flag is provided', async () => {
      mockStats = [
        { rule: 'forbid_import', value: 'axios', count: 5, overrideCount: 2, affectedFiles: ['a.ts', 'b.ts'] },
      ];

      const command = createFeedbackCommand();
      const statsCmd = command.commands.find(c => c.name() === 'stats')!;
      await statsCmd.parseAsync(['node', 'test', '--json']);

      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"forbid_import"')
      );
      expect(jsonCall).toBeDefined();
    });

    it('should display stats table by default', async () => {
      mockStats = [
        { rule: 'forbid_import', value: 'axios', count: 5, overrideCount: 2, affectedFiles: ['a.ts', 'b.ts'] },
      ];

      const command = createFeedbackCommand();
      const statsCmd = command.commands.find(c => c.name() === 'stats')!;
      await statsCmd.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Violation Statistics'));
    });

    it('should show message when no violations found', async () => {
      mockStats = [];

      const command = createFeedbackCommand();
      const statsCmd = command.commands.find(c => c.name() === 'stats')!;
      await statsCmd.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalledWith('No violations found in the specified period.');
    });

    it('should filter by rule when --rule is provided', async () => {
      mockStats = [
        { rule: 'forbid_import', value: 'axios', count: 5, overrideCount: 2, affectedFiles: ['a.ts'] },
        { rule: 'forbid_pattern', value: 'console', count: 3, overrideCount: 1, affectedFiles: ['b.ts'] },
      ];

      const command = createFeedbackCommand();
      const statsCmd = command.commands.find(c => c.name() === 'stats')!;
      await statsCmd.parseAsync(['node', 'test', '--rule', 'forbid_import', '--json']);

      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('forbid_import')
      );
      expect(jsonCall).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      mockAnalyzerError = new Error('Stats failed');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const statsCmd = command.commands.find(c => c.name() === 'stats')!;

      await expect(statsCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalled();
    });
  });

  describe('clear subcommand', () => {
    it('should inform when no feedback data exists', async () => {
      const feedback = await import('../../../../src/core/feedback/index.js');
      vi.mocked(feedback.FeedbackStore).mockImplementation(function() {
      return {
        exists: vi.fn().mockResolvedValue(false),
        clear: vi.fn(),
        pruneOldEntries: vi.fn(),
      };
    });

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const clearCmd = command.commands.find(c => c.name() === 'clear')!;

      await expect(clearCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit');

      expect(logger.logger.info).toHaveBeenCalledWith('No feedback data to clear.');
    });

    it('should require --confirm flag', async () => {
      const feedback = await import('../../../../src/core/feedback/index.js');
      vi.mocked(feedback.FeedbackStore).mockImplementation(function() {
      return {
        exists: vi.fn().mockResolvedValue(true),
        clear: vi.fn(),
        pruneOldEntries: vi.fn(),
      };
    });

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const clearCmd = command.commands.find(c => c.name() === 'clear')!;

      await expect(clearCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit');

      expect(logger.logger.warn).toHaveBeenCalledWith('This will delete all recorded feedback data.');
      expect(logger.logger.info).toHaveBeenCalledWith('Use --confirm to proceed.');
    });

    it('should clear data when --confirm is provided', async () => {
      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const clearCmd = command.commands.find(c => c.name() === 'clear')!;
      await clearCmd.parseAsync(['node', 'test', '--confirm']);

      expect(logger.logger.info).toHaveBeenCalledWith('Feedback data cleared.');
    });

    it('should handle errors gracefully', async () => {
      mockStoreError = new Error('Clear failed');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const clearCmd = command.commands.find(c => c.name() === 'clear')!;

      await expect(clearCmd.parseAsync(['node', 'test', '--confirm'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalled();
    });
  });

  describe('prune subcommand', () => {
    it('should inform when no feedback data exists', async () => {
      const feedback = await import('../../../../src/core/feedback/index.js');
      vi.mocked(feedback.FeedbackStore).mockImplementation(function() {
      return {
        exists: vi.fn().mockResolvedValue(false),
        clear: vi.fn(),
        pruneOldEntries: vi.fn(),
      };
    });

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const pruneCmd = command.commands.find(c => c.name() === 'prune')!;

      await expect(pruneCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit');

      expect(logger.logger.info).toHaveBeenCalledWith('No feedback data to prune.');
    });

    it('should report pruned entries count', async () => {
      mockPrunedCount = 15;

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const pruneCmd = command.commands.find(c => c.name() === 'prune')!;
      await pruneCmd.parseAsync(['node', 'test']);

      expect(logger.logger.info).toHaveBeenCalledWith('Pruned 15 entries older than 90 days.');
    });

    it('should report when no entries pruned', async () => {
      mockPrunedCount = 0;

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const pruneCmd = command.commands.find(c => c.name() === 'prune')!;
      await pruneCmd.parseAsync(['node', 'test']);

      expect(logger.logger.info).toHaveBeenCalledWith('No old entries to prune.');
    });

    it('should use custom days option', async () => {
      mockPrunedCount = 5;

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const pruneCmd = command.commands.find(c => c.name() === 'prune')!;
      await pruneCmd.parseAsync(['node', 'test', '--days', '30']);

      expect(logger.logger.info).toHaveBeenCalledWith('Pruned 5 entries older than 30 days.');
    });

    it('should handle errors gracefully', async () => {
      mockStoreError = new Error('Prune failed');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createFeedbackCommand();
      const pruneCmd = command.commands.find(c => c.name() === 'prune')!;

      await expect(pruneCmd.parseAsync(['node', 'test'])).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalled();
    });
  });
});
