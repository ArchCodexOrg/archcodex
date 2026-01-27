/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the promote command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPromoteCommand } from '../../../../src/cli/commands/promote.js';
import type { PromoteResult } from '../../../../src/core/promote/index.js';

// Module-level mock results
let mockPromoteResult: PromoteResult = {
  applied: false,
  intentChange: { isNew: false, name: 'test' },
  registryChanges: [],
  fileChanges: [],
  warnings: [],
  errors: [],
};
let mockPromoteError: Error | null = null;

// Mock dependencies
vi.mock('../../../../src/core/promote/index.js', () => ({
  PromoteEngine: vi.fn().mockImplementation(() => ({
    promote: vi.fn().mockImplementation(async () => {
      if (mockPromoteError) throw mockPromoteError;
      return mockPromoteResult;
    }),
  })),
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

vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
  },
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// Mock process.cwd
vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

// Spy on console.log and console.error
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('promote command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPromoteResult = {
      applied: false,
      intentChange: { isNew: false, name: 'test' },
      registryChanges: [],
      fileChanges: [],
      warnings: [],
      errors: [],
    };
    mockPromoteError = null;

    // Reset mock
    const promote = await import('../../../../src/core/promote/index.js');
    vi.mocked(promote.PromoteEngine).mockImplementation(() => ({
      promote: vi.fn().mockImplementation(async () => {
        if (mockPromoteError) throw mockPromoteError;
        return mockPromoteResult;
      }),
    }));
  });

  describe('createPromoteCommand', () => {
    it('should create a command with correct name', () => {
      const command = createPromoteCommand();
      expect(command.name()).toBe('promote');
    });

    it('should have the correct description', () => {
      const command = createPromoteCommand();
      expect(command.description()).toContain('Promote');
    });

    it('should have a required constraint argument', () => {
      const command = createPromoteCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('constraint');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createPromoteCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--intent');
      expect(optionNames).toContain('--description');
      expect(optionNames).toContain('--category');
      expect(optionNames).toContain('--apply');
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--config');
    });
  });

  describe('runPromote', () => {
    it('should error on invalid constraint format (no colon)', async () => {
      const command = createPromoteCommand();

      await expect(
        command.parseAsync(['node', 'test', 'invalid_constraint', '--intent', 'test-intent'])
      ).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Invalid constraint format. Use rule:value (e.g., forbid_pattern:console)'
      );
    });

    it('should call PromoteEngine with correct parameters', async () => {
      const promote = await import('../../../../src/core/promote/index.js');

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(promote.PromoteEngine).toHaveBeenCalledWith('/test/project');
    });

    it('should pass intent name to engine', async () => {
      const promote = await import('../../../../src/core/promote/index.js');
      const mockPromote = vi.fn().mockResolvedValue(mockPromoteResult);
      vi.mocked(promote.PromoteEngine).mockImplementation(() => ({ promote: mockPromote }));

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(mockPromote).toHaveBeenCalledWith(
        expect.objectContaining({
          rule: 'forbid_pattern',
          value: 'console',
          intentName: 'cli-output',
          apply: false,
        })
      );
    });

    it('should pass description when provided', async () => {
      const promote = await import('../../../../src/core/promote/index.js');
      const mockPromote = vi.fn().mockResolvedValue(mockPromoteResult);
      vi.mocked(promote.PromoteEngine).mockImplementation(() => ({ promote: mockPromote }));

      const command = createPromoteCommand();
      await command.parseAsync([
        'node', 'test', 'forbid_pattern:console',
        '--intent', 'cli-output',
        '--description', 'Allows console output in CLI'
      ]);

      expect(mockPromote).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Allows console output in CLI',
        })
      );
    });

    it('should pass category when provided', async () => {
      const promote = await import('../../../../src/core/promote/index.js');
      const mockPromote = vi.fn().mockResolvedValue(mockPromoteResult);
      vi.mocked(promote.PromoteEngine).mockImplementation(() => ({ promote: mockPromote }));

      const command = createPromoteCommand();
      await command.parseAsync([
        'node', 'test', 'forbid_pattern:console',
        '--intent', 'cli-output',
        '--category', 'cli'
      ]);

      expect(mockPromote).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'cli',
        })
      );
    });

    it('should pass apply=true when --apply is provided', async () => {
      const promote = await import('../../../../src/core/promote/index.js');
      const mockPromote = vi.fn().mockResolvedValue(mockPromoteResult);
      vi.mocked(promote.PromoteEngine).mockImplementation(() => ({ promote: mockPromote }));

      const command = createPromoteCommand();
      await command.parseAsync([
        'node', 'test', 'forbid_pattern:console',
        '--intent', 'cli-output',
        '--apply'
      ]);

      expect(mockPromote).toHaveBeenCalledWith(
        expect.objectContaining({
          apply: true,
        })
      );
    });

    it('should output JSON when --json flag is provided', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: true, name: 'cli-output', description: 'test' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync([
        'node', 'test', 'forbid_pattern:console',
        '--intent', 'cli-output',
        '--json'
      ]);

      // Should output JSON
      const jsonCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"applied"')
      );
      expect(jsonCall).toBeDefined();
    });

    it('should handle errors from PromoteEngine', async () => {
      mockPromoteError = new Error('Engine failed');

      const logger = await import('../../../../src/utils/logger.js');

      const command = createPromoteCommand();
      await expect(
        command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output'])
      ).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Engine failed');
    });

    it('should handle non-Error exceptions', async () => {
      const promote = await import('../../../../src/core/promote/index.js');
      vi.mocked(promote.PromoteEngine).mockImplementation(() => ({
        promote: vi.fn().mockRejectedValue('string error'),
      }));

      const logger = await import('../../../../src/utils/logger.js');

      const command = createPromoteCommand();
      await expect(
        command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output'])
      ).rejects.toThrow('process.exit(1)');

      expect(logger.logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('printResult', () => {
    it('should print header with constraint and intent', async () => {
      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('Promote: forbid_pattern:console → @intent:cli-output');
    });

    it('should display errors when present', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'test' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: ['No files found with @override for this constraint'],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('  ✗ No files found with @override for this constraint');
    });

    it('should display new intent info when isNew is true', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: true, name: 'cli-output', description: 'Allows CLI output', category: 'cli' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('Intent:');
      expect(consoleSpy).toHaveBeenCalledWith('  + NEW: cli-output - "Allows CLI output"');
      expect(consoleSpy).toHaveBeenCalledWith('    Category: cli');
    });

    it('should display "(no description)" when intent has no description', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: true, name: 'cli-output' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('  + NEW: cli-output - "(no description)"');
    });

    it('should display message when intent already exists', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'cli-output' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('  Intent "cli-output" already defined.');
    });

    it('should display registry changes with new unless clause', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'cli-output' },
        registryChanges: [{
          filePath: '/test/project/.arch/registry/cli.yaml',
          architectureId: 'cli.command',
          constraintIndex: 0,
          unlessAlreadyExists: false,
          intentAlreadyInUnless: false,
        }],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('Registry changes:');
      expect(consoleSpy).toHaveBeenCalledWith('  .arch/registry/cli.yaml');
      expect(consoleSpy).toHaveBeenCalledWith('    + Add unless: ["@intent:cli-output"]');
    });

    it('should display registry changes when appending to existing unless', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'cli-output' },
        registryChanges: [{
          filePath: '/test/project/.arch/registry/cli.yaml',
          architectureId: 'cli.command',
          constraintIndex: 0,
          unlessAlreadyExists: true,
          intentAlreadyInUnless: false,
        }],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('    + Append to unless: "@intent:cli-output"');
    });

    it('should display registry changes when intent already in unless', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'cli-output' },
        registryChanges: [{
          filePath: '/test/project/.arch/registry/cli.yaml',
          architectureId: 'cli.command',
          constraintIndex: 0,
          unlessAlreadyExists: true,
          intentAlreadyInUnless: true,
        }],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('    unless: ["@intent:cli-output"] (already present, skipping)');
    });

    it('should display file changes', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'cli-output' },
        registryChanges: [],
        fileChanges: [{
          filePath: 'src/cli/print.ts',
          overrideRule: 'forbid_pattern',
          overrideValue: 'console',
          overrideStartLine: 5,
          overrideEndLine: 7,
          intentAlreadyPresent: false,
        }],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('File changes (1 files):');
      expect(consoleSpy).toHaveBeenCalledWith('  src/cli/print.ts');
      expect(consoleSpy).toHaveBeenCalledWith('    - Remove @override forbid_pattern:console (lines 5-7)');
      expect(consoleSpy).toHaveBeenCalledWith('    + Add @intent:cli-output');
    });

    it('should display skip message when intent already present in file', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'cli-output' },
        registryChanges: [],
        fileChanges: [{
          filePath: 'src/cli/print.ts',
          overrideRule: 'forbid_pattern',
          overrideValue: 'console',
          overrideStartLine: 5,
          overrideEndLine: 7,
          intentAlreadyPresent: true,
        }],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('    @intent:cli-output (already present, skipping)');
    });

    it('should display warnings when present', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'test' },
        registryChanges: [],
        fileChanges: [],
        warnings: ['Some files could not be parsed'],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('  ⚠ Some files could not be parsed');
    });

    it('should display success message when applied', async () => {
      mockPromoteResult = {
        applied: true,
        intentChange: { isNew: false, name: 'test' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('Changes applied successfully.');
    });

    it('should display blocked message when errors exist', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'test' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: ['Constraint not found in registry'],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('Blocked: fix errors above before applying.');
    });

    it('should display dry run message in default mode', async () => {
      mockPromoteResult = {
        applied: false,
        intentChange: { isNew: false, name: 'test' },
        registryChanges: [],
        fileChanges: [],
        warnings: [],
        errors: [],
      };

      const command = createPromoteCommand();
      await command.parseAsync(['node', 'test', 'forbid_pattern:console', '--intent', 'cli-output']);

      expect(consoleSpy).toHaveBeenCalledWith('Mode: DRY RUN (use --apply to execute)');
    });
  });
});
