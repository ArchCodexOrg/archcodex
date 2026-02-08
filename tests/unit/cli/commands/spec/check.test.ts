/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for spec check subcommand registration and action execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCheckCommand } from '../../../../../src/cli/commands/spec/check.js';

// --- Configurable mock state ---
let mockRegistry: { nodes: Record<string, unknown> };
let mockGlobResult: string[];
let mockLoadSpecFileResult: {
  valid: boolean;
  specs: Array<{ specId: string }>;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
};
let mockValidationResult: { valid: boolean };

// --- Mocks ---
vi.mock('../../../../../src/core/spec/index.js', () => ({
  loadSpecRegistry: vi.fn(async () => mockRegistry),
  loadSpecFile: vi.fn(async () => mockLoadSpecFileResult),
  validateSpecRegistry: vi.fn(() => mockValidationResult),
  formatValidationSummary: vi.fn(() => 'validation summary output'),
}));

vi.mock('../../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(async () => mockGlobResult),
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
    green: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
  },
}));

import {
  loadSpecRegistry,
  loadSpecFile,
  validateSpecRegistry,
  formatValidationSummary,
} from '../../../../../src/core/spec/index.js';
import { globFiles } from '../../../../../src/utils/file-system.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('registerCheckCommand', () => {
  it('registers check subcommand on parent', () => {
    const parent = new Command('spec');
    registerCheckCommand(parent);

    const check = parent.commands.find(c => c.name() === 'check');
    expect(check).toBeDefined();
    expect(check!.description()).toContain('Validate');
  });

  it('check command has --strict option', () => {
    const parent = new Command('spec');
    registerCheckCommand(parent);

    const check = parent.commands.find(c => c.name() === 'check')!;
    const strictOption = check.options.find(o => o.long === '--strict');
    expect(strictOption).toBeDefined();
  });

  it('check command has --json option', () => {
    const parent = new Command('spec');
    registerCheckCommand(parent);

    const check = parent.commands.find(c => c.name() === 'check')!;
    const jsonOption = check.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('check command has --quiet option', () => {
    const parent = new Command('spec');
    registerCheckCommand(parent);

    const check = parent.commands.find(c => c.name() === 'check')!;
    const quietOption = check.options.find(o => o.long === '--quiet');
    expect(quietOption).toBeDefined();
  });

  it('check command accepts variadic files argument', () => {
    const parent = new Command('spec');
    registerCheckCommand(parent);

    const check = parent.commands.find(c => c.name() === 'check')!;
    expect(check.registeredArguments).toHaveLength(1);
    expect(check.registeredArguments[0].variadic).toBe(true);
  });
});

