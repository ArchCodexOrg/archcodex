/**
 * @arch archcodex.core.types
 *
 * Core type definitions for the schema-inferred analysis engine.
 * Shared across all checkers and the orchestrator.
 */

import type { SpecNode } from '../spec/schema.js';
import type { ComponentGroupsRegistry } from '../registry/component-group-schema.js';
import type { AnalysisDeepPatterns } from '../config/schema.js';

// ---------------------------------------------------------------------------
// Categories & Severities
// ---------------------------------------------------------------------------

export type AnalysisCategory =
  | 'logic'
  | 'security'
  | 'data'
  | 'consistency'
  | 'completeness'
  | 'other';

export type AnalysisSeverity = 'error' | 'warning' | 'info';

const SEVERITY_ORDER: Record<AnalysisSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function compareSeverity(a: AnalysisSeverity, b: AnalysisSeverity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

export function severityAtLeast(
  severity: AnalysisSeverity,
  threshold: AnalysisSeverity,
): boolean {
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
}

// ---------------------------------------------------------------------------
// Core Issue Type
// ---------------------------------------------------------------------------

export interface AnalysisIssue {
  /** Analysis rule ID (e.g., SEC-1, LOG-3, DAT-5) */
  id: string;
  category: AnalysisCategory;
  severity: AnalysisSeverity;
  /** Spec ID where the issue was found */
  specId?: string;
  /** Architecture ID involved in the issue */
  archId?: string;
  /** Specific field or section with the issue */
  field?: string;
  /** Human-readable description of the issue */
  message: string;
  /** How to fix the issue */
  suggestion?: string;
  /** Other specs involved in cross-spec issues */
  relatedSpecs?: string[];
}

// ---------------------------------------------------------------------------
// Summary & Result
// ---------------------------------------------------------------------------

export interface AnalysisSummary {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  specsAnalyzed: number;
}

export interface AnalysisResult {
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AnalysisOptions {
  /** Filter to specific categories */
  categories?: AnalysisCategory[];
  /** Minimum severity threshold (default: info) */
  severity?: AnalysisSeverity;
  /** Filter to specific spec IDs */
  specIds?: string[];
  /** Enable deep analysis — reads implementation files for spec-to-code checks */
  deep?: boolean;
}

// ---------------------------------------------------------------------------
// Cross-Reference Graph
// ---------------------------------------------------------------------------

export interface TableWriter {
  specId: string;
  operation: string;
}

export interface TableReader {
  specId: string;
  inputField: string;
}

export interface CrossReferenceGraph {
  /** Map<entityPrefix, specId[]> — specs grouped by entity */
  entityToSpecs: Map<string, string[]>;
  /** Map<tableName, writers[]> — specs with db write effects */
  tableToWriters: Map<string, TableWriter[]>;
  /** Map<tableName, readers[]> — specs with id inputs referencing table */
  tableToReaders: Map<string, TableReader[]>;
  /** Map<specId, specId[]> — reverse depends_on lookup */
  specDependents: Map<string, string[]>;
  /** Map<archId, specId[]> — specs using each architecture */
  archToSpecs: Map<string, string[]>;
}

// ---------------------------------------------------------------------------
// Resolved Spec (for checker consumption)
// ---------------------------------------------------------------------------

export interface ResolvedSpecEntry {
  specId: string;
  node: SpecNode;
}

// ---------------------------------------------------------------------------
// Deep Analysis Types
// ---------------------------------------------------------------------------

/** Pre-loaded implementation file contents, keyed by spec ID */
export interface ImplementationData {
  /** Raw source code content */
  content: string;
  /** Resolved absolute file path */
  filePath: string;
  /** Function name from implementation field (after #) */
  functionName?: string;
}

/** Summarized verifier drift for bridging into analysis */
export interface VerifierDriftSummary {
  extraErrors: string[];
  missingOutputs: string[];
  extraOutputs: string[];
  architectureMismatch: boolean;
  missingArchTag?: string;
  actualArchTag?: string;
}

// ---------------------------------------------------------------------------
// Checker Interface
// ---------------------------------------------------------------------------

export interface AnalysisContext {
  specs: ResolvedSpecEntry[];
  graph: CrossReferenceGraph;
  archRegistry: Record<string, Record<string, unknown>>;
  componentGroups: ComponentGroupsRegistry;
  /** Pre-loaded implementation contents for deep analysis (--deep) */
  implementationContents?: Map<string, ImplementationData>;
  /** Pre-computed verifier drift results per spec (--deep) */
  verifierResults?: Map<string, VerifierDriftSummary>;
  /** Configurable regex patterns for deep code analysis */
  deepPatterns?: AnalysisDeepPatterns;
  /** Entity namespaces excluded from CRUD coverage checks */
  toolEntities?: string[];
}

export interface Checker {
  id: string;
  name: string;
  category: AnalysisCategory;
  check(context: AnalysisContext): AnalysisIssue[];
}
