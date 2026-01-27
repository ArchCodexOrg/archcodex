/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the simulate command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSimulateCommand } from '../../../../src/cli/commands/simulate.js';
import type { SimulationResult, RiskLevel } from '../../../../src/core/simulate/types.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    red: Object.assign((s: string) => s, {
      bold: (s: string) => s,
      bgRed: { white: { bold: (s: string) => s } },
    }),
    green: Object.assign((s: string) => s, {
      bold: (s: string) => s,
    }),
    blue: (s: string) => s,
    bgRed: { white: { bold: (s: string) => s } },
  },
}));

// Configurable mock behavior
let mockSimulationResult: SimulationResult;
let mockFileExists = true;
let mockRegistryChanges = {
  added: [] as Array<{ archId: string }>,
  modified: [] as Array<{ archId: string; description: string }>,
  removed: [] as Array<{ archId: string }>,
};

function createBaseResult(): SimulationResult {
  return {
    summary: {
      filesScanned: 100,
      currentlyPassing: 90,
      currentlyFailing: 10,
      wouldBreak: 0,
      wouldFix: 0,
      unchanged: 90,
      newCoverage: 0,
      riskLevel: 'low' as RiskLevel,
    },
    diff: {
      added: [],
      removed: [],
      modified: [],
    },
    wouldBreak: [],
    wouldFix: [],
    recommendations: [],
    fromRef: 'current',
    toRef: 'proposed',
  };
}

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: { source_patterns: ['src/**/*.ts'] },
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
}));

vi.mock('../../../../src/core/diff/git-loader.js', () => ({
  loadRegistryFromRef: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
}));

vi.mock('../../../../src/core/simulate/index.js', () => ({
  SimulationAnalyzer: vi.fn().mockImplementation(() => ({
    simulate: vi.fn().mockImplementation(async () => mockSimulationResult),
  })),
  formatRegistryChanges: vi.fn().mockImplementation(() => mockRegistryChanges),
}));

