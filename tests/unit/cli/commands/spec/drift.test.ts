/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for spec drift subcommand registration and action execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerDriftCommand } from '../../../../../src/cli/commands/spec/drift.js';

// --- Configurable mock state ---
let mockRegistry: { nodes: Record<string, unknown> };
let mockUnwiredResult: {
  unwired: Array<{ specId: string; hasExamples: boolean; suggestedPath: string | null }>;
  coverage: { percentage: number; wired: number; total: number };
};
let mockDriftReport: {
  formattedOutput: string;
  valid: boolean;
  issues: Array<{ specId?: string; path?: string; suggestion?: string }>;
};

// --- Mocks ---
vi.mock('../../../../../src/core/spec/index.js', () => ({
  loadSpecRegistry: vi.fn(async () => mockRegistry),
  findUnwiredSpecs: vi.fn(() => mockUnwiredResult),
  formatUnwiredReport: vi.fn(() => 'formatted unwired report'),
  generateDriftReport: vi.fn(async () => mockDriftReport),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    blue: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    green: (s: string) => s,
  },
}));

import {
  loadSpecRegistry,
  findUnwiredSpecs,
  formatUnwiredReport,
  generateDriftReport,
} from '../../../../../src/core/spec/index.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('registerDriftCommand', () => {
  it('registers drift subcommand on parent', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift');
    expect(drift).toBeDefined();
    expect(drift!.description()).toContain('gaps');
  });

  it('drift command has --format option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const formatOption = drift.options.find(o => o.long === '--format');
    expect(formatOption).toBeDefined();
  });

  it('drift command has --full option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const fullOption = drift.options.find(o => o.long === '--full');
    expect(fullOption).toBeDefined();
  });

  it('drift command has --pattern option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const patternOption = drift.options.find(o => o.long === '--pattern');
    expect(patternOption).toBeDefined();
  });

  it('drift command has --fix option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const fixOption = drift.options.find(o => o.long === '--fix');
    expect(fixOption).toBeDefined();
  });

  it('drift command has --strict option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const strictOption = drift.options.find(o => o.long === '--strict');
    expect(strictOption).toBeDefined();
  });

  it('drift command has --include-base option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const includeBaseOption = drift.options.find(o => o.long === '--include-base');
    expect(includeBaseOption).toBeDefined();
  });

  it('drift command has --undocumented option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const undocumentedOption = drift.options.find(o => o.long === '--undocumented');
    expect(undocumentedOption).toBeDefined();
  });

  it('drift command has --scan-patterns option', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const scanPatternsOption = drift.options.find(o => o.long === '--scan-patterns');
    expect(scanPatternsOption).toBeDefined();
  });

  it('format option defaults to terminal', () => {
    const parent = new Command('spec');
    registerDriftCommand(parent);

    const drift = parent.commands.find(c => c.name() === 'drift')!;
    const formatOption = drift.options.find(o => o.long === '--format');
    expect(formatOption!.defaultValue).toBe('terminal');
  });
});