describe('check command action', () => {
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
    mockRegistry = { nodes: { 'spec.test': { description: 'Test' } } };
    mockGlobResult = [];
    mockLoadSpecFileResult = {
      valid: true,
      specs: [{ specId: 'spec.test.one' }],
      errors: [],
      warnings: [],
    };
    mockValidationResult = { valid: true };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('empty registry', () => {
    it('exits with 0 and warns when no specs found', async () => {
      mockRegistry = { nodes: {} };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check']);
      } catch {
        // process.exit
      }

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No specs found'));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('suppresses warning output in quiet mode', async () => {
      mockRegistry = { nodes: {} };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--quiet']);
      } catch {
        // process.exit
      }

      expect(logger.warn).not.toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('prints getting started instructions when not quiet', async () => {
      mockRegistry = { nodes: {} };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('_base.yaml');
    });
  });

  describe('full registry validation (no file patterns)', () => {
    it('calls validateSpecRegistry and outputs summary', async () => {
      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check']);
      } catch {
        // process.exit
      }

      expect(validateSpecRegistry).toHaveBeenCalledWith(mockRegistry, {
        strict: undefined,
      });
      expect(formatValidationSummary).toHaveBeenCalledWith(mockValidationResult);
    });

    it('exits with 0 when validation passes', async () => {
      mockValidationResult = { valid: true };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check']);
      } catch {
        // process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with 1 when validation fails', async () => {
      mockValidationResult = { valid: false };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('passes strict option to validateSpecRegistry', async () => {
      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--strict']);
      } catch {
        // process.exit
      }

      expect(validateSpecRegistry).toHaveBeenCalledWith(mockRegistry, {
        strict: true,
      });
    });

    it('outputs JSON when --json flag is used', async () => {
      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--json']);
      } catch {
        // process.exit
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
  });

  describe('specific file validation', () => {
    it('globs the provided file patterns', async () => {
      mockGlobResult = ['/test-project/.arch/specs/user.spec.yaml'];

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      expect(globFiles).toHaveBeenCalledWith(
        ['.arch/specs/*.yaml'],
        { cwd: '/test-project' },
      );
    });

    it('shows green checkmark for valid spec files', async () => {
      mockGlobResult = ['/test-project/.arch/specs/user.spec.yaml'];
      mockLoadSpecFileResult = {
        valid: true,
        specs: [{ specId: 'spec.user' }],
        errors: [],
        warnings: [],
      };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('.arch/specs/user.spec.yaml');
    });

    it('shows spec count for valid files when not quiet', async () => {
      mockGlobResult = ['/test-project/.arch/specs/user.spec.yaml'];
      mockLoadSpecFileResult = {
        valid: true,
        specs: [{ specId: 'spec.user.create' }, { specId: 'spec.user.delete' }],
        errors: [],
        warnings: [],
      };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('2 spec(s)');
      expect(output).toContain('spec.user.create');
    });

    it('shows errors for invalid spec files', async () => {
      mockGlobResult = ['/test-project/.arch/specs/bad.spec.yaml'];
      mockLoadSpecFileResult = {
        valid: false,
        specs: [],
        errors: [{ code: 'INVALID_SCHEMA', message: 'Missing required field: goal' }],
        warnings: [],
      };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yaml']);
      } catch {
        // Expected - process.exit(1) due to errors
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('INVALID_SCHEMA');
      expect(output).toContain('Missing required field: goal');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('shows warnings when not quiet', async () => {
      mockGlobResult = ['/test-project/.arch/specs/warn.spec.yaml'];
      mockLoadSpecFileResult = {
        valid: true,
        specs: [{ specId: 'spec.warn' }],
        errors: [],
        warnings: [{ code: 'MISSING_EXAMPLES', message: 'No examples defined' }],
      };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('MISSING_EXAMPLES');
      expect(output).toContain('No examples defined');
    });

    it('suppresses warnings in quiet mode', async () => {
      mockGlobResult = ['/test-project/.arch/specs/warn.spec.yaml'];
      mockLoadSpecFileResult = {
        valid: true,
        specs: [{ specId: 'spec.warn' }],
        errors: [],
        warnings: [{ code: 'MISSING_EXAMPLES', message: 'No examples defined' }],
      };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--quiet', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).not.toContain('MISSING_EXAMPLES');
    });

    it('outputs JSON for file validation when --json flag used', async () => {
      mockGlobResult = ['/test-project/.arch/specs/user.spec.yaml'];
      mockLoadSpecFileResult = {
        valid: true,
        specs: [{ specId: 'spec.user' }],
        errors: [],
        warnings: [],
      };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--json', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
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

    it('exits with 0 when all files are valid', async () => {
      mockGlobResult = ['/test-project/.arch/specs/good.spec.yaml'];
      mockLoadSpecFileResult = {
        valid: true,
        specs: [{ specId: 'spec.good' }],
        errors: [],
        warnings: [],
      };

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('skips fixture files with informational message', async () => {
      mockGlobResult = ['/test-project/.arch/specs/_fixtures.yaml'];

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('fixture file');
      expect(loadSpecFile).not.toHaveBeenCalled();
    });

    it('skips fixture files silently in quiet mode', async () => {
      mockGlobResult = ['/test-project/.arch/specs/_fixtures.yaml'];

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--quiet', '.arch/specs/*.yaml']);
      } catch {
        // process.exit
      }

      const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).not.toContain('fixture file');
    });

    it('also skips _fixtures.yml extension', async () => {
      mockGlobResult = ['/test-project/.arch/specs/_fixtures.yml'];

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '.arch/specs/*.yml']);
      } catch {
        // process.exit
      }

      expect(loadSpecFile).not.toHaveBeenCalled();
    });

    it('handles multiple file patterns', async () => {
      vi.mocked(globFiles)
        .mockResolvedValueOnce(['/test-project/.arch/specs/a.yaml'])
        .mockResolvedValueOnce(['/test-project/.arch/specs/b.yaml']);

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'check',
          '.arch/specs/a.yaml', '.arch/specs/b.yaml',
        ]);
      } catch {
        // process.exit
      }

      expect(loadSpecFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('logs error and exits with 1 when an exception occurs', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValueOnce(new Error('Parse failure'));

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Parse failure'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when --json and exception occurs', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValueOnce(new Error('Parse failure'));

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--json']);
      } catch {
        // Expected
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('exits with 1 when an exception occurs in JSON mode', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValueOnce(new Error('Unexpected'));

      const parent = new Command('spec');
      registerCheckCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'check', '--json']);
      } catch {
        // Expected
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
