/**
 * @arch archcodex.core.types
 *
 * Type definitions for plan validation.
 */

/**
 * A proposed file change in the plan.
 */
export interface ProposedChange {
  /** File path (relative to project root) */
  path: string;
  /** Action type */
  action: 'create' | 'modify' | 'delete' | 'rename';
  /** Architecture ID for new files (required for create) */
  archId?: string;
  /** New imports being added */
  newImports?: string[];
  /** Code patterns that will appear (for forbid_pattern checking) */
  codePatterns?: string[];
  /** For rename: the new path */
  newPath?: string;
}

/**
 * Plan validation input.
 */
export interface PlanValidationInput {
  /** List of proposed changes */
  changes: ProposedChange[];
}

/**
 * A single plan violation (pre-execution constraint check).
 */
export interface PlanViolation {
  /** File the violation applies to */
  file: string;
  /** Rule that would be violated */
  rule: string;
  /** What specifically violates */
  detail: string;
  /** Severity */
  severity: 'error' | 'warning';
  /** Suggestion to fix */
  suggestion?: string;
  /** Alternative to use */
  alternative?: string;
}

/**
 * Plan validation result.
 */
export interface PlanValidationResult {
  /** Whether the plan passes validation (no errors) */
  valid: boolean;
  /** Errors found (blocking) */
  violations: PlanViolation[];
  /** Warnings (non-blocking) */
  warnings: PlanViolation[];
  /** Files that would be impacted by the changes (dependents) */
  impactedFiles: string[];
  /** Summary stats */
  stats: {
    filesChecked: number;
    errorsFound: number;
    warningsFound: number;
    impactedFileCount: number;
  };
}