describe('drift command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test-project');

    // Reset mock state
    mockRegistry = { nodes: { 'spec.test': { description: 'A test spec' } } };
    mockUnwiredResult = {
      unwired: [],
      coverage: { percentage: 100, wired: 5, total: 5 },
    };
    mockDriftReport = {
      formattedOutput: 'drift report output',
      valid: true,
      issues: [],
    };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('default unwired-only mode', () => {
    it('loads the spec registry from current working directory', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift']);
      } catch {
        // process.exit throws
      }

      expect(loadSpecRegistry).toHaveBeenCalledWith('/test-project');
    });

    it('calls findUnwiredSpecs with default options', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift']);
      } catch {
        // process.exit throws
      }

      expect(findUnwiredSpecs).toHaveBeenCalledWith(mockRegistry, {
        includeBase: false,
        pattern: undefined,
      });
    });

    it('calls formatUnwiredReport for terminal output', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift']);
      } catch {
        // process.exit throws
      }

      expect(formatUnwiredReport).toHaveBeenCalledWith(mockUnwiredResult);
    });

    it('exits with 0 when no unwired specs found', async () => {
      mockUnwiredResult.unwired = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift']);
      } catch {
        // process.exit throws
      }

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('exits with 1 when unwired specs are found', async () => {
      mockUnwiredResult.unwired = [
        { specId: 'spec.foo.bar', hasExamples: true, suggestedPath: 'src/foo/bar.ts' },
      ];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('passes --pattern filter to findUnwiredSpecs', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--pattern', 'auth.*']);
      } catch {
        // process.exit throws
      }

      expect(findUnwiredSpecs).toHaveBeenCalledWith(mockRegistry, {
        includeBase: false,
        pattern: 'auth.*',
      });
    });

    it('passes --include-base flag to findUnwiredSpecs', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--include-base']);
      } catch {
        // process.exit throws
      }

      expect(findUnwiredSpecs).toHaveBeenCalledWith(mockRegistry, {
        includeBase: true,
        pattern: undefined,
      });
    });
  });

  describe('JSON output format', () => {
    it('outputs result as JSON when --format json is used', async () => {
      mockUnwiredResult.unwired = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--format', 'json']);
      } catch {
        // process.exit throws
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('exits with 1 in JSON mode when unwired specs exist', async () => {
      mockUnwiredResult.unwired = [
        { specId: 'spec.foo', hasExamples: false, suggestedPath: null },
      ];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--format', 'json']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('exits with 1 in JSON mode when --strict even with no unwired', async () => {
      mockUnwiredResult.unwired = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--format', 'json', '--strict']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('markdown output format', () => {
    it('outputs markdown header and coverage info', async () => {
      mockUnwiredResult.unwired = [];
      mockUnwiredResult.coverage = { percentage: 85, wired: 17, total: 20 };

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--format', 'markdown']);
      } catch {
        // process.exit throws
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('# Spec Drift Report');
      expect(output).toContain('85%');
      expect(output).toContain('17/20');
    });

    it('outputs markdown table for unwired specs', async () => {
      mockUnwiredResult.unwired = [
        { specId: 'spec.user.create', hasExamples: true, suggestedPath: 'src/user/create.ts' },
      ];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--format', 'markdown']);
      } catch {
        // Expected - process.exit(1)
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('## Unwired Specs');
      expect(output).toContain('spec.user.create');
    });

    it('outputs "All specs are wired" when none unwired', async () => {
      mockUnwiredResult.unwired = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--format', 'markdown']);
      } catch {
        // process.exit throws
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('All specs are wired');
    });

    it('exits with 1 in markdown mode when --strict even with no unwired', async () => {
      mockUnwiredResult.unwired = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--format', 'markdown', '--strict']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('--fix mode (default unwired)', () => {
    it('shows fix suggestions when unwired specs exist', async () => {
      mockUnwiredResult.unwired = [
        { specId: 'spec.user.create', hasExamples: true, suggestedPath: 'src/user/create.ts' },
      ];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--fix']);
      } catch {
        // Expected - process.exit(1)
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Suggestions');
      expect(output).toContain('spec.user.create');
    });

    it('does not show fix suggestions when no unwired specs', async () => {
      mockUnwiredResult.unwired = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--fix']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).not.toContain('Suggestions to fix');
    });

    it('limits fix suggestions to 10 and shows overflow message', async () => {
      mockUnwiredResult.unwired = Array.from({ length: 12 }, (_, i) => ({
        specId: `spec.item.${i}`,
        hasExamples: false,
        suggestedPath: `src/item/${i}.ts`,
      }));

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--fix']);
      } catch {
        // Expected
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('... and 2 more');
    });
  });

  describe('--full mode', () => {
    it('calls generateDriftReport with correct options', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full']);
      } catch {
        // process.exit
      }

      expect(generateDriftReport).toHaveBeenCalledWith(
        '/test-project',
        mockRegistry,
        expect.objectContaining({
          includeSignatureCheck: true,
          format: 'terminal',
          includeBase: false,
        }),
      );
    });

    it('outputs formatted drift report for terminal', async () => {
      mockDriftReport.formattedOutput = 'full drift terminal output';

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('full drift terminal output');
    });

    it('outputs JSON directly in --full --format json mode', async () => {
      mockDriftReport.formattedOutput = '{"issues": []}';

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full', '--format', 'json']);
      } catch {
        // process.exit
      }

      expect(consoleLogSpy).toHaveBeenCalledWith('{"issues": []}');
    });

    it('outputs markdown directly in --full --format markdown mode', async () => {
      mockDriftReport.formattedOutput = '# Full Drift Report\n\nContent here';

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full', '--format', 'markdown']);
      } catch {
        // process.exit
      }

      expect(consoleLogSpy).toHaveBeenCalledWith('# Full Drift Report\n\nContent here');
    });

    it('colors ERROR/WARNING/INFO keywords for terminal output', async () => {
      mockDriftReport.formattedOutput = '  ERROR something\n  WARNING foo\n  INFO bar';

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full']);
      } catch {
        // process.exit
      }

      // chalk is mocked to passthrough, so the output should still have the text
      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('ERROR');
      expect(output).toContain('WARNING');
      expect(output).toContain('INFO');
    });

    it('passes --scan-patterns as comma-separated patterns', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'drift', '--full',
          '--scan-patterns', 'src/**/*.ts,lib/**/*.js',
        ]);
      } catch {
        // process.exit
      }

      expect(generateDriftReport).toHaveBeenCalledWith(
        '/test-project',
        mockRegistry,
        expect.objectContaining({
          patterns: ['src/**/*.ts', 'lib/**/*.js'],
        }),
      );
    });

    it('exits with 0 when report is valid and not strict', async () => {
      mockDriftReport.valid = true;
      mockDriftReport.issues = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full']);
      } catch {
        // process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with 1 when report has issues', async () => {
      mockDriftReport.valid = false;
      mockDriftReport.issues = [{ specId: 'spec.a', suggestion: 'fix it' }];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('shows fix suggestions in full mode when --fix and issues exist', async () => {
      mockDriftReport.issues = [
        { specId: 'spec.broken', suggestion: 'Add implementation field' },
        { specId: 'spec.missing', path: 'src/missing.ts' },
      ];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full', '--fix']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Suggestions');
      expect(output).toContain('spec.broken');
      expect(output).toContain('Add implementation field');
    });

    it('limits full mode fix suggestions to 10 and shows overflow', async () => {
      mockDriftReport.issues = Array.from({ length: 15 }, (_, i) => ({
        specId: `spec.item.${i}`,
        suggestion: `Fix #${i}`,
      }));

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full', '--fix']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('... and more');
    });

    it('does not show fix suggestions when --fix but no issues exist', async () => {
      mockDriftReport.issues = [];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full', '--fix']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).not.toContain('Suggestions');
    });

    it('shows suggestion header but skips issues without suggestion text', async () => {
      mockDriftReport.issues = [
        { specId: 'spec.nofix' },
      ];

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--full', '--fix']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      // Suggestions header is shown because issues.length > 0, but no suggestions are printed
      expect(output).toContain('Suggestions');
      expect(output).not.toContain('spec.nofix');
    });
  });

  describe('--undocumented mode', () => {
    it('calls generateDriftReport with signature check disabled', async () => {
      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift', '--undocumented']);
      } catch {
        // process.exit
      }

      expect(generateDriftReport).toHaveBeenCalledWith(
        '/test-project',
        mockRegistry,
        expect.objectContaining({
          includeSignatureCheck: false,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('logs error message and exits with 1 when registry load fails', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValueOnce(new Error('No specs directory'));

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('No specs directory');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('logs "Unknown error" for non-Error exceptions', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValueOnce('string error');

      const parent = new Command('spec');
      registerDriftCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'drift']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });
});
