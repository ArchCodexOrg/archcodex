/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for migration applier functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyMigrations,
  hasPendingManualMigrations,
  getMigrationSummary,
} from '../../../../src/core/migrate/applier.js';
import type {
  MigrationPlan,
  AffectedFileMigration,
  MigrateApplyOptions,
} from '../../../../src/core/migrate/types.js';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { readFile, writeFile } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

function makePlan(affectedFiles: AffectedFileMigration[]): MigrationPlan {
  return {
    fromRef: 'v1.0',
    toRef: 'v2.0',
    tasks: [
      {
        archId: 'archcodex.core',
        changeType: 'modified',
        summary: 'Modified arch',
        details: [],
        affectedFiles,
        fileCount: affectedFiles.length,
        fullyAutoApplicable: affectedFiles.every(f =>
          f.steps.every(s => s.autoApplicable)
        ),
      },
    ],
    summary: {
      totalTasks: 1,
      totalFiles: affectedFiles.length,
      autoApplicableFiles: 0,
      manualReviewFiles: 0,
    },
  };
}

describe('Migration Applier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasPendingManualMigrations', () => {
    it('should return true when file has non-auto-applicable steps', () => {
      const file: AffectedFileMigration = {
        filePath: '/project/src/test.ts',
        currentArchId: 'archcodex.core',
        steps: [
          { action: 'add_import', description: 'Add import', autoApplicable: true },
          { action: 'manual_review', description: 'Manual review', autoApplicable: false },
        ],
      };

      expect(hasPendingManualMigrations(file)).toBe(true);
    });

    it('should return false when all steps are auto-applicable', () => {
      const file: AffectedFileMigration = {
        filePath: '/project/src/test.ts',
        currentArchId: 'archcodex.core',
        steps: [
          { action: 'add_import', description: 'Add import', autoApplicable: true },
          { action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true },
        ],
      };

      expect(hasPendingManualMigrations(file)).toBe(false);
    });

    it('should return false when file has no steps', () => {
      const file: AffectedFileMigration = {
        filePath: '/project/src/test.ts',
        currentArchId: 'archcodex.core',
        steps: [],
      };

      expect(hasPendingManualMigrations(file)).toBe(false);
    });
  });

  describe('getMigrationSummary', () => {
    it('should count auto-applicable and manual steps', () => {
      const plan: MigrationPlan = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        tasks: [
          {
            archId: 'archcodex.core',
            changeType: 'modified',
            summary: 'Modified arch',
            details: [],
            affectedFiles: [
              {
                filePath: '/project/src/file1.ts',
                currentArchId: 'archcodex.core',
                steps: [
                  { action: 'add_import', description: 'Add import', autoApplicable: true },
                  { action: 'add_decorator', description: 'Add decorator', autoApplicable: false },
                ],
              },
              {
                filePath: '/project/src/file2.ts',
                currentArchId: 'archcodex.core',
                steps: [
                  { action: 'add_import', description: 'Add import', autoApplicable: true },
                ],
              },
            ],
            fileCount: 2,
            fullyAutoApplicable: false,
          },
        ],
        summary: {
          totalTasks: 1,
          totalFiles: 2,
          autoApplicableFiles: 1,
          manualReviewFiles: 1,
        },
      };

      const summary = getMigrationSummary(plan);

      expect(summary.autoApplicable).toBe(2); // 2 add_import steps
      expect(summary.manualRequired).toBe(1); // 1 add_decorator step
      expect(summary.byAction['add_import']).toBe(2);
      expect(summary.byAction['add_decorator']).toBe(1);
    });

    it('should handle empty plan', () => {
      const plan: MigrationPlan = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        tasks: [],
        summary: {
          totalTasks: 0,
          totalFiles: 0,
          autoApplicableFiles: 0,
          manualReviewFiles: 0,
        },
      };

      const summary = getMigrationSummary(plan);

      expect(summary.autoApplicable).toBe(0);
      expect(summary.manualRequired).toBe(0);
      expect(Object.keys(summary.byAction)).toHaveLength(0);
    });

    it('should count all action types', () => {
      const plan: MigrationPlan = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        tasks: [
          {
            archId: 'archcodex.core',
            changeType: 'modified',
            summary: 'Modified arch',
            details: [],
            affectedFiles: [
              {
                filePath: '/project/src/file.ts',
                currentArchId: 'archcodex.core',
                steps: [
                  { action: 'add_import', description: 'Add', autoApplicable: true },
                  { action: 'remove_import', description: 'Remove', autoApplicable: false },
                  { action: 'add_decorator', description: 'Add dec', autoApplicable: false },
                  { action: 'remove_decorator', description: 'Remove dec', autoApplicable: false },
                  { action: 'update_arch_tag', description: 'Update', value: 'new', autoApplicable: true },
                  { action: 'manual_review', description: 'Review', autoApplicable: false },
                ],
              },
            ],
            fileCount: 1,
            fullyAutoApplicable: false,
          },
        ],
        summary: {
          totalTasks: 1,
          totalFiles: 1,
          autoApplicableFiles: 0,
          manualReviewFiles: 1,
        },
      };

      const summary = getMigrationSummary(plan);

      expect(summary.byAction['add_import']).toBe(1);
      expect(summary.byAction['remove_import']).toBe(1);
      expect(summary.byAction['add_decorator']).toBe(1);
      expect(summary.byAction['remove_decorator']).toBe(1);
      expect(summary.byAction['update_arch_tag']).toBe(1);
      expect(summary.byAction['manual_review']).toBe(1);
    });
  });

  describe('applyMigrations', () => {
    it('should skip files not in options.files filter', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/included.ts',
          currentArchId: 'archcodex.core',
          steps: [{ action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true }],
        },
        {
          filePath: '/project/src/excluded.ts',
          currentArchId: 'archcodex.core',
          steps: [{ action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true }],
        },
      ]);

      mockReadFile.mockResolvedValue('/** @arch archcodex.core */\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      const result = await applyMigrations(plan, { files: ['/project/src/included.ts'] });

      expect(result.success).toHaveLength(1);
      expect(result.success[0].filePath).toBe('/project/src/included.ts');
    });

    it('should skip files with no auto-applicable steps and add to skipped', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/manual.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'manual_review', description: 'Manual review', autoApplicable: false },
          ],
        },
      ]);

      const result = await applyMigrations(plan);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('No auto-applicable steps');
    });

    it('should not add to skipped when skipManual is true and no auto steps', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/manual.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'manual_review', description: 'Manual review', autoApplicable: false },
          ],
        },
      ]);

      const result = await applyMigrations(plan, { skipManual: true });

      expect(result.skipped).toHaveLength(0);
      expect(result.success).toHaveLength(0);
    });

    it('should skip files with mixed steps when skipManual is false', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/mixed.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true },
            { action: 'manual_review', description: 'Manual review', autoApplicable: false },
          ],
        },
      ]);

      const result = await applyMigrations(plan);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('require manual review');
    });

    it('should apply auto steps when skipManual is true and file has mixed steps', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/mixed.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true },
            { action: 'manual_review', description: 'Manual review', autoApplicable: false },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue('/** @arch archcodex.core */\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      const result = await applyMigrations(plan, { skipManual: true });

      expect(result.success).toHaveLength(1);
      expect(result.success[0].stepsApplied).toBe(1);
    });

    it('should not write to file in dryRun mode', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true },
          ],
        },
      ]);

      const result = await applyMigrations(plan, { dryRun: true });

      expect(result.success).toHaveLength(1);
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should record failure when file read throws', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/missing.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await applyMigrations(plan);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('ENOENT');
    });

    it('should record failure with "Unknown error" for non-Error throws', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'new.arch', autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockRejectedValue('string error');

      const result = await applyMigrations(plan);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Unknown error');
    });

    it('should apply update_arch_tag step correctly', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'archcodex.core.v2', autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue('/** @arch archcodex.core */\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/project/src/file.ts',
        expect.stringContaining('archcodex.core.v2'),
        'utf-8'
      );
    });

    it('should apply update_arch_tag for single-line comment format', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'archcodex.core.v2', autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue('// @arch archcodex.core\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/project/src/file.ts',
        expect.stringContaining('archcodex.core.v2'),
        'utf-8'
      );
    });

    it('should return content unchanged when arch tag pattern is not found', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'archcodex.core.v2', autoApplicable: true },
          ],
        },
      ]);

      const originalContent = 'const x = 1;\nconst y = 2;';
      mockReadFile.mockResolvedValue(originalContent);
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/project/src/file.ts',
        originalContent,
        'utf-8'
      );
    });

    it('should apply add_import step when import does not exist', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'add_import', description: 'Add import', value: "{ logger } from './utils/logger.js'", autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue("import { foo } from './foo.js';\nconst x = 1;");
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain("{ logger } from './utils/logger.js'");
    });

    it('should not duplicate import if already present', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'add_import', description: 'Add import', value: "{ foo } from './foo.js'", autoApplicable: true },
          ],
        },
      ]);

      const original = "import { foo } from './foo.js';\nconst x = 1;";
      mockReadFile.mockResolvedValue(original);
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toBe(original);
    });

    it('should add import after header comments when no existing imports', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'add_import', description: 'Add import', value: "{ logger } from './logger.js'", autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue('/**\n * @arch archcodex.core\n */\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain("import { logger } from './logger.js';");
    });

    it('should handle default action (unknown step types) by returning content unchanged', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'add_decorator' as 'add_import', description: 'Add decorator', autoApplicable: true },
          ],
        },
      ]);

      const original = 'const x = 1;';
      mockReadFile.mockResolvedValue(original);
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toBe(original);
    });

    it('should add import after single-line comment headers', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'add_import', description: 'Add import', value: "{ logger } from './logger.js'", autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue('// Copyright 2024\n// @arch archcodex.core\n\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain("import { logger } from './logger.js';");
    });

    it('should apply multiple steps to the same file', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'update_arch_tag', description: 'Update tag', value: 'archcodex.core.v2', autoApplicable: true },
            { action: 'add_import', description: 'Add import', value: "{ logger } from './logger.js'", autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue("/** @arch archcodex.core */\nimport { foo } from './foo.js';\nconst x = 1;");
      mockWriteFile.mockResolvedValue(undefined);

      const result = await applyMigrations(plan);

      expect(result.success).toHaveLength(1);
      expect(result.success[0].stepsApplied).toBe(2);
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('archcodex.core.v2');
      expect(writtenContent).toContain("{ logger } from './logger.js'");
    });

    it('should handle multiple tasks in a plan', async () => {
      const plan: MigrationPlan = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        tasks: [
          {
            archId: 'archcodex.core',
            changeType: 'modified',
            summary: 'Modified core',
            details: [],
            affectedFiles: [
              {
                filePath: '/project/src/a.ts',
                currentArchId: 'archcodex.core',
                steps: [{ action: 'update_arch_tag', description: 'Update', value: 'archcodex.core.v2', autoApplicable: true }],
              },
            ],
            fileCount: 1,
            fullyAutoApplicable: true,
          },
          {
            archId: 'archcodex.cli',
            changeType: 'modified',
            summary: 'Modified cli',
            details: [],
            affectedFiles: [
              {
                filePath: '/project/src/b.ts',
                currentArchId: 'archcodex.cli',
                steps: [{ action: 'update_arch_tag', description: 'Update', value: 'archcodex.cli.v2', autoApplicable: true }],
              },
            ],
            fileCount: 1,
            fullyAutoApplicable: true,
          },
        ],
        summary: { totalTasks: 2, totalFiles: 2, autoApplicableFiles: 2, manualReviewFiles: 0 },
      };

      mockReadFile.mockResolvedValue('/** @arch archcodex.core */\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      const result = await applyMigrations(plan);

      expect(result.success).toHaveLength(2);
    });

    it('should handle findHeaderEnd with block comments containing */ in the middle', async () => {
      const plan = makePlan([
        {
          filePath: '/project/src/file.ts',
          currentArchId: 'archcodex.core',
          steps: [
            { action: 'add_import', description: 'Add import', value: "{ x } from './x.js'", autoApplicable: true },
          ],
        },
      ]);

      mockReadFile.mockResolvedValue('/* comment */\nconst x = 1;');
      mockWriteFile.mockResolvedValue(undefined);

      await applyMigrations(plan);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain("import { x } from './x.js';");
    });
  });
});
