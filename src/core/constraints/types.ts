/**
 * @arch archcodex.core.types
 *
 * Constraint validator type definitions.
 */
import type { Constraint, ConstraintRule, ConstraintValue, Severity, Alternative, IntentRegistry } from '../registry/schema.js';
import type { SemanticModel } from '../../validators/semantic.types.js';
import type { PatternRegistry } from '../patterns/types.js';
import type { IntentAnnotation } from '../arch-tag/types.js';
import type { TableDetectionSettings } from '../config/schema.js';

/**
 * Structured suggestion for fixing a violation.
 * Provides machine-readable action for AI agents.
 */
export interface Suggestion {
  /** Type of action to take */
  action: 'replace' | 'remove' | 'add' | 'rename';
  /** The offending code to target */
  target?: string;
  /** What to replace with (for 'replace' action) */
  replacement?: string;
  /** Where to insert (for 'add' action) */
  insertAt?: 'before' | 'after' | 'start' | 'end';
  /** Import statement to add (if applicable) */
  importStatement?: string;
}

/**
 * "Did you mean" suggestion pointing to canonical implementation.
 */
export interface DidYouMean {
  /** Path to the canonical file */
  file: string;
  /** Specific export to use */
  export?: string;
  /** Description of why to use this */
  description: string;
  /** Example usage code */
  exampleUsage?: string;
}

/**
 * A single violation found during constraint validation.
 */
export interface Violation {
  /** Error code (E001, E002, etc.) */
  code: string;
  /** The rule that was violated */
  rule: ConstraintRule;
  /** The constraint value that was violated */
  value: ConstraintValue;
  /** Severity of the violation */
  severity: Severity;
  /** Line number where violation occurred (null if not applicable) */
  line: number | null;
  /** Column number (null if not applicable) */
  column: number | null;
  /** Human-readable message */
  message: string;
  /** Explanation of why this rule exists */
  why?: string;
  /** Suggested fix (human-readable) */
  fixHint?: string;
  /** Source of the constraint (which architecture node) */
  source: string;
  /** Structured suggestion for machine-readable fixes */
  suggestion?: Suggestion;
  /** "Did you mean" suggestion for alternative imports */
  didYouMean?: DidYouMean;
  /** Alternative suggestions from constraint definition */
  alternatives?: Alternative[];
}

/**
 * Context passed to constraint validators.
 */
export interface ConstraintContext {
  /** Absolute path to the file being validated */
  filePath: string;
  /** File name only */
  fileName: string;
  /** Parsed file semantic model (language-agnostic) */
  parsedFile: SemanticModel;
  /** The architecture ID from @arch tag */
  archId: string;
  /** Source of the constraint being validated */
  constraintSource: string;
  /** Pattern registry for suggesting canonical implementations */
  patternRegistry?: PatternRegistry;
  /** Intent annotations from the file (@intent:name) */
  intents?: IntentAnnotation[];
  /** Intent registry for validation */
  intentRegistry?: IntentRegistry;
  /** Configuration options for constraint validators */
  config?: {
    /** Target detection settings for require_companion_call */
    table_detection?: TableDetectionSettings;
  };
}

/**
 * Result from a constraint validator.
 */
export interface ConstraintResult {
  /** Whether the constraint passed */
  passed: boolean;
  /** All violations found */
  violations: Violation[];
}

/**
 * Interface for constraint validators.
 */
export interface IConstraintValidator {
  /** The constraint rule this validator handles */
  readonly rule: ConstraintRule;

  /**
   * Validate a constraint against a file.
   */
  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult;
}

/**
 * Extended context for project-level constraints.
 * Includes cross-file relationship information.
 */
export interface ProjectConstraintContext extends ConstraintContext {
  /** Files that import this file (for importable_by constraint) */
  importers?: Array<{ filePath: string; archId: string | null; line?: number }>;
  /** Circular dependency cycles that include this file (for forbid_circular_deps) */
  cycles?: Array<{ files: string[]; archIds: (string | null)[] }>;
}
