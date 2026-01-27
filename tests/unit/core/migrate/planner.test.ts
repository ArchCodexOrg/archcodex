/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for migration planner functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../../src/core/diff/git-loader.js', () => ({
  loadRegistryFromRef: vi.fn(),
  parseGitRange: vi.fn((range: string) => {
    const parts = range.split('..');
    if (parts.length === 2) {
      return { from: parts[0], to: parts[1] };
    }
    return { from: range, to: 'HEAD' };
  }),
}));

vi.mock('../../../../src/core/diff/comparator.js', () => ({
  compareRegistries: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
}));

import type { Registry } from '../../../../src/core/registry/schema.js';
import type { RegistryDiff, ArchitectureChange } from '../../../../src/core/diff/types.js';
import { loadRegistryFromRef } from '../../../../src/core/diff/git-loader.js';
import { compareRegistries } from '../../../../src/core/diff/comparator.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { globFiles, readFile } from '../../../../src/utils/file-system.js';

// Import after mocks
const { createMigrationPlan } = await import('../../../../src/core/migrate/planner.js');

describe('Migration Planner', () => {
  const mockFromRegistry: Registry = {
    version: '1.0',
    architectures: {
      'archcodex.core': {
        description: 'Core module',
        constraints: [],
      },
    },
  };

  const mockToRegistry: Registry = {
    version: '1.0',
    architectures: {
      'archcodex.core': {
        description: 'Core module (updated)',
        constraints: [
          { rule: 'require_import', value: 'lodash', severity: 'error' },
        ],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadRegistryFromRef).mockResolvedValue(mockFromRegistry);
    vi.mocked(loadRegistry).mockResolvedValue(mockToRegistry);
    vi.mocked(globFiles).mockResolvedValue([]);
    vi.mocked(readFile).mockResolvedValue('');
  });

  describe('createMigrationPlan', () => {
    it('should create a migration plan from a git range', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'main',
        toRef: 'HEAD',
        architectureChanges: [],
        summary: {
          added: 0,
          removed: 0,
          modified: 0,
          affectedFiles: 0,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);

      const plan = await createMigrationPlan('/project', 'main..HEAD');

      expect(plan.fromRef).toBe('main');
      expect(plan.toRef).toBe('HEAD');
      expect(plan.tasks).toEqual([]);
      expect(plan.summary.totalTasks).toBe(0);
    });

    it('should generate tasks for added architectures', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        architectureChanges: [
          {
            archId: 'archcodex.new.feature',
            type: 'added',
            newNode: {
              description: 'New feature architecture',
              constraints: [],
            },
          },
        ],
        summary: {
          added: 1,
          removed: 0,
          modified: 0,
          affectedFiles: 0,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);

      const plan = await createMigrationPlan('/project', 'v1.0..v2.0');

      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0].archId).toBe('archcodex.new.feature');
      expect(plan.tasks[0].changeType).toBe('added');
    });

    it('should generate tasks for removed architectures with affected files', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        architectureChanges: [
          {
            archId: 'archcodex.deprecated',
            type: 'removed',
            oldNode: {
              description: 'Deprecated architecture',
              constraints: [],
            },
          },
        ],
        summary: {
          added: 0,
          removed: 1,
          modified: 0,
          affectedFiles: 1,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);
      vi.mocked(globFiles).mockResolvedValue(['/project/src/deprecated.ts']);
      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch archcodex.deprecated
 */
export class Deprecated {}`);

      const plan = await createMigrationPlan('/project', 'v1.0..v2.0');

      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0].changeType).toBe('removed');
      expect(plan.tasks[0].affectedFiles).toHaveLength(1);
      expect(plan.tasks[0].affectedFiles[0].steps[0].action).toBe('manual_review');
    });

    it('should generate steps for constraint changes', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        architectureChanges: [
          {
            archId: 'archcodex.core',
            type: 'modified',
            constraintChanges: [
              {
                type: 'added',
                rule: 'require_import',
                newValue: 'lodash',
                newSeverity: 'error',
              },
              {
                type: 'added',
                rule: 'forbid_import',
                newValue: 'moment',
                newSeverity: 'error',
              },
            ],
            oldNode: mockFromRegistry.architectures['archcodex.core'],
            newNode: mockToRegistry.architectures['archcodex.core'],
          },
        ],
        summary: {
          added: 0,
          removed: 0,
          modified: 1,
          affectedFiles: 1,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);
      vi.mocked(globFiles).mockResolvedValue(['/project/src/core.ts']);
      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch archcodex.core
 */
export class Core {}`);

      const plan = await createMigrationPlan('/project', 'v1.0..v2.0');

      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0].affectedFiles[0].steps).toHaveLength(2);

      const actions = plan.tasks[0].affectedFiles[0].steps.map(s => s.action);
      expect(actions).toContain('add_import');
      expect(actions).toContain('remove_import');
    });

    it('should mark add_import as auto-applicable', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        architectureChanges: [
          {
            archId: 'archcodex.core',
            type: 'modified',
            constraintChanges: [
              {
                type: 'added',
                rule: 'require_import',
                newValue: 'lodash',
                newSeverity: 'error',
              },
            ],
            oldNode: mockFromRegistry.architectures['archcodex.core'],
            newNode: mockToRegistry.architectures['archcodex.core'],
          },
        ],
        summary: {
          added: 0,
          removed: 0,
          modified: 1,
          affectedFiles: 1,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);
      vi.mocked(globFiles).mockResolvedValue(['/project/src/core.ts']);
      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch archcodex.core
 */
export class Core {}`);

      const plan = await createMigrationPlan('/project', 'v1.0..v2.0');

      const addImportStep = plan.tasks[0].affectedFiles[0].steps.find(
        s => s.action === 'add_import'
      );
      expect(addImportStep?.autoApplicable).toBe(true);
    });

    it('should mark decorator changes as not auto-applicable', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        architectureChanges: [
          {
            archId: 'archcodex.core',
            type: 'modified',
            constraintChanges: [
              {
                type: 'added',
                rule: 'require_decorator',
                newValue: 'Injectable',
                newSeverity: 'error',
              },
            ],
            oldNode: mockFromRegistry.architectures['archcodex.core'],
            newNode: mockToRegistry.architectures['archcodex.core'],
          },
        ],
        summary: {
          added: 0,
          removed: 0,
          modified: 1,
          affectedFiles: 1,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);
      vi.mocked(globFiles).mockResolvedValue(['/project/src/core.ts']);
      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch archcodex.core
 */
export class Core {}`);

      const plan = await createMigrationPlan('/project', 'v1.0..v2.0');

      const decoratorStep = plan.tasks[0].affectedFiles[0].steps.find(
        s => s.action === 'add_decorator'
      );
      expect(decoratorStep?.autoApplicable).toBe(false);
    });

    it('should calculate summary correctly', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        architectureChanges: [
          {
            archId: 'archcodex.core',
            type: 'modified',
            constraintChanges: [
              {
                type: 'added',
                rule: 'require_import',
                newValue: 'lodash',
                newSeverity: 'error',
              },
            ],
            oldNode: mockFromRegistry.architectures['archcodex.core'],
            newNode: mockToRegistry.architectures['archcodex.core'],
          },
        ],
        summary: {
          added: 0,
          removed: 0,
          modified: 1,
          affectedFiles: 2,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);
      vi.mocked(globFiles).mockResolvedValue([
        '/project/src/core1.ts',
        '/project/src/core2.ts',
      ]);
      vi.mocked(readFile).mockResolvedValue(`/**
 * @arch archcodex.core
 */
export class Core {}`);

      const plan = await createMigrationPlan('/project', 'v1.0..v2.0');

      expect(plan.summary.totalTasks).toBe(1);
      expect(plan.summary.totalFiles).toBe(2);
      expect(plan.summary.autoApplicableFiles).toBe(2); // add_import is auto-applicable
      expect(plan.summary.manualReviewFiles).toBe(0);
    });

    it('should skip file scanning when includeFiles is false', async () => {
      const mockDiff: RegistryDiff = {
        fromRef: 'v1.0',
        toRef: 'v2.0',
        architectureChanges: [
          {
            archId: 'archcodex.core',
            type: 'modified',
            constraintChanges: [],
            oldNode: mockFromRegistry.architectures['archcodex.core'],
            newNode: mockToRegistry.architectures['archcodex.core'],
          },
        ],
        summary: {
          added: 0,
          removed: 0,
          modified: 1,
          affectedFiles: 0,
        },
      };

      vi.mocked(compareRegistries).mockResolvedValue(mockDiff);

      const plan = await createMigrationPlan('/project', 'v1.0..v2.0', {
        includeFiles: false,
      });

      expect(globFiles).not.toHaveBeenCalled();
      expect(plan.summary.totalFiles).toBe(0);
    });
  });
});
