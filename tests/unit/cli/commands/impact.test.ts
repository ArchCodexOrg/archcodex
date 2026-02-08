/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the impact command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createImpactCommand } from '../../../../src/cli/commands/impact.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockBehavior = {
  graphNodes: new Map<string, { archId?: string }>(),
  importers: [] as { filePath: string; archId?: string | null }[],
  dependents: new Set<string>(),
  buildError: null as Error | null,
};

// Track if dispose was called
let disposeWasCalled = false;

// Mock dependencies
vi.mock('../../../../src/core/imports/analyzer.js', () => ({
  ProjectAnalyzer: vi.fn(function() {
    return {
    buildImportGraph: vi.fn().mockImplementation(async () => {
      if (mockBehavior.buildError) {
        throw mockBehavior.buildError;
      }
      return {
        graph: {
          nodes: mockBehavior.graphNodes,
          edges: [],
        },
      };
    }),
    getImporters: vi.fn().mockImplementation(() => mockBehavior.importers),
    getDependents: vi.fn().mockImplementation(() => mockBehavior.dependents),
    dispose: vi.fn().mockImplementation(() => {
      disposeWasCalled = true;
    }),
  };
  }),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ProjectAnalyzer } from '../../../../src/core/imports/analyzer.js';
import { logger } from '../../../../src/utils/logger.js';

describe('impact command', () => {
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

    // Reset mock behavior
    mockBehavior = {
      graphNodes: new Map(),
      importers: [],
      dependents: new Set(),
      buildError: null,
    };
    disposeWasCalled = false;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createImpactCommand', () => {
    it('should create a command with correct name', () => {
      const command = createImpactCommand();
      expect(command.name()).toBe('impact');
    });

    it('should have the correct description', () => {
      const command = createImpactCommand();
      expect(command.description()).toBe('Show what files depend on a file - call BEFORE refactoring');
    });

    it('should have a required file argument', () => {
      const command = createImpactCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('file');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createImpactCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--depth');
      expect(optionNames).toContain('--json');
    });

    it('should have correct default for depth option', () => {
      const command = createImpactCommand();
      const depthOption = command.options.find((opt) => opt.long === '--depth');
      expect(depthOption?.defaultValue).toBe('2');
    });
  });

  describe('command execution', () => {
    it('should create ProjectAnalyzer with project root', async () => {
      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(ProjectAnalyzer).toHaveBeenCalledWith('/project');
    });

    it('should show "Building import graph..." message', async () => {
      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Building import graph'))).toBe(true);
    });

    it('should dispose analyzer after use', async () => {
      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      expect(disposeWasCalled).toBe(true);
    });
  });

  describe('human-readable output', () => {
    it('should show impact analysis header', async () => {
      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Impact Analysis:'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/file.ts'))).toBe(true);
    });

    it('should show direct importers count', async () => {
      mockBehavior.importers = [
        { filePath: '/project/src/a.ts', archId: 'arch.a' },
        { filePath: '/project/src/b.ts', archId: 'arch.b' },
      ];

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Direct importers:') && c?.includes('2'))).toBe(true);
    });

    it('should show total dependents count', async () => {
      mockBehavior.dependents = new Set(['/project/src/a.ts', '/project/src/b.ts', '/project/src/c.ts']);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Total dependents:') && c?.includes('3'))).toBe(true);
    });

    it('should show high impact warning when many dependents', async () => {
      mockBehavior.dependents = new Set(
        Array.from({ length: 15 }, (_, i) => `/project/src/file${i}.ts`)
      );

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('High impact'))).toBe(true);
      expect(calls.some((c) => c?.includes('15 files depend'))).toBe(true);
    });

    it('should not show high impact warning for few dependents', async () => {
      mockBehavior.dependents = new Set(['/project/src/a.ts', '/project/src/b.ts']);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('High impact'))).toBe(false);
    });

    it('should list direct importers', async () => {
      mockBehavior.importers = [
        { filePath: '/project/src/consumer.ts', archId: 'arch.consumer' },
      ];

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Imported by:'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/consumer.ts'))).toBe(true);
      expect(calls.some((c) => c?.includes('arch.consumer'))).toBe(true);
    });

    it('should truncate long importer lists', async () => {
      mockBehavior.importers = Array.from({ length: 20 }, (_, i) => ({
        filePath: `/project/src/file${i}.ts`,
        archId: 'arch.test',
      }));

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('... and 5 more'))).toBe(true);
    });

    it('should show architecture breakdown for many dependents', async () => {
      mockBehavior.graphNodes = new Map([
        ['/project/src/a.ts', { archId: 'arch.a' }],
        ['/project/src/b.ts', { archId: 'arch.a' }],
        ['/project/src/c.ts', { archId: 'arch.b' }],
        ['/project/src/d.ts', { archId: 'arch.a' }],
        ['/project/src/e.ts', { archId: 'arch.c' }],
        ['/project/src/f.ts', { archId: 'arch.b' }],
      ]);
      mockBehavior.dependents = new Set([
        '/project/src/a.ts',
        '/project/src/b.ts',
        '/project/src/c.ts',
        '/project/src/d.ts',
        '/project/src/e.ts',
        '/project/src/f.ts',
      ]);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Dependents by architecture:'))).toBe(true);
      expect(calls.some((c) => c?.includes('arch.a') && c?.includes('3 files'))).toBe(true);
    });

    it('should show "safe to modify" when no dependents', async () => {
      mockBehavior.dependents = new Set();

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No dependents - safe to modify'))).toBe(true);
    });

    it('should show tip about running check on dependents', async () => {
      mockBehavior.dependents = new Set(['/project/src/consumer.ts']);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('archcodex check'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is provided', async () => {
      mockBehavior.importers = [{ filePath: '/project/src/a.ts', archId: 'arch.a' }];
      mockBehavior.dependents = new Set(['/project/src/a.ts']);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.file).toBe('src/file.ts');
    });

    it('should include directImporters count in JSON', async () => {
      mockBehavior.importers = [
        { filePath: '/project/src/a.ts', archId: 'arch.a' },
        { filePath: '/project/src/b.ts', archId: 'arch.b' },
      ];

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.directImporters).toBe(2);
    });

    it('should include totalDependents in JSON', async () => {
      mockBehavior.dependents = new Set([
        '/project/src/a.ts',
        '/project/src/b.ts',
        '/project/src/c.ts',
      ]);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.totalDependents).toBe(3);
    });

    it('should include transitiveDepth in JSON', async () => {
      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json', '--depth', '5']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.transitiveDepth).toBe(5);
    });

    it('should include importedBy array when importers exist', async () => {
      mockBehavior.importers = [
        { filePath: '/project/src/consumer.ts', archId: 'arch.consumer' },
      ];

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.importedBy).toEqual([
        { file: 'src/consumer.ts', architecture: 'arch.consumer' },
      ]);
    });

    it('should show "untagged" for files without archId', async () => {
      mockBehavior.importers = [{ filePath: '/project/src/untagged.ts', archId: null }];

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.importedBy[0].architecture).toBe('untagged');
    });

    it('should include dependentsByArchitecture for many dependents', async () => {
      mockBehavior.graphNodes = new Map([
        ['/project/src/a.ts', { archId: 'arch.a' }],
        ['/project/src/b.ts', { archId: 'arch.a' }],
        ['/project/src/c.ts', { archId: 'arch.b' }],
        ['/project/src/d.ts', { archId: 'arch.a' }],
        ['/project/src/e.ts', { archId: 'arch.c' }],
        ['/project/src/f.ts', { archId: 'arch.b' }],
      ]);
      mockBehavior.dependents = new Set([
        '/project/src/a.ts',
        '/project/src/b.ts',
        '/project/src/c.ts',
        '/project/src/d.ts',
        '/project/src/e.ts',
        '/project/src/f.ts',
      ]);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.dependentsByArchitecture).toEqual({
        'arch.a': 3,
        'arch.b': 2,
        'arch.c': 1,
      });
    });

    it('should include warning for high impact', async () => {
      mockBehavior.dependents = new Set(
        Array.from({ length: 15 }, (_, i) => `/project/src/file${i}.ts`)
      );

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.warning).toBeDefined();
      expect(output.warning).toContain('High impact');
      expect(output.warning).toContain('15');
    });

    it('should not include warning for low impact', async () => {
      mockBehavior.dependents = new Set(['/project/src/a.ts', '/project/src/b.ts']);

      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.warning).toBeUndefined();
    });

    it('should not show "Building" message in JSON mode', async () => {
      const command = createImpactCommand();
      await command.parseAsync(['node', 'test', 'src/file.ts', '--json']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Building'))).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      vi.mocked(ProjectAnalyzer).mockImplementation(function() {
        throw new Error('Failed to analyze');
      });

      const command = createImpactCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Failed to analyze');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(ProjectAnalyzer).mockImplementation(function() {
        throw 'string error';
      });

      const command = createImpactCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle buildImportGraph errors', async () => {
      mockBehavior.buildError = new Error('Build failed');

      const command = createImpactCommand();

      try {
        await command.parseAsync(['node', 'test', 'src/file.ts']);
      } catch {
        // Expected - process.exit throws
      }

      // Error handling is triggered
      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
