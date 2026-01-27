/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the migrate command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMigrateCommand } from '../../../../src/cli/commands/migrate.js';
import type { MigrationPlan, MigrationResult } from '../../../../src/core/migrate/types.js';

// Mock migration plan result
let mockMigrationPlan: MigrationPlan = {
  fromRef: 'main',
  toRef: 'HEAD',
  tasks: [],
  summary: {
    totalTasks: 0,
    totalFiles: 0,
    autoApplicableFiles: 0,
    manualReviewFiles: 0,
  },
};

let mockApplyResult: MigrationResult = {
  success: [],
  failed: [],
  skipped: [],
};

// Mock dependencies
vi.mock('../../../../src/core/migrate/index.js', () => ({
  createMigrationPlan: vi.fn().mockImplementation(async () => mockMigrationPlan),
  applyMigrations: vi.fn().mockImplementation(async () => mockApplyResult),
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

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
      green: (s: string) => s,
      yellow: (s: string) => s,
      red: (s: string) => s,
    }),
    green: Object.assign((s: string) => s, { bold: (s: string) => s }),
    yellow: Object.assign((s: string) => s, { bold: (s: string) => s }),
    red: Object.assign((s: string) => s, { bold: (s: string) => s }),
    cyan: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('migrate command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMigrationPlan = {
      fromRef: 'main',
      toRef: 'HEAD',
      tasks: [],
      summary: {
        totalTasks: 0,
        totalFiles: 0,
        autoApplicableFiles: 0,
        manualReviewFiles: 0,
      },
    };
    mockApplyResult = {
      success: [],
      failed: [],
      skipped: [],
    };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset mocks
    const { createMigrationPlan, applyMigrations } = await import('../../../../src/core/migrate/index.js');
    vi.mocked(createMigrationPlan).mockImplementation(async () => mockMigrationPlan);
    vi.mocked(applyMigrations).mockImplementation(async () => mockApplyResult);
  });

  describe('createMigrateCommand', () => {
    it('should create a command with correct name', () => {
      const command = createMigrateCommand();
      expect(command.name()).toBe('migrate');
    });

    it('should have the correct description', () => {
      const command = createMigrateCommand();
      expect(command.description()).toContain('migration');
    });

    it('should have a required range argument', () => {
      const command = createMigrateCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('range');
      expect(args[0].required).toBe(true);
    });

    it('should have required options', () => {
      const command = createMigrateCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--apply');
      expect(optionNames).toContain('--dry-run');
      expect(optionNames).toContain('--no-files');
      expect(optionNames).toContain('--verbose');
    });
  });

  describe('execution', () => {
    it('should print migration plan header', async () => {
      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('MIGRATION PLAN'));
    });

    it('should show no migrations needed when plan is empty', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [],
        summary: { totalTasks: 0, totalFiles: 0, autoApplicableFiles: 0, manualReviewFiles: 0 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No migrations needed'));
    });

    it('should output JSON with --json flag', async () => {
      mockMigrationPlan = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'modified',
            summary: 'Constraints changed',
            details: ['forbid_import added'],
            fileCount: 5,
            affectedFiles: [],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 5, autoApplicableFiles: 3, manualReviewFiles: 2 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'v1.0..v2.0', '--json']);

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty('fromRef', 'v1.0');
      expect(output).toHaveProperty('toRef', 'v2.0');
      expect(output).toHaveProperty('tasks');
      expect(output).toHaveProperty('summary');
    });

    it('should print migration tasks', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'added',
            summary: 'New architecture added',
            details: [],
            fileCount: 3,
            affectedFiles: [],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 3, autoApplicableFiles: 3, manualReviewFiles: 0 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('app.service'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('ADDED'));
    });

    it('should print summary with task and file counts', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'modified',
            summary: 'Constraints changed',
            details: [],
            fileCount: 10,
            affectedFiles: [],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 10, autoApplicableFiles: 7, manualReviewFiles: 3 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Summary:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Tasks:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Files:'));
    });

    it('should suggest apply command when auto-applicable files exist', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'feature',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'modified',
            summary: 'Update',
            details: [],
            fileCount: 5,
            affectedFiles: [],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 5, autoApplicableFiles: 5, manualReviewFiles: 0 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..feature']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--apply'));
    });

    it('should apply migrations with --apply flag', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'modified',
            summary: 'Update',
            details: [],
            fileCount: 2,
            affectedFiles: [],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 2, autoApplicableFiles: 2, manualReviewFiles: 0 },
      };
      mockApplyResult = {
        success: [
          { filePath: 'src/a.ts', stepsApplied: 2 },
          { filePath: 'src/b.ts', stepsApplied: 1 },
        ],
        failed: [],
        skipped: [],
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--apply']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Applying migrations'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/a.ts'));
    });

    it('should show dry-run message with --dry-run flag', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'modified',
            summary: 'Update',
            details: [],
            fileCount: 1,
            affectedFiles: [],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 1, autoApplicableFiles: 1, manualReviewFiles: 0 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--dry-run']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });

    it('should show failed migrations', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [{ archId: 'app.service', changeType: 'modified', summary: 'Update', details: [], fileCount: 1, affectedFiles: [] }],
        summary: { totalTasks: 1, totalFiles: 1, autoApplicableFiles: 1, manualReviewFiles: 0 },
      };
      mockApplyResult = {
        success: [],
        failed: [{ filePath: 'src/error.ts', error: 'Parse error' }],
        skipped: [],
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--apply']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/error.ts'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Parse error'));
    });

    it('should show skipped files', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [{ archId: 'app.service', changeType: 'modified', summary: 'Update', details: [], fileCount: 1, affectedFiles: [] }],
        summary: { totalTasks: 1, totalFiles: 1, autoApplicableFiles: 0, manualReviewFiles: 1 },
      };
      mockApplyResult = {
        success: [],
        failed: [],
        skipped: [{ filePath: 'src/manual.ts', reason: 'Manual review required' }],
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--apply']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/manual.ts'));
    });

    it('should show verbose details with --verbose flag', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'modified',
            summary: 'Constraints changed',
            details: ['Added forbid_import:axios', 'Removed max_file_lines'],
            fileCount: 2,
            affectedFiles: [
              {
                filePath: 'src/service.ts',
                steps: [
                  { action: 'add_import', description: 'Add import', autoApplicable: true },
                  { action: 'manual', description: 'Manual fix needed', autoApplicable: false },
                ],
              },
            ],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 2, autoApplicableFiles: 1, manualReviewFiles: 1 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--verbose']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added forbid_import'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/service.ts'));
    });

    it('should handle task with removed change type', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [
          {
            archId: 'deprecated.arch',
            changeType: 'removed',
            summary: 'Architecture removed',
            details: [],
            fileCount: 3,
            affectedFiles: [],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 3, autoApplicableFiles: 0, manualReviewFiles: 3 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('REMOVED'));
    });

    it('should handle errors and exit with code 1', async () => {
      const { createMigrationPlan } = await import('../../../../src/core/migrate/index.js');
      vi.mocked(createMigrationPlan).mockRejectedValue(new Error('Git range error'));

      const command = createMigrateCommand();
      await expect(command.parseAsync(['node', 'test', 'invalid'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Git range error');
    });

    it('should truncate success list when more than 10 files', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [{ archId: 'app.service', changeType: 'modified', summary: 'Update', details: [], fileCount: 15, affectedFiles: [] }],
        summary: { totalTasks: 1, totalFiles: 15, autoApplicableFiles: 15, manualReviewFiles: 0 },
      };
      mockApplyResult = {
        success: Array.from({ length: 15 }, (_, i) => ({ filePath: `src/file${i}.ts`, stepsApplied: 1 })),
        failed: [],
        skipped: [],
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--apply']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('... and 5 more'));
    });

    it('should truncate skipped list when more than 5 files', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [{ archId: 'app.service', changeType: 'modified', summary: 'Update', details: [], fileCount: 10, affectedFiles: [] }],
        summary: { totalTasks: 1, totalFiles: 10, autoApplicableFiles: 0, manualReviewFiles: 10 },
      };
      mockApplyResult = {
        success: [],
        failed: [],
        skipped: Array.from({ length: 10 }, (_, i) => ({ filePath: `src/manual${i}.ts`, reason: 'Manual' })),
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--apply']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('... and 5 more'));
    });

    it('should pass noFiles option to createMigrationPlan', async () => {
      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD', '--no-files']);

      const { createMigrationPlan } = await import('../../../../src/core/migrate/index.js');
      expect(createMigrationPlan).toHaveBeenCalledWith(
        expect.any(String),
        'main..HEAD',
        expect.objectContaining({ includeFiles: false })
      );
    });

    it('should show actions summary when not verbose', async () => {
      mockMigrationPlan = {
        fromRef: 'main',
        toRef: 'HEAD',
        tasks: [
          {
            archId: 'app.service',
            changeType: 'modified',
            summary: 'Update',
            details: [],
            fileCount: 3,
            affectedFiles: [
              {
                filePath: 'src/a.ts',
                steps: [
                  { action: 'update_import', description: 'Update import', autoApplicable: true },
                ],
              },
              {
                filePath: 'src/b.ts',
                steps: [
                  { action: 'add_tag', description: 'Add tag', autoApplicable: true },
                ],
              },
            ],
          },
        ],
        summary: { totalTasks: 1, totalFiles: 3, autoApplicableFiles: 3, manualReviewFiles: 0 },
      };

      const command = createMigrateCommand();
      await command.parseAsync(['node', 'test', 'main..HEAD']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Actions:'));
    });
  });
});
