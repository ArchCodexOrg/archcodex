/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for migration applier functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasPendingManualMigrations,
  getMigrationSummary,
} from '../../../../src/core/migrate/applier.js';
import type {
  MigrationPlan,
  AffectedFileMigration,
} from '../../../../src/core/migrate/types.js';

describe('Migration Applier', () => {
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
});
