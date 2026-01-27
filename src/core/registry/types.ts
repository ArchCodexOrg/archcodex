/**
 * @arch archcodex.core.types
 *
 * Registry type definitions.
 */
import type { Constraint, Pointer, ConstraintRule, ArchitectureKind, Alternative, IntentDefinition, IntentRegistry } from './schema.js';

export type { Alternative, IntentDefinition, IntentRegistry };

/**
 * A resolved hint with normalized structure.
 * String hints are converted to { text: string } form.
 */
export interface ResolvedHint {
  /** The hint text */
  text: string;
  /** Optional URI to an example (arch:// or code://) */
  example?: string;
}

/**
 * A fully resolved architecture with all inherited and mixed-in constraints.
 */
export interface FlattenedArchitecture {
  /** The architecture ID that was resolved */
  archId: string;
  /** The inheritance chain from leaf to root */
  inheritanceChain: string[];
  /** Mixins that were applied */
  appliedMixins: string[];
  /** All resolved constraints */
  constraints: ResolvedConstraint[];
  /** All hints (deduplicated) */
  hints: ResolvedHint[];
  /** All pointers (deduplicated) */
  pointers: Pointer[];
  /** Contract/interface to implement */
  contract?: string;
  /** Description from the architecture node */
  description?: string;
  /** Rationale explaining why this architecture exists and when to use it */
  rationale?: string;
  /** Architecture kind - signals intent (implementation, organizational, definition) */
  kind?: ArchitectureKind;
  /** Current version of this architecture */
  version?: string;
  /** Version from which this architecture is deprecated */
  deprecated_from?: string;
  /** Pointer URI to migration guide */
  migration_guide?: string;
  /** Reference implementation files (golden samples) */
  reference_implementations?: string[];
  /** File naming pattern (e.g., "${name}Service.ts") */
  file_pattern?: string;
  /** Default path for new files */
  default_path?: string;
  /** Code pattern showing expected structure */
  code_pattern?: string;
  /** Expected @intent annotations for files using this architecture */
  expected_intents?: string[];
  /** Suggested @intent annotations with guidance on when to use */
  suggested_intents?: Array<{ name: string; when: string }>;
}

/**
 * A constraint with source tracking for debugging.
 */
export interface ResolvedConstraint extends Constraint {
  /** Where this constraint came from */
  source: string;
  /** Simple alternative suggestion */
  alternative?: string;
  /** Detailed alternatives with examples */
  alternatives?: Alternative[];
}

/**
 * Conflict severity levels.
 */
export type ConflictSeverity = 'info' | 'warning' | 'error';

/**
 * Conflict resolution report.
 */
export interface ConflictReport {
  /** The constraint rule involved (or special conflict type) */
  rule: ConstraintRule | string;
  /** The value of the constraint */
  value: string;
  /** Which source won */
  winner: string;
  /** Which source lost */
  loser: string;
  /** Explanation of resolution */
  resolution: string;
  /** Severity of the conflict */
  severity: ConflictSeverity;
}

/**
 * Result of constraint resolution with conflict tracking.
 */
export interface ResolutionResult {
  /** The flattened architecture */
  architecture: FlattenedArchitecture;
  /** Any conflicts that were resolved */
  conflicts: ConflictReport[];
}
