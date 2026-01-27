/**
 * @arch archcodex.core.types
 *
 * Types for architecture migration planning and execution.
 */

/**
 * Type of migration action required.
 */
export type MigrationActionType =
  | 'add_decorator'
  | 'remove_decorator'
  | 'update_arch_tag'
  | 'add_import'
  | 'remove_import'
  | 'manual_review';

/**
 * A single migration step for a file.
 */
export interface MigrationStep {
  /** Type of action to take */
  action: MigrationActionType;
  /** Human-readable description of what to do */
  description: string;
  /** The specific value (decorator name, import, new tag, etc.) */
  value?: string;
  /** Whether this can be auto-applied */
  autoApplicable: boolean;
}

/**
 * A file that needs migration.
 */
export interface AffectedFileMigration {
  /** Path to the file */
  filePath: string;
  /** Current @arch tag */
  currentArchId: string;
  /** New @arch tag (if changing) */
  newArchId?: string;
  /** Migration steps for this file */
  steps: MigrationStep[];
}

/**
 * A migration task for a single architecture change.
 */
export interface MigrationTask {
  /** Architecture ID affected */
  archId: string;
  /** Type of change */
  changeType: 'added' | 'removed' | 'modified' | 'renamed';
  /** Human-readable summary of the change */
  summary: string;
  /** Detailed description of what changed */
  details: string[];
  /** Files affected by this change */
  affectedFiles: AffectedFileMigration[];
  /** Total number of files */
  fileCount: number;
  /** Whether all steps are auto-applicable */
  fullyAutoApplicable: boolean;
}

/**
 * Complete migration plan.
 */
export interface MigrationPlan {
  /** Source version/ref */
  fromRef: string;
  /** Target version/ref */
  toRef: string;
  /** All migration tasks */
  tasks: MigrationTask[];
  /** Summary statistics */
  summary: {
    totalTasks: number;
    totalFiles: number;
    autoApplicableFiles: number;
    manualReviewFiles: number;
  };
}

/**
 * Result of applying migrations.
 */
export interface MigrationResult {
  /** Files successfully migrated */
  success: Array<{
    filePath: string;
    stepsApplied: number;
  }>;
  /** Files that failed migration */
  failed: Array<{
    filePath: string;
    error: string;
  }>;
  /** Files skipped (manual review required) */
  skipped: Array<{
    filePath: string;
    reason: string;
  }>;
}

/**
 * Options for migration planning.
 */
export interface MigratePlanOptions {
  /** Include files scan */
  includeFiles?: boolean;
  /** File patterns to scan */
  filePatterns?: string[];
}

/**
 * Options for applying migrations.
 */
export interface MigrateApplyOptions {
  /** Dry run - show what would be done */
  dryRun?: boolean;
  /** Only apply to specific files */
  files?: string[];
  /** Skip manual review items */
  skipManual?: boolean;
}