vi.mock('../../../../src/utils/yaml.js', () => ({
  loadYamlWithSchema: vi.fn().mockResolvedValue({
    architectures: {},
    mixins: {},
  }),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  fileExists: vi.fn().mockImplementation(async () => mockFileExists),
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

import { SimulationAnalyzer, formatRegistryChanges } from '../../../../src/core/simulate/index.js';
import { loadRegistryFromRef } from '../../../../src/core/diff/git-loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { fileExists } from '../../../../src/utils/file-system.js';
import { loadYamlWithSchema } from '../../../../src/utils/yaml.js';
import { logger } from '../../../../src/utils/logger.js';

describe('simulate command', () => {
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
    mockSimulationResult = createBaseResult();
    mockFileExists = true;
    mockRegistryChanges = {
      added: [],
      modified: [],
      removed: [],
    };

    // Reset mocks
    vi.mocked(SimulationAnalyzer).mockImplementation(() => ({
      simulate: vi.fn().mockImplementation(async () => mockSimulationResult),
    }) as any);
    vi.mocked(formatRegistryChanges).mockImplementation(() => mockRegistryChanges);
    vi.mocked(fileExists).mockImplementation(async () => mockFileExists);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createSimulateCommand', () => {
    it('should create a command with correct name', () => {
      const command = createSimulateCommand();
      expect(command.name()).toBe('simulate');
    });

    it('should have the correct description', () => {
      const command = createSimulateCommand();
      expect(command.description()).toContain('impact');
    });

    it('should have an optional proposed-registry argument', () => {
      const command = createSimulateCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('proposed-registry');
      expect(args[0].required).toBe(false);
    });

    it('should have required options', () => {
      const command = createSimulateCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--from');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--max-files');
      expect(optionNames).toContain('--include');
    });
  });

  describe('command execution with proposed file', () => {
    it('should load proposed registry from file', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected - process.exit throws
      }

      expect(loadYamlWithSchema).toHaveBeenCalled();
    });

    it('should use current registry as base', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(loadRegistry).toHaveBeenCalled();
    });

    it('should create SimulationAnalyzer', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(SimulationAnalyzer).toHaveBeenCalled();
    });

    it('should error when file not found', async () => {
      mockFileExists = false;

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'nonexistent.yaml']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('command execution with --from git ref', () => {
    it('should load registry from git ref', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', '--from', 'main']);
      } catch {
        // Expected
      }

      expect(loadRegistryFromRef).toHaveBeenCalledWith('/project', 'main');
    });

    it('should use current registry as proposed when only --from is set', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', '--from', 'HEAD~1']);
      } catch {
        // Expected
      }

      // Should load both from ref and current
      expect(loadRegistryFromRef).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
    });
  });

  describe('missing arguments', () => {
    it('should error when neither file nor --from is provided', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('provide a proposed registry file or use --from')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is set', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml', '--json']);
      } catch {
        // Expected
      }

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe('human output', () => {
    it('should show simulation header', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('SIMULATION REPORT'))).toBe(true);
    });

    it('should show registry changes section', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Registry Changes'))).toBe(true);
    });

    it('should show added architectures', async () => {
      mockRegistryChanges = {
        added: [{ archId: 'new.arch' }],
        modified: [],
        removed: [],
      };

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('ADDED:'))).toBe(true);
      expect(calls.some((c) => c?.includes('new.arch'))).toBe(true);
    });

    it('should show modified architectures', async () => {
      mockRegistryChanges = {
        added: [],
        modified: [{ archId: 'mod.arch', description: 'changed constraints' }],
        removed: [],
      };

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MODIFIED:'))).toBe(true);
    });

    it('should show removed architectures', async () => {
      mockRegistryChanges = {
        added: [],
        modified: [],
        removed: [{ archId: 'old.arch' }],
      };

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('REMOVED:'))).toBe(true);
    });

    it('should show no changes message when empty', async () => {
      mockRegistryChanges = {
        added: [],
        modified: [],
        removed: [],
      };

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No architecture changes'))).toBe(true);
    });

    it('should show impact analysis section', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Impact Analysis'))).toBe(true);
      expect(calls.some((c) => c?.includes('Files scanned'))).toBe(true);
    });

    it('should show breaking changes', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.wouldBreak = 3;
      mockSimulationResult.wouldBreak = [
        { file: 'src/broken.ts', reason: 'new constraint violation' },
      ];

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('BREAK'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/broken.ts'))).toBe(true);
    });

    it('should show fixed files', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.wouldFix = 2;
      mockSimulationResult.wouldFix = [
        { file: 'src/fixed.ts', reason: 'constraint removed' },
      ];

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('FIX'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/fixed.ts'))).toBe(true);
    });

    it('should show new coverage', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.newCoverage = 5;

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('New coverage'))).toBe(true);
    });

    it('should show recommendations', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.recommendations = ['Review breaking changes before merging'];

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Recommendations'))).toBe(true);
      expect(calls.some((c) => c?.includes('Review breaking changes'))).toBe(true);
    });

    it('should truncate long lists without --verbose', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.wouldBreak = 10;
      mockSimulationResult.wouldBreak = Array(10).fill(null).map((_, i) => ({
        file: `src/file${i}.ts`,
        reason: 'violation',
      }));

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('... and 5 more'))).toBe(true);
    });

    it('should show all files with --verbose', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.wouldBreak = 10;
      mockSimulationResult.wouldBreak = Array(10).fill(null).map((_, i) => ({
        file: `src/file${i}.ts`,
        reason: 'violation',
      }));

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml', '--verbose']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('src/file9.ts'))).toBe(true);
    });
  });

  describe('risk level exit codes', () => {
    it('should exit 0 for low risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'low';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit 0 for medium risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'medium';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit 0 for high risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'high';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit 1 for critical risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'critical';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('risk level display', () => {
    it('should show LOW for low risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'low';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('LOW'))).toBe(true);
    });

    it('should show MEDIUM for medium risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'medium';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('MEDIUM'))).toBe(true);
    });

    it('should show HIGH for high risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'high';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('HIGH'))).toBe(true);
    });

    it('should show CRITICAL for critical risk', async () => {
      mockSimulationResult = createBaseResult();
      mockSimulationResult.summary.riskLevel = 'critical';

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('CRITICAL'))).toBe(true);
    });
  });

  describe('options passthrough', () => {
    it('should pass max-files to analyzer', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml', '--max-files', '50']);
      } catch {
        // Expected
      }

      const analyzerInstance = vi.mocked(SimulationAnalyzer).mock.results[0].value;
      expect(analyzerInstance.simulate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ maxFiles: 50 })
      );
    });

    it('should pass include patterns to analyzer', async () => {
      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml', '--include', 'src/**/*.ts']);
      } catch {
        // Expected
      }

      const analyzerInstance = vi.mocked(SimulationAnalyzer).mock.results[0].value;
      expect(analyzerInstance.simulate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ filePatterns: ['src/**/*.ts'] })
      );
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors', async () => {
      vi.mocked(SimulationAnalyzer).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unexpected error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(SimulationAnalyzer).mockImplementation(() => {
        throw 'string error';
      });

      const command = createSimulateCommand();

      try {
        await command.parseAsync(['node', 'test', 'proposed.yaml']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
