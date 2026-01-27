/**
 * @arch archcodex.core.types
 *
 * Types for the feedback loop system.
 * Records violations over time to identify patterns and generate recommendations.
 */
import type { ConstraintRule, Severity } from '../registry/schema.js';

/**
 * A single recorded violation entry.
 */
export interface ViolationEntry {
  /** The constraint rule that was violated */
  rule: ConstraintRule;
  /** The specific value that caused the violation (e.g., import name) */
  value: string;
  /** Severity of the violation */
  severity: Severity;
  /** File where the violation occurred */
  file: string;
  /** Architecture ID of the file */
  archId: string | null;
  /** ISO timestamp when the violation was recorded */
  timestamp: string;
  /** Whether this violation was overridden */
  wasOverridden: boolean;
}

/**
 * Aggregated statistics for a constraint violation.
 */
export interface ViolationStats {
  /** The constraint rule */
  rule: ConstraintRule;
  /** The specific value (for array constraints like forbid_import) */
  value: string;
  /** Total number of violations */
  count: number;
  /** Number of overrides for this violation */
  overrideCount: number;
  /** Files that have this violation */
  affectedFiles: string[];
  /** Architecture IDs affected */
  affectedArchIds: string[];
  /** First occurrence timestamp */
  firstSeen: string;
  /** Last occurrence timestamp */
  lastSeen: string;
}

/**
 * A recommendation generated from violation patterns.
 */
export interface Recommendation {
  /** Type of recommendation */
  type: 'relax_constraint' | 'add_override' | 'update_architecture' | 'review_pattern';
  /** Priority level (higher = more important) */
  priority: number;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** The constraint rule this recommendation is about */
  rule: ConstraintRule;
  /** The specific value if applicable */
  value?: string;
  /** Suggested action to take */
  suggestedAction: string;
  /** Supporting data (violation count, affected files, etc.) */
  evidence: {
    violationCount: number;
    overrideCount: number;
    affectedFileCount: number;
  };
}

/**
 * Feedback report generated from stored violations.
 */
export interface FeedbackReport {
  /** Report generation timestamp */
  generatedAt: string;
  /** Time period covered by the report */
  period: {
    from: string;
    to: string;
    days: number;
  };
  /** Summary statistics */
  summary: {
    totalViolations: number;
    totalOverrides: number;
    uniqueRules: number;
    uniqueFiles: number;
  };
  /** Top violated constraints */
  topViolations: ViolationStats[];
  /** Generated recommendations */
  recommendations: Recommendation[];
}

/**
 * Stored feedback data structure.
 */
export interface FeedbackData {
  /** Schema version for migrations */
  version: string;
  /** All recorded violation entries */
  entries: ViolationEntry[];
  /** Metadata about the feedback file */
  metadata: {
    createdAt: string;
    lastUpdatedAt: string;
    projectRoot: string;
  };
}
