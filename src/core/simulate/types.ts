/**
 * @arch archcodex.core.types
 *
 * Types for registry simulation (impact analysis).
 */
import type { RegistryDiff } from '../diff/types.js';
import type { Violation } from '../constraints/types.js';

/**
 * Risk level based on impact severity.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Impact category for a file.
 */
export type ImpactType = 'would_break' | 'would_fix' | 'unchanged' | 'new_coverage';

/**
 * Per-file impact details.
 */
export interface FileImpact {
  /** File path */
  file: string;
  /** Architecture ID from @arch tag */
  archId: string | null;
  /** Impact type */
  impact: ImpactType;
  /** Current validation status */
  currentStatus: 'pass' | 'fail' | 'warn' | 'untagged';
  /** Projected status after applying changes */
  projectedStatus: 'pass' | 'fail' | 'warn' | 'untagged';
  /** New violations that would occur */
  newViolations: Violation[];
  /** Violations that would be resolved */
  resolvedViolations: Violation[];
  /** Detailed explanation of impact */
  reason?: string;
}

/**
 * Summary of simulation impact.
 */
export interface SimulationSummary {
  /** Total files scanned */
  filesScanned: number;
  /** Files currently passing validation */
  currentlyPassing: number;
  /** Files currently failing validation */
  currentlyFailing: number;
  /** Files that would break (pass→fail) */
  wouldBreak: number;
  /** Files that would be fixed (fail→pass) */
  wouldFix: number;
  /** Files with no change */
  unchanged: number;
  /** Files that would gain coverage (untagged→tagged) */
  newCoverage: number;
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** Number of architectures added */
  architecturesAdded: number;
  /** Number of architectures removed */
  architecturesRemoved: number;
  /** Number of architectures modified */
  architecturesModified: number;
}

/**
 * Complete simulation result.
 */
export interface SimulationResult {
  /** Source description (e.g., "current" or git ref) */
  fromRef: string;
  /** Target description (e.g., "proposed" or file path) */
  toRef: string;
  /** Registry diff details */
  diff: RegistryDiff;
  /** Per-file impact details */
  fileImpacts: FileImpact[];
  /** Files that would break */
  wouldBreak: FileImpact[];
  /** Files that would be fixed */
  wouldFix: FileImpact[];
  /** Summary statistics */
  summary: SimulationSummary;
  /** Recommendations based on analysis */
  recommendations: string[];
}

/**
 * Options for simulation.
 */
export interface SimulationOptions {
  /** File patterns to scan (default: src/**\/*.ts) */
  filePatterns?: string[];
  /** Include verbose per-file details */
  verbose?: boolean;
  /** Only analyze files matching these architectures */
  filterArchIds?: string[];
  /** Maximum files to analyze (for performance) */
  maxFiles?: number;
}

/**
 * Input for creating a simulation.
 */
export interface SimulationInput {
  /** Path to proposed registry file */
  proposedRegistryPath?: string;
  /** Git ref to compare from (e.g., "main", "HEAD~1") */
  fromRef?: string;
  /** Raw proposed registry content (alternative to path) */
  proposedRegistryContent?: string;
}

/**
 * Format a constraint change for display.
 */
export interface FormattedConstraintChange {
  type: 'added' | 'removed' | 'modified';
  rule: string;
  description: string;
}

/**
 * Format an architecture change for display.
 */
export interface FormattedArchChange {
  archId: string;
  type: 'added' | 'removed' | 'modified';
  description: string;
  constraintChanges?: FormattedConstraintChange[];
}

/**
 * Aggregated changes for human-readable output.
 */
export interface FormattedChanges {
  added: FormattedArchChange[];
  removed: FormattedArchChange[];
  modified: FormattedArchChange[];
}
